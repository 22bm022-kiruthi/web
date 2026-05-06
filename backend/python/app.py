from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
from scipy.signal import find_peaks

app = Flask(__name__)
CORS(app)

@app.route("/extract", methods=["POST"])
def extract_features():
    data = request.json["signal"]
    signal = np.array(data)

    peaks, _ = find_peaks(signal)
    num_peaks = len(peaks)

    max_val = np.max(signal)
    avg_val = np.mean(signal)

    return jsonify({
        "peaks": num_peaks,
        "max": float(max_val),
        "avg": float(avg_val)
    })

if __name__ == "__main__":
    # Bind to localhost and disable debug/reloader to avoid the interactive
    # debugger popping up when the service is started programmatically.
    # Use port 6003 to match the Express `py_extract` proxy at 127.0.0.1:6003
    app.run(host='127.0.0.1', port=6003, debug=False, use_reloader=False)