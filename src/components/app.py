from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials, firestore
import os

app = Flask(__name__)

# Connect Firebase


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
service_key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")
db = None
if os.path.exists(service_key_path):
    try:
        cred = credentials.Certificate(service_key_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
    except Exception as e:
        # If Firebase init fails, log and continue without Firestore
        print('Firebase initialization failed:', e)
        db = None
else:
    print('Warning: serviceAccountKey.json not found — Firestore disabled')

@app.route("/predict", methods=["POST"])
def predict():
    payload = request.get_json(force=True) or {}

    # Accept either a raw signal array or pre-computed features
    signal = None
    features = {}
    if isinstance(payload, dict) and 'signal' in payload and isinstance(payload['signal'], list):
        signal = payload['signal']
    # features-style payload: { peaks, max, avg }
    if isinstance(payload, dict):
        if 'peaks' in payload and 'max' in payload and 'avg' in payload:
            features = { 'peaks': payload.get('peaks'), 'max': payload.get('max'), 'avg': payload.get('avg') }

    # If signal provided, compute simple features
    computed = {}
    try:
        if signal is not None and isinstance(signal, list) and len(signal) > 0:
            vals = [float(x) for x in signal if isinstance(x, (int, float)) or (isinstance(x, str) and str(x).replace('.', '', 1).isdigit())]
            if vals:
                mx = max(vals)
                avg = sum(vals) / len(vals)
                peaks = 0
                for i in range(1, len(vals) - 1):
                    if vals[i] > vals[i - 1] and vals[i] > vals[i + 1]:
                        peaks += 1
                computed = { 'peaks': peaks, 'max': mx, 'avg': avg }
    except Exception:
        computed = {}

    # Prefer provided features, else computed
    final_features = features or computed or {}
    max_val = final_features.get('max') if final_features.get('max') is not None else 0

    # Simple decision rule (keeps previous behaviour)
    result = "Abnormal" if float(max_val) > 100 else "Normal"

    doc_id = None
    write_time_str = None
    # Push to Firestore (only if configured)
    try:
        if db is not None:
            doc_data = {
                'features': final_features,
                'result': result,
                'max_value': max_val,
            }
            if signal is not None:
                doc_data['signal'] = signal
            doc_ref, write_time = db.collection('spectroscopy_results').add(doc_data)
            try:
                doc_id = getattr(doc_ref, 'id', None)
            except Exception:
                doc_id = None
            try:
                # write_time may be a datetime-like object
                write_time_str = write_time.isoformat() if hasattr(write_time, 'isoformat') else str(write_time)
            except Exception:
                write_time_str = str(write_time)
            try:
                print(f'Firestore: added document id={doc_id} at {write_time_str}')
            except Exception:
                print('Firestore: add succeeded')
    except Exception as e:
        print('Warning: failed to write to Firestore:', e)

    resp = { 'result': result }
    if doc_id:
        resp['docId'] = doc_id
    if write_time_str:
        resp['writeTime'] = write_time_str
    if final_features:
        resp['features'] = final_features

    return jsonify(resp)

if __name__ == '__main__':
    app.run()