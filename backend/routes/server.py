from flask import Flask, request, jsonify
import numpy as np
from scipy.signal import find_peaks

app = Flask(__name__)

@app.route("/extract", methods=["POST"])
def extract():
    data = request.json
    signal = np.array(data["signal"])

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
    app.run(port=6003, debug=True)