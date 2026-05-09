Deploying the Python predictor (short guide)

1. Install dependencies

   ```bash
   python -m venv .venv
   .venv/bin/pip install -r requirements.txt    # Linux/macOS
   .venv\Scripts\pip.exe install -r requirements.txt  # Windows
   ```

2. Run locally for testing

   ```bash
   .venv/bin/python predict_api.py   # or python predict_api.py on Windows
   ```

3. Recommended production start (Render)

   - Use Gunicorn to serve the Flask app.
   - Start command: `gunicorn predict_api:app --bind 0.0.0.0:$PORT`

4. Render setup notes

   - Create a separate Render Web Service for this folder `backend/python` using the Python runtime.
   - Ensure `requirements.txt` is present at repo root of the service (it is here).
   - Set health checks as `/predict` or use Node's `/api/predict/diagnostics` for end-to-end checks.

5. After deployment

   - Set the Node backend's `PY_PREDICT_URL` environment variable to the predictor's public URL, e.g. `https://<your-python-service>.onrender.com/predict`.
   - Restart the Node service on Render and verify `/api/predict/diagnostics` on the Node service.

6. Troubleshooting

   - If you see `ModuleNotFoundError` for `numpy` or other packages, ensure Render installed the `requirements.txt` and that the start command uses the correct virtualenv.
   - For faster cold starts use Gunicorn with at least 2 workers: `gunicorn -w 2 predict_api:app --bind 0.0.0.0:$PORT`.

Contact: add logs and restart if issues persist.
