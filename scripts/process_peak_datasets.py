#!/usr/bin/env python
import os
import glob
import pandas as pd
import numpy as np
from scipy.signal import find_peaks

samples_dir = os.path.join(os.path.dirname(__file__), '..', 'samples')
out_summary = os.path.join(samples_dir, 'peak_summary.csv')
out_peaks = os.path.join(samples_dir, 'peak_peaks.csv')

files = sorted(glob.glob(os.path.join(samples_dir, 'peak_dataset_*.csv')))
rows = []
peaks_rows = []

for f in files:
    df = pd.read_csv(f)
    name = os.path.basename(f)
    # find intensity column
    y_cols = [c for c in df.columns if 'intens' in c.lower() or c.lower() in ('y','intensity')]
    if len(y_cols) == 0:
        # fallback: first numeric column after shift
        y_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    ycol = y_cols[0]
    vals = pd.to_numeric(df[ycol], errors='coerce').dropna().astype(float).to_numpy()
    n = len(vals)
    mean = float(np.mean(vals)) if n>0 else 0.0
    median = float(np.median(vals)) if n>0 else 0.0
    std = float(np.std(vals)) if n>0 else 0.0
    mn = float(np.min(vals)) if n>0 else 0.0
    mx = float(np.max(vals)) if n>0 else 0.0
    rng = mx - mn
    # detect peaks
    if n>0:
        # use prominence relative to dynamic range
        prominence = max(1.0, 0.05 * (mx - mn))
        peaks_idx, props = find_peaks(vals, prominence=prominence)
    else:
        peaks_idx = np.array([], dtype=int)
        props = {'prominences': np.array([])}

    rows.append({
        'file': name,
        'intensity_column': ycol,
        'num_points': n,
        'mean': mean,
        'median': median,
        'std': std,
        'min': mn,
        'max': mx,
        'range': rng,
        'num_peaks': len(peaks_idx)
    })

    for i, idx in enumerate(peaks_idx):
        peaks_rows.append({
            'file': name,
            'peak_number': i+1,
            'index': int(idx),
            'position': float(df.iloc[idx][df.columns[0]] if df.columns[0] else idx),
            'intensity': float(vals[idx]),
            'prominence': float(props['prominences'][i]) if 'prominences' in props and i < len(props['prominences']) else None
        })

pd.DataFrame(rows).to_csv(out_summary, index=False)
pd.DataFrame(peaks_rows).to_csv(out_peaks, index=False)

print('Wrote', out_summary)
print('Wrote', out_peaks)
