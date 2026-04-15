const express = require('express');
const axios = require('axios');
const router = express.Router();

// POST /api/predict -> forward to Python service at 127.0.0.1:6004/predict
router.post('/', async (req, res) => {
  try {
    console.debug('[routes/predict] incoming request body:', JSON.stringify(req.body).slice(0, 200));
    // Default to local Python predict service on port 5000 (the simple Flask app)
    const pyUrl = process.env.PY_PREDICT_URL || 'http://127.0.0.1:5000/predict';
    const resp = await axios.post(pyUrl, req.body, { timeout: 20000 });
    console.debug('[routes/predict] python response status:', resp.status, 'data:', typeof resp.data === 'object' ? JSON.stringify(resp.data).slice(0,200) : String(resp.data).slice(0,200));
    return res.json(resp.data);
  } catch (err) {
    // Log detailed error info for debugging (include axios response body if present)
    try {
      console.error('[routes/predict] error forwarding to Python service:', err && err.message ? err.message : err);
      if (err.response) {
        console.error('[routes/predict] python responded with status', err.response.status, 'body:', JSON.stringify(err.response.data).slice(0,1000));
      }
      console.error(err && err.stack ? err.stack : err);
    } catch (logErr) {
      console.error('[routes/predict] failed to log error details', logErr);
    }
    // If Python returned a formatted error body, forward it; otherwise return generic message
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json({ error: 'Prediction failed', python: err.response.data });
    }
    return res.status(500).json({ error: 'Prediction failed', detail: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;
