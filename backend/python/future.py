from flask import Flask, request, jsonify
import numpy as np
import os
import json
import time
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except Exception:
    FIREBASE_AVAILABLE = False

# Initialize Firestore client if configured
db = None
if FIREBASE_AVAILABLE:
    cred_path = os.environ.get('FIREBASE_CRED_PATH')
    cred_json = os.environ.get('FIREBASE_CRED_JSON')
    try:
        if cred_path:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
        elif cred_json:
            # cred_json should be full service account JSON string
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
    except Exception:
        db = None

app = Flask(__name__)

try:
    from scipy.signal import find_peaks
    SCIPY_AVAILABLE = True
except Exception:
    SCIPY_AVAILABLE = False


def simple_find_peaks(signal, threshold=0, min_distance=1):
    peaks = []
    n = len(signal)
    for i in range(min_distance, n - min_distance):
        val = signal[i]
        if val <= threshold:
            continue
        is_peak = True
        for j in range(1, min_distance + 1):
            if signal[i - j] >= val or signal[i + j] >= val:
                is_peak = False
                break
        if is_peak:
            peaks.append(i)
    return np.array(peaks, dtype=int)


@app.route('/extract', methods=['POST'])
def extract():
    body = request.get_json(force=True) or {}
    signal = body.get('signal') or body.get('intensities') or []
    shifts = body.get('shifts') or body.get('positions') or None
    threshold = body.get('threshold', 0.3)
    min_distance = int(body.get('min_distance', body.get('minDistance', 1)))

    try:
        arr = np.array(signal, dtype=float)
    except Exception:
        return jsonify({'error': 'Invalid signal array'}), 400

    if arr.size == 0:
        return jsonify({'error': 'Empty signal'}), 400

    # Interpret threshold <= 1 as fraction of max value
    data_max = float(np.max(arr)) if arr.size > 0 else 0.0
    eff_threshold = (data_max * threshold) if (0 < threshold <= 1) else threshold

    if SCIPY_AVAILABLE:
        # Use scipy's find_peaks with height and distance
        kwargs = {}
        if eff_threshold is not None:
            kwargs['height'] = eff_threshold
        if min_distance and min_distance > 0:
            kwargs['distance'] = min_distance
        peaks_idx, props = find_peaks(arr, **kwargs)
    else:
        peaks_idx = simple_find_peaks(arr, threshold=eff_threshold, min_distance=min_distance)
        props = {}

    peaks_list = []
    for idx in peaks_idx:
        pos = float(shifts[idx]) if shifts is not None and idx < len(shifts) else float(idx)
        peaks_list.append({'index': int(idx), 'position': pos, 'intensity': float(arr[idx])})

    result = {
        'num_peaks': int(len(peaks_list)),
        'peaks': peaks_list,
        'max': float(data_max),
        'avg': float(np.mean(arr)),
        'effective_threshold': float(eff_threshold)
    }

    # Optionally push extraction result to Firestore
    try:
        if db is not None:
            coll = os.environ.get('FIRESTORE_COLLECTION_EXTRACT', 'extractions')
            doc = {
                'timestamp': int(time.time()),
                'request': body,
                'result': result
            }
            db.collection(coll).add(doc)
    except Exception:
        # Do not block response on Firestore errors
        pass

    return jsonify(result)


if __name__ == '__main__':
    print("Starting peak extraction Flask service on 127.0.0.1:6003")
    app.run(host='127.0.0.1', port=6003, debug=False)
