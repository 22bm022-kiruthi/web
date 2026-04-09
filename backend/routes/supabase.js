const express = require('express');
const router = express.Router();
const axios = require('axios');

// Simple server-side proxy for Supabase PostgREST table operations.
// Expects SUPABASE_URL and SUPABASE_SERVICE_KEY in environment (service_role for inserts).

const getSupabaseHeaders = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['apikey'] = key;
  if (key) headers['Authorization'] = `Bearer ${key}`;
  return { url, headers };
};

// GET /api/supabase/fetch?table=raman_data&limit=10&filter=Sample name.eq.Polystyrene (PS)
router.get('/fetch', async (req, res) => {
  console.log('=== Supabase fetch request received ===');
  console.log('Query params:', req.query);
  try {
    const table = req.query.table || 'raman_data';
    const limitParam = req.query.limit;
    
    const { url, headers } = getSupabaseHeaders();
    console.log('Supabase URL:', url);
    if (!url) return res.status(500).json({ error: 'SUPABASE_URL not configured on server' });

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
    console.log('Headers:', { ...headers, Authorization: headers.Authorization ? '[REDACTED]' : undefined });
    
    const resp = await axios.get(fetchUrl, { headers });
    console.log('Response status:', resp.status);
    
    if (resp.status !== 200) {
      console.log('Error response:', resp.data);
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
    const { url, headers } = getSupabaseHeaders();
    if (!url) return res.status(500).json({ error: 'SUPABASE_URL not configured on server' });

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
