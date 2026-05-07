const express = require('express');
const router = express.Router();
const axios = require('axios');

// Simple server-side proxy for Supabase PostgREST table operations.
// Expects SUPABASE_URL and SUPABASE_SERVICE_KEY in environment (service_role for inserts).

// Whitelist allowed tables to prevent arbitrary table access. Configure via
// SUPABASE_ALLOWED_TABLES (comma-separated) or defaults to the known project tables.
// For development convenience you can set SUPABASE_ALLOW_ALL=true to allow any table name.
// This project uses the `data` table in the Spectroscopic project — include it by default.
const allowedTables = (process.env.SUPABASE_ALLOWED_TABLES && process.env.SUPABASE_ALLOWED_TABLES.split(',').map(s => s.trim())) || ['data', 'test', 'test_2', 'test_lib'];
const allowAll = String(process.env.SUPABASE_ALLOW_ALL || 'false').toLowerCase() === 'true';
if (allowAll) console.log('Supabase proxy running in ALLOW_ALL mode: any table name will be accepted (development only)');
console.log('Supabase proxy allowedTables:', allowedTables);
console.log('SUPABASE_TABLE env:', process.env.SUPABASE_TABLE);
// Ensure `data` is always allowed for the Spectroscopic project
if (!allowedTables.includes('data')) {
  allowedTables.push('data');
  console.log('Added `data` to allowedTables automatically');
}

