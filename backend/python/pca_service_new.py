"""
PCA Service
Accepts JSON POST with tableData (array of objects) and params: n_components (int), standardize (bool)
Returns transformed components, explained_variance_ratio, cumulative_variance
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import traceback
import numpy as np
import pandas as pd

app = Flask(__name__)
CORS(app)

@app.route('/api/pca/health', methods=['GET'])
def pca_health():
    """Simple health check endpoint so the Node backend (and you) can verify service availability."""
    return jsonify({'status': 'ok'}), 200


def select_numeric_dataframe(table_data):
    """Return pandas DataFrame containing only numeric columns. If none found, try heuristics."""
    if not isinstance(table_data, list) or len(table_data) == 0:
        return pd.DataFrame()

    df = pd.DataFrame(table_data)
    # coerce non-numeric to NaN then select numeric dtypes
    for col in df.columns:
        try:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        except Exception:
            df[col] = df[col]

    numeric_df = df.select_dtypes(include=[np.number])
    if numeric_df.shape[1] > 0:
        return numeric_df.dropna(axis=1, how='all')

    # Heuristic: look for intensity-like columns
    candidates = [c for c in df.columns if any(k in c.lower() for k in ['intensity', 'signal', 'counts', 'y', 'int'])]
    if candidates:
        try:
            return df[candidates].apply(pd.to_numeric, errors='coerce')
        except Exception:
            return pd.DataFrame()

    return pd.DataFrame()


@app.route('/api/pca', methods=['POST'])
def run_pca():
    try:
        body = request.get_json() or {}
        table = body.get('tableData') or body.get('data') or []
        params = body.get('params') or body.get('pcaParams') or {}

        n_components = int(params.get('n_components') or params.get('nComponents') or 2)
        standardize = bool(params.get('standardize') if 'standardize' in params else params.get('scale', True))

        df_num = select_numeric_dataframe(table)
        if df_num.empty:
            return jsonify({'error': 'No numeric columns found for PCA', 'transformed': [], 'explained_variance_ratio': []}), 400

        X = df_num.values.astype(float)

        # Lazy import sklearn to keep startup fast when unavailable
        try:
            from sklearn.decomposition import PCA
            from sklearn.preprocessing import StandardScaler
        except Exception as e:
            return jsonify({'error': 'scikit-learn not available on server: ' + str(e)}), 500

        # Adjust n_components upper bound
        max_comp = min(X.shape[0], X.shape[1])
        if n_components <= 0:
            n_components = min(2, max_comp)
        if n_components > max_comp:
            n_components = max_comp

        if standardize:
            scaler = StandardScaler()
            X_proc = scaler.fit_transform(X)
        else:
            X_proc = X - np.mean(X, axis=0)

        pca = PCA(n_components=n_components)
        transformed = pca.fit_transform(X_proc)

        explained = pca.explained_variance_ratio_.tolist()
        cumulative = np.cumsum(pca.explained_variance_ratio_).tolist()

        # Build transformed table rows with PC names
        pc_names = [f'PC{i+1}' for i in range(transformed.shape[1])]
        transformed_rows = [dict(zip(pc_names, row.tolist())) for row in transformed]

        return jsonify({
            'transformed': transformed_rows,
            'components_matrix': pca.components_.tolist(),
            'explained_variance_ratio': explained,
            'cumulative_variance': cumulative,
            'used_columns': df_num.columns.tolist(),
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e), 'trace': traceback.format_exc()}), 500


if __name__ == '__main__':
    port = 6005
    print(f"Starting PCA Service on port {port}...")
    try:
        app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False, threaded=True)
    except Exception as e:
        print('ERROR starting PCA Flask service:', e)
