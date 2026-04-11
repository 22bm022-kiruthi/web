const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /api/predict -> forward to Python service at 127.0.0.1:6004/predict
router.post('/', async (req, res) => {
  try {
    const pyUrl = process.env.PY_PREDICT_URL || 'http://127.0.0.1:6004/predict';
    const resp = await axios.post(pyUrl, req.body, { timeout: 20000 });
    return res.json(resp.data);
  } catch (err) {
    console.error('[routes/predict] error forwarding to Python service:', err && err.message ? err.message : err);
    return res.status(500).json({ error: 'Prediction failed', detail: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;
