#!/usr/bin/env python
"""Generate 5 synthetic Raman spectra CSV files with clear peaks.

Creates files in `samples/`:
 - samples/peak_dataset_1.csv
 - samples/peak_dataset_2.csv
 - samples/peak_dataset_3.csv
 - samples/peak_dataset_4.csv
 - samples/peak_dataset_5.csv

Columns: Raman Shift,Raman intensity,Sample name
"""
import os
import numpy as np
import pandas as pd

out_dir = os.path.join(os.path.dirname(__file__), '..', 'samples')
os.makedirs(out_dir, exist_ok=True)

shifts = np.arange(400, 2401, 20)  # 400..2400 step 20 (101 points)

def gaussian(x, mu, sigma, amp):
    return amp * np.exp(-0.5 * ((x - mu) / sigma) ** 2)

datasets = [
    # (name, list of peaks as (mu, sigma, amp))
    ('Dataset A - Polystyrene-like', [(980, 20, 12000), (1700, 30, 15000)]),
    ('Dataset B - Two narrow peaks', [(600, 10, 6000), (1400, 10, 8000)]),
    ('Dataset C - Broad peak + shoulder', [(1200, 80, 10000), (1260, 20, 4000)]),
    ('Dataset D - Multiple small peaks', [(500, 15, 3000), (820, 12, 4200), (1580, 12, 3800), (2320, 10, 2500)]),
    ('Dataset E - Low baseline, strong isolated peak', [(1000, 25, 16000)])
]

for i, (name, peaks) in enumerate(datasets, start=1):
    baseline = 800 + 50 * np.sin(shifts / 300.0)  # gentle baseline
    intensity = baseline.copy()
    for mu, sigma, amp in peaks:
        intensity += gaussian(shifts, mu, sigma, amp)
    # add small random noise
    rng = np.random.RandomState(100 + i)
    intensity += rng.normal(scale=50.0, size=shifts.shape)

    df = pd.DataFrame({
        'Raman Shift': shifts,
        'Raman intensity': np.round(intensity, 4),
        'Sample name': [name] * len(shifts)
    })

    out_path = os.path.join(out_dir, f'peak_dataset_{i}.csv')
    df.to_csv(out_path, index=False)
    print('Wrote', out_path)

print('All datasets generated in samples/ directory')
