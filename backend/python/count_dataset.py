import os
import pandas as pd

repo_root = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
dataset_dir = os.path.join(repo_root, 'dataset')
if not os.path.exists(dataset_dir):
    print('dataset folder not found:', dataset_dir)
    raise SystemExit(1)

summary = {}
skipped = []
for compound in sorted(os.listdir(dataset_dir)):
    folder = os.path.join(dataset_dir, compound)
    if not os.path.isdir(folder):
        continue
    count = 0
    for fn in sorted(os.listdir(folder)):
        path = os.path.join(folder, fn)
        try:
            df = pd.read_csv(path, sep='\t', skiprows=8, header=None)
            # require at least 2 columns and numeric in 2nd column
            if df.shape[1] < 2:
                skipped.append((path, 'not enough columns'))
                continue
            col = df.iloc[:,1]
            if col.dropna().shape[0] == 0:
                skipped.append((path, 'empty second column'))
                continue
            # try convert first few to float
            try:
                _ = pd.to_numeric(col.dropna().iloc[:5])
            except Exception as e:
                skipped.append((path, f'parse error {e}'))
                continue
            count += 1
        except Exception as e:
            skipped.append((path, repr(e)))
    summary[compound] = count

print('Per-compound parsed file counts:')
total = 0
for c, n in summary.items():
    print(f'{c}: {n}')
    total += n
print('\nTotal parsed files:', total)
print('\nSample skipped files (up to 20):')
for s in skipped[:20]:
    print(s[0], '->', s[1])

print('\nTotal skipped files:', len(skipped))
