import pandas as pd
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'sample_full_spectrum.csv'
df = pd.read_csv(path)
col = 'Raman intensity'
if col not in df.columns:
    print('ERROR: column not found. columns=', list(df.columns))
    sys.exit(2)

vals = df[col].dropna().astype(float)
print('rows', len(df))
print('mean', float(vals.mean()))
print('sum', float(vals.sum()))
print('min', float(vals.min()))
print('max', float(vals.max()))
