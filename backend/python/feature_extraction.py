import sys
import json
import numpy as np
from scipy.signal import find_peaks

# Read input from Node.js
data = json.loads(sys.stdin.read())

signal = np.array(data["signal"])

# Optional parameters
prominence = data.get('prominence', None)
distance = data.get('distance', None)

# Build kwargs for scipy.find_peaks
kwargs = {}
if prominence is not None:
    try:
        kwargs['prominence'] = float(prominence)
    except:
        pass
if distance is not None:
    try:
        kwargs['distance'] = int(distance)
    except:
        pass

peaks, _ = find_peaks(signal, **kwargs)
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