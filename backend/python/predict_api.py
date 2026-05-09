from flask import Flask, request, jsonify
import os
import numpy as np
import pandas as pd
from sklearn.neighbors import KNeighborsClassifier
import joblib

app = Flask(__name__)

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
def predict():
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

    return jsonify({
        "prediction": prediction
    })


# ---------------- HEALTHCHECK ----------------
@app.route("/health", methods=["GET"])
def health():
    try:
        return jsonify({
            "ok": True,
            "model_loaded": model is not None,
            "min_len": min_len
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})


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