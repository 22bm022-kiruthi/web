from flask import Flask, request, jsonify
import pandas as pd
from sklearn.linear_model import LogisticRegression
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
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            db = firestore.client()
    except Exception:
        db = None

app = Flask(__name__)

# Train once (when server starts)
# Expects a CSV named "dataset.csv" in the same folder with columns: peaks,max,avg,label
try:
    df = pd.read_csv("dataset.csv")
except Exception as e:
    print("Could not read dataset.csv:", e)
    df = pd.DataFrame(columns=['peaks','max','avg','label'])

if df.shape[0] >= 1:
    X = df[['peaks','max','avg']]
    y = df['label']
    model = LogisticRegression(max_iter=200)
    try:
        model.fit(X, y)
        print("Model trained ✅")
        # compute simple test summary
        try:
            from sklearn.model_selection import train_test_split
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            test_preds = model.predict(X_test)
            # create a concise summary string
            uniq = list(set(test_preds.astype(str)))
            if len(uniq) == 1:
                test_summary = uniq[0]
            else:
                # show counts
                from collections import Counter
                cnt = Counter(test_preds.astype(str))
                test_summary = ', '.join([f"{k}:{v}" for k, v in cnt.items()])
        except Exception:
            test_summary = None
        # sample new-data prediction for quick reference (non-used by API)
        try:
            sample_new = [[2, 15000, 9000]]
            sample_pred = model.predict(sample_new)[0]
        except Exception:
            sample_pred = None
    except Exception as e:
        print("Model training failed:", e)
        model = None
else:
    print("dataset.csv is empty or missing — model will be unavailable")
    model = None

@app.route("/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"error": "Model not available"}), 503
    data = request.json or {}
    try:
        new_data = pd.DataFrame([[
            data.get('peaks', 0),
            data.get('max', 0),
            data.get('avg', 0)
        ]], columns=['peaks','max','avg'])
        result = model.predict(new_data)[0]
        resp = {"prediction": result}
        # include startup test summary if available
        try:
            if 'test_summary' in globals() and test_summary is not None:
                resp['test_output'] = test_summary
        except Exception:
            pass
        try:
            if 'sample_pred' in globals() and sample_pred is not None:
                resp['sample_prediction'] = sample_pred
        except Exception:
            pass
        # Optionally push prediction and features to Firestore
        try:
            if db is not None:
                coll = os.environ.get('FIRESTORE_COLLECTION_PREDICT', 'predictions')
                doc = {
                    'timestamp': int(time.time()),
                    'features': new_data.to_dict(orient='records')[0],
                    'prediction': result,
                    'request': data
                }
                db.collection(coll).add(doc)
        except Exception:
            pass

        return jsonify(resp)
    except Exception as e:
        return jsonify({"error": "Prediction failed", "detail": str(e)}), 500

if __name__ == '__main__':
    app.run(port=6004)
