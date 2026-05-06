import os
import pandas as pd

repo_root = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
dataset_dir = os.path.join(repo_root, 'dataset')
if not os.path.exists(dataset_dir):
    print('dataset folder not found:', dataset_dir)
    raise SystemExit(1)

trained = []
skipped = []
for compound in sorted(os.listdir(dataset_dir)):
    folder = os.path.join(dataset_dir, compound)
    if not os.path.isdir(folder):
        continue
    for fn in sorted(os.listdir(folder)):
        path = os.path.join(folder, fn)
        try:
            df = pd.read_csv(path, sep='\t', skiprows=8, header=None)
            if df.shape[1] < 2:
                skipped.append((path, 'not enough columns'))
                continue
            col = df.iloc[:,1]
            if col.dropna().shape[0] == 0:
                skipped.append((path, 'empty second column'))
                continue
            try:
                _ = pd.to_numeric(col.dropna().iloc[:5])
            except Exception as e:
                skipped.append((path, f'parse error {e}'))
                continue
            trained.append(path)
        except Exception as e:
            skipped.append((path, repr(e)))

trained_file = os.path.join(os.path.dirname(__file__), 'trained_files.txt')
skipped_file = os.path.join(os.path.dirname(__file__), 'skipped_files.txt')

with open(trained_file, 'w', encoding='utf8') as f:
    for p in trained:
        f.write(p + '\n')

with open(skipped_file, 'w', encoding='utf8') as f:
    for p, reason in skipped:
        f.write(p + ' -> ' + reason + '\n')

print(f'Wrote {len(trained)} parsed (trained) files to: {trained_file}')
print(f'Wrote {len(skipped)} skipped files to: {skipped_file}')
