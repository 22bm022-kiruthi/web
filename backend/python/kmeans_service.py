"""
KMeans clustering service

POST /api/analytics/kmeans
Accepts JSON: { "data": [[...], ...], "n_clusters": 3, "max_iter": 300 }
Returns JSON with labels, centroids, inertia, and optionally 2D projection for plotting.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import traceback

app = Flask(__name__)
CORS(app)


@app.route('/api/analytics/kmeans', methods=['POST'])
def kmeans():
    try:
        payload = request.get_json() or {}
        data = payload.get('data')
        if data is None:
            return jsonify({'error': 'No data provided'}), 400

        import pandas as pd
        from sklearn.cluster import KMeans
        from sklearn.decomposition import PCA

        X = pd.DataFrame(data).values
        n_clusters = int(payload.get('n_clusters', 3))
        max_iter = int(payload.get('max_iter', 300))
        random_state = payload.get('random_state', 42)

        if X.size == 0:
            return jsonify({'error': 'Empty data'}), 400

        model = KMeans(n_clusters=n_clusters, max_iter=max_iter, random_state=random_state)
        model.fit(X)
        labels = model.labels_.tolist()
        inertia = float(model.inertia_)
        centroids = model.cluster_centers_.tolist()

        # provide 2D projection for plotting when dim > 2
        proj = None
        if X.shape[1] > 2:
            pca = PCA(n_components=2)
            proj = pca.fit_transform(X).tolist()
        else:
            proj = X[:, :2].tolist()

        return jsonify({
            'success': True,
            'n_clusters': n_clusters,
            'labels': labels,
            'centroids': centroids,
            'inertia': inertia,
            'projection_2d': proj,
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy', 'service': 'kmeans-analytics'}), 200


if __name__ == '__main__':
    port = 6010
    print(f"Starting KMeans service on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False, threaded=True)
