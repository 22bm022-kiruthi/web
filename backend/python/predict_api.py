from flask import Flask, request, jsonify
import os
import numpy as np
import pandas as pd
from flask_cors import CORS
from sklearn.neighbors import KNeighborsClassifier
import joblib

app = Flask(__name__)
# enable CORS for direct browser calls during development
try:
    CORS(app)
    print('CORS enabled')
except Exception:
    print('flask_cors not available; CORS not enabled')

# ---------------- FIREBASE ----------------
db = None
try:
    # Make Firebase optional: import only if credentials/path present
    import firebase_admin
    from firebase_admin import credentials, firestore
    cred_path = os.environ.get("FIREBASE_CRED_PATH", "serviceAccountKey.json")
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Firebase Connected ✔")
except Exception:
    print("Firebase not connected")

try:
    # enable CORS for direct browser calls during development
    cors_available = True
except Exception:
    cors_available = False

# ---------------- MODEL LOADING / TRAINING ----------------
script_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.path.join(script_dir, 'model.joblib')
min_len = None
model = None

if os.path.exists(model_path):
    try:
        data = joblib.load(model_path)
        model = data.get('model')
        min_len = data.get('min_len')
        print('Loaded model from', model_path)
    except Exception as e:
        print('Failed to load model.joblib:', e)

if model is None:
    # Fallback: train on startup (existing behavior)
    X = []
    y = []

    # Resolve dataset path robustly: prefer the repository-level `dataset/` folder
    dataset_path = os.path.normpath(os.path.join(script_dir, '..', '..', 'dataset'))
    if not os.path.exists(dataset_path):
        dataset_path = os.path.normpath(os.path.join(script_dir, 'dataset'))

    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Dataset directory not found. Checked: {dataset_path}")

    print('Using dataset path:', dataset_path)

    for compound in os.listdir(dataset_path):
        folder = os.path.join(dataset_path, compound)
        if not os.path.isdir(folder):
            continue
        for file in os.listdir(folder):
            path = os.path.join(folder, file)
            try:
                df = pd.read_csv(path, sep="\t", skiprows=8, header=None)
                intensity = df.iloc[:, 1].values.astype(float)
                # normalize
                if np.max(intensity) - np.min(intensity) != 0:
                    intensity = (intensity - np.min(intensity)) / (np.max(intensity) - np.min(intensity))
                X.append(intensity)
                y.append(compound)
            except Exception:
                continue

    # fix length issue
    if not X:
        raise RuntimeError('No spectral data found to train model')
    min_len = min(len(i) for i in X)
    X = [i[:min_len] for i in X]

    # model (KNN kept as lightweight default)
    model = KNeighborsClassifier(n_neighbors=3)
    model.fit(X, y)

    # save model for future fast load
    try:
        joblib.dump({'model': model, 'min_len': min_len}, model_path)
        print('Saved trained model to', model_path)
    except Exception as e:
        print('Failed to save model.joblib:', e)

    print("Spectral ML Model Ready ✔")

# ---------------- PREDICT API ----------------
@app.route("/predict", methods=["POST"])
@app.route("/api/predict", methods=["POST", "OPTIONS"])
def predict():
    # Handle CORS preflight quickly
    if request.method == 'OPTIONS':
        return jsonify({}), 200

    data = request.json or {}

    signal = data.get("signal", [])

    try:
        vals = np.array(signal, dtype=float).flatten()

        if vals.size == 0:
            raise ValueError('Empty signal')

        # If incoming signal length differs from training `min_len`, resample (linear interp)
        if vals.size != min_len:
            try:
                x_old = np.linspace(0.0, 1.0, num=vals.size)
                x_new = np.linspace(0.0, 1.0, num=min_len)
                vals = np.interp(x_new, x_old, vals)
            except Exception:
                # fallback: pad or trim
                if vals.size < min_len:
                    pad = np.zeros(min_len - vals.size)
                    vals = np.concatenate([vals, pad])
                else:
                    vals = vals[:min_len]

        # normalize after resampling/padding
        if np.max(vals) - np.min(vals) != 0:
            vals = (vals - np.min(vals)) / (np.max(vals) - np.min(vals))

        vals = vals.reshape(1, -1)

        prediction = model.predict(vals)[0]

        # Explainability: return class probabilities (if available), top-3 candidates,
        # and the processed vector that was fed to the model.
        processed_vector = vals.flatten().tolist()
        probabilities = None
        top3 = None
        try:
            if hasattr(model, 'predict_proba'):
                prob_arr = model.predict_proba(vals)[0]
                classes = list(model.classes_)
                probabilities = {str(c): float(p) for c, p in zip(classes, prob_arr)}
                # top-3
                idx = prob_arr.argsort()[::-1][:3]
                top3 = [{"class": str(classes[i]), "prob": float(prob_arr[i])} for i in idx]
        except Exception:
            probabilities = None
            top3 = None

    except Exception as e:
        return jsonify({"error": str(e)})

    # save to firebase (optional)
    try:
        if db:
            db.collection("predictions").add({
                "signal": signal,
                "prediction": prediction
            })
    except:
        pass

    resp = {"prediction": prediction}
    try:
        if probabilities is not None:
            resp['probabilities'] = probabilities
        if top3 is not None:
            resp['top3'] = top3
        resp['processed_vector'] = processed_vector
    except Exception:
        pass
    # Audit: persist incoming request and response so devs can replay exact payloads
    try:
        logs_dir = os.path.normpath(os.path.join(script_dir, '..', 'uploads', 'predict-logs'))
        os.makedirs(logs_dir, exist_ok=True)
        now = datetime = __import__('datetime').datetime.utcnow().isoformat().replace(':', '-').replace('.', '-')
        fname = f'pred-{now}.json'
        fpath = os.path.join(logs_dir, fname)
        audit = {'timestamp': __import__('datetime').datetime.utcnow().isoformat(), 'request': data, 'response': resp}
        try:
            with open(fpath, 'w', encoding='utf-8') as af:
                import json as _json
                _json.dump(audit, af, indent=2)
            print('[predict_api] saved audit log ->', fpath)
        except Exception as _e:
            print('[predict_api] failed to write audit log', _e)
    except Exception:
        pass
    return jsonify(resp)


# ---------------- HEALTHCHECK ----------------
@app.route("/health", methods=["GET"])
def health():
    # Support CORS preflight for `/api/health` as well when frontend calls `/api/health`.
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    try:
        return jsonify({
            "ok": True,
            "model_loaded": model is not None,
            "min_len": min_len
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


# Alias so dev-server proxy requests to `/api/health` are handled (preflight + GET)
@app.route("/api/health", methods=["GET", "OPTIONS"])
def api_health():
    if request.method == 'OPTIONS':
        return jsonify({}), 200
    return health()


# ---------------- RUN ----------------
if __name__ == "__main__":
    # Bind to host/port provided by the environment (Render sets PORT).
    port = int(os.environ.get("PORT", os.environ.get("PY_PREDICT_PORT", 6004)))
    host = os.environ.get("HOST", "0.0.0.0")
    # Disable debugger and reloader for production use and when spawned.
    app.run(host=host, port=port, debug=False, use_reloader=False)

# ---------------- RUN ----------------
if __name__ == "__main__":
    # Bind to host/port provided by the environment (Render sets PORT).
    port = int(os.environ.get("PORT", os.environ.get("PY_PREDICT_PORT", 6004)))
    host = os.environ.get("HOST", "0.0.0.0")
    # Disable debugger and reloader for production use and when spawned.
    app.run(host=host, port=port, debug=False, use_reloader=False)