const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// POST /api/analytics/kmeans -> proxy to Python KMeans service, with Node-side fallback
router.post('/kmeans', async (req, res) => {
  const target = process.env.KMEANS_SERVICE_URL || 'http://127.0.0.1:6010/api/analytics/kmeans';
  const body = req.body || {};
  console.log('[kmeans] proxying request to', target);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const resp = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const txt = await resp.text();
    try {
      const json = JSON.parse(txt);
      return res.status(resp.status).json(json);
    } catch (e) {
      return res.status(resp.status).send(txt);
    }
  } catch (err) {
    console.warn('[kmeans] Python service unreachable, falling back to Node KMeans:', String(err));

    // Node-side lightweight KMeans fallback (2D features preferred)
    try {
      const payload = body || {};
      const rows = Array.isArray(payload.data) ? payload.data : [];
      const k = Number(payload.n_clusters) || 3;
      const maxIter = Number(payload.max_iter) || 300;

      // extract numeric keys and pick two features heuristically
      const sample = rows[0] || {};
      const keys = Object.keys(sample);
      const numericKeys = keys.filter((kn) => rows.some(r => !isNaN(Number(r[kn]))));
      const lower = numericKeys.map(kname => kname.toLowerCase());
      const pick = (cands) => { for (const c of cands) { const idx = lower.findIndex(l => l.includes(c)); if (idx >= 0) return numericKeys[idx]; } return numericKeys[0] || null; };
      const xKey = pick(['shift','wavenumber','raman','x']);
      const yKey = pick(['intensity','counts','value','y']);
      const featKeys = [xKey, yKey].filter(Boolean);

      const features = rows.map(r => featKeys.map(kf => { const v = Number(r[kf]); return Number.isFinite(v) ? v : 0; }));
      if (features.length === 0) return res.status(200).json({ labels: [], centroids: [], projection_2d: [] });

      // initialize centroids
      const centroids = [];
      const used = new Set();
      for (let i = 0; i < features.length && centroids.length < k; i++) {
        const key = features[i].join(',');
        if (!used.has(key)) { centroids.push([...features[i]]); used.add(key); }
      }
      while (centroids.length < k) {
        const idx = Math.floor(Math.random() * features.length);
        centroids.push([...features[idx]]);
      }

      let labels = new Array(features.length).fill(0);
      for (let iter = 0; iter < maxIter; iter++) {
        let changed = false;
        for (let i = 0; i < features.length; i++) {
          let best = 0; let bestDist = Infinity;
          for (let c = 0; c < centroids.length; c++) {
            const d = features[i].reduce((acc, val, idx) => acc + Math.pow(val - (centroids[c][idx] ?? 0), 2), 0);
            if (d < bestDist) { bestDist = d; best = c; }
          }
          if (labels[i] !== best) { labels[i] = best; changed = true; }
        }
        const sums = new Array(centroids.length).fill(0).map(() => new Array(features[0].length).fill(0));
        const counts = new Array(centroids.length).fill(0);
        for (let i = 0; i < features.length; i++) {
          const lab = labels[i]; counts[lab]++;
          for (let j = 0; j < features[0].length; j++) sums[lab][j] += features[i][j];
        }
        for (let c = 0; c < centroids.length; c++) {
          if (counts[c] === 0) continue;
          for (let j = 0; j < sums[c].length; j++) centroids[c][j] = sums[c][j] / counts[c];
        }
        if (!changed) break;
      }

      const projection_2d = features;
      return res.status(200).json({ labels, centroids, projection_2d });
    } catch (e2) {
      console.error('[kmeans] Node fallback failed:', e2);
      return res.status(502).json({ error: 'KMeans processing failed in Node', detail: String(e2) });
    }
  }
});

module.exports = router;
