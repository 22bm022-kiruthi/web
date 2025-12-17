const express = require('express');
const fetch = require('node-fetch');
const router = express.Router();

// POST /api/pca -> proxy to Python PCA service
router.post('/', async (req, res) => {
  const target = process.env.PCA_SERVICE_URL || 'http://127.0.0.1:6005/api/pca';
  const body = req.body || {};
  console.log('[pca] proxying request to', target);
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
    console.warn('[pca] Python service unreachable:', String(err));
    return res.status(502).json({ error: 'PCA service unreachable', detail: String(err) });
  }
});

module.exports = router;
