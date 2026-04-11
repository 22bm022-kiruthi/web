#!/usr/bin/env python
"""Extract peak values from a Raman CSV and write peaks to a new CSV.

Input CSV expected columns: `Raman Shift`, `Raman intensity`, `Sample name`.
Outputs `sample_peaks.csv` by default with columns: Sample, PeakShift, PeakIntensity, PeakIndex
"""
import argparse
import pandas as pd
import numpy as np
from scipy.signal import find_peaks


def extract_peaks(df, shift_col='Raman Shift', intensity_col='Raman intensity', sample_col='Sample name'):
    out_rows = []
    if sample_col in df.columns:
        groups = df.groupby(sample_col)
    else:
        groups = [(None, df)]

    for sample_name, g in groups:
        g_sorted = g.sort_values(by=shift_col)
        shifts = g_sorted[shift_col].to_numpy()
        intens = g_sorted[intensity_col].to_numpy()

        # detect peaks; tune parameters here if needed
        peaks, _ = find_peaks(intens, prominence=0.01 * (np.max(intens) - np.min(intens)))

        for idx in peaks:
            out_rows.append({
                'Sample': sample_name if sample_name is not None else '',
                'PeakShift': float(shifts[idx]),
                'PeakIntensity': float(intens[idx]),
                'PeakIndex': int(idx)
            })

    return pd.DataFrame(out_rows)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('input', nargs='?', default='sample_full_spectrum.csv')
    p.add_argument('output', nargs='?', default='sample_peaks.csv')
    args = p.parse_args()

    df = pd.read_csv(args.input)
    peaks_df = extract_peaks(df)
    peaks_df.to_csv(args.output, index=False)
    print(f'Wrote {len(peaks_df)} peaks to {args.output}')


if __name__ == '__main__':
    main()
