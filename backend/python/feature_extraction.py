import sys
import json
import numpy as np
from scipy.signal import find_peaks

# Read input from Node.js
data = json.loads(sys.stdin.read())

signal = np.array(data["signal"])

peaks, _ = find_peaks(signal)
num_peaks = len(peaks)

max_val = np.max(signal)
avg_val = np.mean(signal)

# Send output back
result = {
    "peaks": num_peaks,
    "max": float(max_val),
    "avg": float(avg_val)
}

print(json.dumps(result))