const express = require('express');
const axios = require('axios');
const router = express.Router();
const { spawn } = require('child_process');

// POST /api/predict -> forward to Python service at 127.0.0.1:6004/predict
router.post('/', async (req, res) => {
  try {
    console.debug('[routes/predict] incoming request body:', JSON.stringify(req.body).slice(0, 200));
    const pyUrl = process.env.PY_PREDICT_URL || 'http://127.0.0.1:6004/predict';

    // Try to compute an authoritative peak count using the Python feature_extraction script
    const incomingSignal = req.body && req.body.signal ? req.body.signal : null;
    let computedPeaks = undefined;
    if (incomingSignal && Array.isArray(incomingSignal) && incomingSignal.length >= 3) {
      try {
        const nums = incomingSignal.map(v => Number(v) || 0);
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const variance = nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length;
        const std = Math.sqrt(variance || 0);
        const prominence = std * 0.5;
        const { execFileSync } = require('child_process');
        const path = require('path');
        const script = path.join(__dirname, '..', 'python', 'feature_extraction.py');
        const input = JSON.stringify({ signal: nums, prominence: prominence, distance: 5 });
        const out = execFileSync('python', [script], { input, encoding: 'utf8', timeout: 10000 });
        try {
          const pj = JSON.parse(out);
          if (pj && typeof pj.peaks === 'number') computedPeaks = pj.peaks;
        } catch (e) {
          console.warn('[routes/predict] failed to parse python peak output', e);
        }
      } catch (e) {
        console.warn('[routes/predict] python peak calculation failed', e && e.message ? e.message : e);
      }
    }

    // Forward the original payload to the Python prediction service
    let resp;
    try {
      resp = await axios.post(pyUrl, req.body, { timeout: 20000 });
    } catch (errPost) {
      // If Python service not running, attempt to start it automatically and retry once
      const isConnRefused = errPost && (errPost.code === 'ECONNREFUSED' || (errPost.message && errPost.message.toLowerCase().includes('connect econnrefused')));
      if (isConnRefused) {
        try {
          console.warn('[routes/predict] Python service appears down. Attempting to start predict_api.py...');
          const path = require('path');
          const scriptDir = path.join(__dirname, '..', 'python');
          const pyScript = path.join(scriptDir, 'predict_api.py');
          // Try common python executables
          const candidates = ['python', 'python3'];
          let started = false;
          for (const exe of candidates) {
            try {
              const child = spawn(exe, [pyScript], {
                cwd: scriptDir,
                detached: true,
                stdio: 'ignore'
              });
              child.unref();
              console.debug(`[routes/predict] spawned python process using ${exe}`);
              started = true;
              break;
            } catch (spawnErr) {
              console.warn(`[routes/predict] failed to spawn ${exe}:`, spawnErr && (spawnErr.message || spawnErr));
            }
          }
          if (!started) throw new Error('Failed to spawn Python process (tried python, python3)');
          // wait a bit longer for server to come up
          await new Promise((r) => setTimeout(r, 3000));
          console.debug('[routes/predict] retrying request to Python service after starting it');
          resp = await axios.post(pyUrl, req.body, { timeout: 20000 });
        } catch (retryErr) {
          // fallthrough to original error handling below
          throw retryErr;
        }
      } else {
        throw errPost;
      }
    }
    if (!resp) return res.status(502).json({ error: 'No response from Python service' });

    // If Python returned non-200, surface it
    if (resp.status !== 200) {
      console.error('[routes/predict] Python service returned status', resp.status, 'body:', resp.data);
      return res.status(502).json({ error: 'Python service error', status: resp.status, python: resp.data });
    }

    // Attach computed peaks if available
    const d = resp.data;
    if (!d) return res.status(502).json({ error: 'Empty response from Python service' });

    // If prediction field missing/null, return diagnostics to caller
    if (typeof d === 'object' && (d.prediction === null || d.prediction === undefined) && (d.result === null || d.result === undefined)) {
      console.warn('[routes/predict] Python returned no prediction:', JSON.stringify(d).slice(0,1000));
      return res.status(502).json({ error: 'Prediction missing from Python service response', python: d, peaks: computedPeaks });
    }

    if (d && typeof d === 'object') {
      const out = Object.assign({}, d, { peaks: computedPeaks });
      return res.json({ prediction: out.prediction || out.result, ...out });
    }

    if (typeof d === 'string') {
      return res.json({ prediction: d, raw: d, peaks: computedPeaks });
    }

    return res.status(502).json({ error: 'Unexpected response from Python service', python: d });
  } catch (err) {
    try {
      console.error('[routes/predict] error forwarding to Python service:', err && err.message ? err.message : err);
      if (err.response) console.error('[routes/predict] python responded with status', err.response.status, 'body:', JSON.stringify(err.response.data).slice(0, 1000));
      console.error(err && err.stack ? err.stack : err);
    } catch (logErr) {
      console.error('[routes/predict] failed to log error details', logErr);
    }
    if (err.response && err.response.data) {
      return res.status(err.response.status || 500).json({ error: 'Prediction failed', python: err.response.data });
    }
    return res.status(500).json({ error: 'Prediction failed', detail: err && err.message ? err.message : String(err) });
  }
});

module.exports = router;
