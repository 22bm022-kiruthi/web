from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, firestore
import os
import pandas as pd
import numpy as np
from sklearn.neighbors import KNeighborsClassifier

app = Flask(__name__)
CORS(app)

# ---------------- HOME ----------------
@app.route("/")
def home():
    return "Backend Running!"

# ---------------- FIREBASE SETUP ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
service_key_path = os.path.join(BASE_DIR, "serviceAccountKey.json")

db = None
if os.path.exists(service_key_path):
    try:
        cred = credentials.Certificate(service_key_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Firebase Connected!")
    except Exception as e:
        print("Firebase Error:", e)
        db = None
else:
    print("No Firebase Key Found")

# ---------------- ML MODEL TRAINING ----------------
X = []
y = []

dataset_path = "dataset"

for compound in os.listdir(dataset_path):
    compound_path = os.path.join(dataset_path, compound)
    
    for file in os.listdir(compound_path):
        file_path = os.path.join(compound_path, file)
        
        try:
            df = pd.read_csv(file_path, sep="\t", skiprows=8, header=None)
            intensity = df.iloc[:, 1].values
            
            if len(intensity) < 50:
                continue
            
            if np.max(intensity) - np.min(intensity) == 0:
                continue
            
            intensity = (intensity - np.min(intensity)) / (np.max(intensity) - np.min(intensity))
            
            X.append(intensity)
            y.append(compound)
        
        except:
            continue

# Make all same length
min_len = min(len(i) for i in X)
X = [i[:min_len] for i in X]

model = KNeighborsClassifier(n_neighbors=3)
model.fit(X, y)

print("ML Model Ready!")

# ---------------- PREDICT FUNCTION ----------------
def predict_signal(signal):
    try:
        vals = np.array([float(x) for x in signal])

        if np.max(vals) - np.min(vals) == 0:
            return "Invalid Data"

        vals = (vals - np.min(vals)) / (np.max(vals) - np.min(vals))
        vals = vals[:min_len]
        vals = vals.reshape(1, -1)

        prediction = model.predict(vals)[0]
        return prediction

    except Exception as e:
        print("Prediction Error:", e)
        return "Error"

# ---------------- API ----------------
@app.route("/predict", methods=["POST"])
def predict():
    data = request.get_json(force=True) or {}

    signal = data.get("signal", [])

    prediction = predict_signal(signal)

    # Save to Firebase
    doc_id = None
    try:
        if db is not None:
            doc_ref = db.collection("spectroscopy_results").add({
                "signal": signal,
                "prediction": prediction
            })
            doc_id = doc_ref[1]
    except Exception as e:
        print("Firestore Error:", e)

    return jsonify({
        "prediction": prediction,
        "docId": str(doc_id) if doc_id else None
    })

# ---------------- RUN ----------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)