const getSupabaseHeaders = () => {
  let url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['apikey'] = key;
  if (key) headers['Authorization'] = `Bearer ${key}`;
  // For debugging: do not log the full key, only show which kind is used and a short redacted prefix
  const keyType = process.env.SUPABASE_SERVICE_KEY ? 'service_role' : (process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY) ? 'anon/publishable' : 'none';
  const keyRedacted = key ? `${String(key).slice(0, 8)}...[REDACTED]` : null;

  // Normalize URL: if provided without scheme, assume https
  let normalized = url;
  if (normalized && !/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized.replace(/^\/+/, '')}`;
    console.log('[Supabase] Normalized SUPABASE_URL by prepending https://');
  }

  // Quick validation: try constructing a URL object
  let valid = false;
  try {
    if (normalized) new URL(normalized);
    valid = !!normalized;
  } catch (e) {
    console.warn('[Supabase] SUPABASE_URL appears malformed:', normalized, e && e.message ? e.message : e);
    valid = false;
  }

  console.log(`Supabase headers prepared. URL present: ${!!normalized}, keyType: ${keyType}, keyPrefix: ${keyRedacted}`);
  return { url: normalized, headers, keyType, valid };
};

// GET /api/supabase/fetch?table=raman_data&limit=10&filter=Sample name.eq.Polystyrene (PS)
router.get('/fetch', async (req, res) => {
  console.log('=== Supabase fetch request received ===');
  console.log('Query params:', req.query);
  try {
    // Default to the Spectroscopic project's `data` table when not specified
    const table = req.query.table || process.env.SUPABASE_TABLE || 'data';
    // Diagnostics: show exact table string and char codes to detect hidden chars/case
    console.log('Allowed tables list:', allowedTables);
    console.log('Requested table raw:', JSON.stringify(table), 'type:', typeof table);
    try {
      console.log('Requested table char codes:', table.split('').map(c => c.charCodeAt(0)));
    } catch (e) {
      console.log('Failed to enumerate char codes for table value:', e && e.message ? e.message : e);
    }
    // Reject table requests not in the allowed list (unless ALLOW_ALL enabled)
    if (!allowAll && !allowedTables.includes(table)) {
      console.warn('Supabase fetch rejected for disallowed table:', table);
      return res.status(400).json({ error: 'Requested table is not allowed' });
    }
    const limitParam = req.query.limit;
    
    const { url, headers, keyType, valid } = getSupabaseHeaders();
    console.log('Supabase URL:', url);
    console.log('Supabase fetch requested for table:', table, 'using keyType:', keyType, 'urlValid:', valid);
    if (!valid) return res.status(503).json({ error: 'SUPABASE_URL not configured or malformed on server' });

    // Build fetch URL with proper PostgREST query syntax
    let fetchUrl = `${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}?`;
    
    // Add limit
    if (limitParam) {
      fetchUrl += `limit=${encodeURIComponent(limitParam)}&`;
    }
    
    // Add filter if provided - PostgREST expects: columnname=eq.value
    // Frontend sends something like: "Sample name.eq.Test Polystyrene Full"
    // or may send URL-encoded values. Decode first to be robust to encoding.
    const filter = req.query.filter;
    if (filter) {
      let decoded = filter;
      if (typeof filter === 'string') {
        try {
          decoded = decodeURIComponent(filter);
        } catch (err) {
          // Malformed percent-encoding can throw URIError — fall back to raw value
          console.warn('Warning: failed to decode filter param, using raw value:', filter, err && err.message ? err.message : err);
          decoded = filter;
        }
      }
      console.log('Original filter (raw):', filter);
      console.log('Decoded filter:', decoded);
      // Parse "Column name.operator.Value" format
      const match = String(decoded).match(/^(.+?)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/);
      if (match) {
        let [, columnName, operator, value] = match;
        // For PostgREST: encode column and value
        const encodedCol = encodeURIComponent(columnName.trim());
        const encodedVal = encodeURIComponent(value.trim());
        const filterParam = `${encodedCol}=${operator}.${encodedVal}`;
        fetchUrl += `${filterParam}&`;
        console.log('PostgREST filter applied:', filterParam);
      } else {
        console.warn('Filter format not recognized, skipping:', decoded);
      }
    }
    
    fetchUrl = fetchUrl.replace(/&$/, ''); // Remove trailing &
    
    console.log('Fetching from:', fetchUrl);
    console.log('Request headers (redacted):', { apikey: headers.apikey ? '[REDACTED]' : undefined, Authorization: headers.Authorization ? '[REDACTED]' : undefined });

    let resp;
    try {
      // Add a reasonable timeout and surface network errors for diagnostics
      resp = await axios.get(fetchUrl, { headers, timeout: 15000 });
      console.log('Response status:', resp.status, 'data length:', Array.isArray(resp.data) ? resp.data.length : (resp.data ? Object.keys(resp.data).length : 0));
    } catch (e) {
      // Network / axios diagnostics
      console.error('Axios error: message=', e && e.message ? e.message : e);
      console.error('Axios error: code=', e && e.code ? e.code : undefined);
      try {
        console.error('Axios error: errno=', e && e.errno ? e.errno : undefined);
      } catch (xx) {}
      if (e.config) console.error('Axios request config url=', e.config.url, 'method=', e.config.method);
      if (e.response) {
        console.error('Axios response error status:', e.response.status, 'data:', e.response.data);
        return res.status(e.response.status).json({ error: 'Supabase error', details: e.response.data });
      }
      if (e.request) {
        console.error('No response received from Supabase. Request made but no response. Possible network/TLS issue.');
        // Return 200 with empty data to allow app to function offline/in demo mode
        return res.status(200).json({ data: [], message: 'Supabase unavailable - returning empty data', diagnostics: { message: e.message, code: e.code } });
      }
      console.error('Axios request error (unknown):', e && e.stack ? e.stack : e);
      return res.status(500).json({ error: 'Supabase fetch failed', details: String(e) });
    }

    if (resp.status !== 200) {
      console.log('Non-200 response from Supabase:', resp.status, resp.data);
      return res.status(resp.status).json({ status: resp.status, body: resp.data });
    }
    
    console.log('Data received, length:', resp.data.length);
    return res.json({ data: resp.data });
  } catch (err) {
    console.error('Supabase fetch error', err && err.stack ? err.stack : err);
    if (err.response) {
      // The request was made and the server responded with a status code
      console.error('Response error:', err.response.status, err.response.data);
      return res.status(err.response.status).json({ error: 'Supabase error', details: err.response.data });
    } else if (err.request) {
      // The request was made but no response was received
      console.error('No response received:', err.message);
      // Return 200 with empty data to allow app to function offline/in demo mode
      return res.status(200).json({ data: [], message: 'Supabase unavailable - returning empty data' });
    }
    // Return 200 with empty data to allow app to function offline/in demo mode
    res.status(200).json({ data: [], message: 'Supabase fetch failed - returning empty data', error: String(err) });
  }
});

// POST /api/supabase/insert with body { table: 'raman_data', rows: [...] }
router.post('/insert', express.json(), async (req, res) => {
  try {
    const { table, rows } = req.body;
    if (!table || !rows) return res.status(400).json({ error: 'table and rows are required' });
    const { url, headers, valid } = getSupabaseHeaders();
    if (!valid) return res.status(503).json({ error: 'SUPABASE_URL not configured or malformed on server' });

    const fetchUrl = `${url.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}`;
    const resp = await axios.post(fetchUrl, rows, { headers });
    return res.status(resp.status).send(resp.data);
  } catch (err) {
    console.error('Supabase insert error', err);
    if (err.response) {
      return res.status(err.response.status).json({ error: 'Supabase insert error', details: err.response.data });
    }
    res.status(500).json({ error: 'Supabase insert failed', details: String(err) });
  }
});

module.exports = router;

// GET /api/supabase/allowed - return allowed tables and allowAll flag
router.get('/allowed', (req, res) => {
  try {
    const payload = allowAll ? { allowAll: true, tables: allowedTables } : { allowAll: false, tables: allowedTables };
    return res.json(payload);
  } catch (err) {
    console.error('Failed to return allowed tables', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'failed to read allowed tables' });
  }
});
