from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from scipy.signal import find_peaks

app = Flask(__name__)
CORS(app)

@app.route("/health", methods=["GET"])
def health():
    return "OK", 200

@app.route("/upload", methods=["POST"])
def upload():
    data = request.json["signal"]
    signal = np.array(data)

    peaks, _ = find_peaks(signal)

    return jsonify({
        "num_peaks": len(peaks),
        "max_value": float(np.max(signal)),
        "avg_value": float(np.mean(signal))
    })

if __name__ == "__main__":
    # Bind to localhost and disable debug/reloader to avoid the interactive
    # debugger popping up when the service is started programmatically.
    # Use port 6003 to match the Express `py_extract` proxy at 127.0.0.1:6003
    app.run(host='127.0.0.1', port=6003, debug=False, use_reloader=False)