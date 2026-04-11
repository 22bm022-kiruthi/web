const express = require('express');
const axios = require('axios');

const router = express.Router();

// POST /api/extract -> forwards to Python service at 127.0.0.1:6003/extract
router.post('/', async (req, res) => {
  try {
    const resp = await axios.post('http://127.0.0.1:6003/extract', req.body, { timeout: 20000 });
    return res.json(resp.data);
  } catch (err) {
    console.error('[py_extract] Error forwarding to Python service:', err.message || err);
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json(err.response.data);
    }
    return res.status(500).json({ error: 'Failed to contact Python extraction service', detail: String(err.message || err) });
  }
});

module.exports = router;
