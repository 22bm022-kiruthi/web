import os
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
import joblib


def load_dataset(dataset_dir):
    X = []
    y = []
    min_len = None
    for compound in sorted(os.listdir(dataset_dir)):
        folder = os.path.join(dataset_dir, compound)
        if not os.path.isdir(folder):
            continue
        for fn in os.listdir(folder):
            path = os.path.join(folder, fn)
            try:
                df = pd.read_csv(path, sep='\t', skiprows=8, header=None)
                intensity = df.iloc[:, 1].astype(float).values
                if min_len is None or len(intensity) < min_len:
                    min_len = len(intensity) if min_len is None else min(min_len, len(intensity))
                X.append(intensity)
                y.append(compound)
            except Exception as e:
                print('Skipping', path, 'error:', e)
    return X, y, min_len


def preprocess(X, min_len):
    Xp = []
    for xi in X:
        if len(xi) >= min_len:
            xi2 = xi[:min_len]
        else:
            xi2 = np.pad(xi, (0, min_len - len(xi)))
        # normalize
        if xi2.max() - xi2.min() != 0:
            xi2 = (xi2 - xi2.min()) / (xi2.max() - xi2.min())
        Xp.append(xi2)
    return np.vstack(Xp)


def main():
    repo_root = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
    dataset_dir = os.path.join(repo_root, 'dataset')
    if not os.path.exists(dataset_dir):
        raise FileNotFoundError('dataset directory not found at ' + dataset_dir)

    print('Loading dataset from', dataset_dir)
    X, y, min_len = load_dataset(dataset_dir)
    if not X:
        raise RuntimeError('No data found')

    print('Samples found:', len(X), 'min_len:', min_len)
    Xp = preprocess(X, min_len)
    y = np.array(y)

    X_train, X_val, y_train, y_val = train_test_split(Xp, y, test_size=0.2, stratify=y, random_state=42)

    print('Training RandomForest...')
    model = RandomForestClassifier(n_estimators=200, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)

    pred = model.predict(X_val)
    print('Validation results:')
    print(classification_report(y_val, pred))
    print('Confusion matrix:\n', confusion_matrix(y_val, pred))

    out_path = os.path.join(os.path.dirname(__file__), 'model.joblib')
    joblib.dump({'model': model, 'min_len': min_len}, out_path)
    print('Saved model to', out_path)


if __name__ == '__main__':
    main()
