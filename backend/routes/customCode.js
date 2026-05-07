const express = require('express');
const router = express.Router();
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with SERVICE_KEY for admin operations
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
let supabase = null;
try {
  if (typeof supabaseUrl === 'string' && supabaseUrl.match(/^https?:\/\//) && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  } else {
    console.warn('[Supabase] SUPABASE_URL or key missing or malformed — Supabase client not initialized');
    supabase = null;
  }
} catch (err) {
  console.warn('[Supabase] Failed to initialize Supabase client:', err.message);
  supabase = null;
}

function ensureSupabaseConfigured(res) {
  if (!supabase) {
    res.status(503).json({ error: 'Supabase not configured on this server' });
    return false;
  }
  return true;
}

/**
 * Execute custom Python code directly via child_process
 */
function executeCodeDirect(code, input_data) {
  return new Promise((resolve, reject) => {
    const pythonScript = path.join(__dirname, '..', 'python', 'execute_code_inline.py');
    const pythonProcess = spawn('python', [pythonScript], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString('utf-8');
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString('utf-8');
    });
    
    pythonProcess.on('close', (code_exit) => {
      console.log(`[Python] Process exited with code ${code_exit}`);
      console.log(`[Python] stdout:`, stdout);
      console.log(`[Python] stderr:`, stderr);
      
      if (code_exit !== 0) {
        reject(new Error(`Python process exited with code ${code_exit}: ${stderr}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse Python output: ${stdout}`));
        }
      }
    });
    
    pythonProcess.on('error', (err) => {
      console.error(`[Python] Process error:`, err);
      reject(new Error(`Failed to spawn Python process: ${err.message}`));
    });
    
    // Clean input data to remove any invalid surrogate characters
    const cleanData = (obj) => {
      if (typeof obj === 'string') {
        // Replace invalid surrogates with replacement character
        return obj.replace(/[\uD800-\uDFFF]/g, '');
      } else if (Array.isArray(obj)) {
        return obj.map(cleanData);
      } else if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const key in obj) {
          cleaned[key] = cleanData(obj[key]);
        }
        return cleaned;
      }
      return obj;
    };
    
    // Send input as JSON to Python stdin with cleaned data
    const input = JSON.stringify({ 
      code: cleanData(code), 
      input_data: cleanData(input_data) 
    });
    pythonProcess.stdin.write(input, 'utf-8');
    pythonProcess.stdin.end();
  });
}

/**
 * Execute custom Python code
 * POST /api/custom-code/execute
 */
router.post('/execute', async (req, res) => {
  try {
    const { code, input_data } = req.body;
    console.log(`[Custom Code] Received execute request, code length: ${code?.length || 0}, input rows: ${input_data?.length || 0}`);

    if (!code) {
      return res.status(400).json({ error: 'No code provided' });
    }

    // Try direct execution first (fallback if Flask service unavailable)
    try {
      console.log('[Custom Code] Attempting direct Python execution...');
      const result = await executeCodeDirect(code, input_data || []);
      console.log('[Custom Code] Direct execution successful');
      return res.json(result);
    } catch (directError) {
      console.error('[Custom Code] Direct execution failed:', directError.message);
      console.error('[Custom Code] Direct error stack:', directError.stack);
      
      // Fallback: try Flask service
      try {
        console.log('[Custom Code] Attempting Flask service fallback...');
        const response = await axios.post('http://127.0.0.1:6004/api/custom-code/execute', {
          code,
          input_data: input_data || []
        }, {
          timeout: 30000
        });
        console.log('[Custom Code] Flask service successful');
        return res.json(response.data);
      } catch (flaskError) {
        console.error('[Custom Code] Flask service also failed:', flaskError.message);
        // Return the direct error (more useful than connection error)
        throw directError;
      }
    }
  } catch (error) {
    console.error('[Custom Code] Final error:', error.message);
    console.error('[Custom Code] Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute custom code',
      output_data: null,
      stdout: '',
      stderr: ''
    });
  }
});

/**
 * Validate Python code syntax
 * POST /api/custom-code/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ valid: false, error: 'No code provided' });
    }

    // Forward to Python service (changed to port 6004)
    const response = await axios.post('http://127.0.0.1:6004/api/custom-code/validate', {
      code
    });

    res.json(response.data);
  } catch (error) {
    console.error('[Custom Code] Validation error:', error.message);
    res.status(500).json({
      valid: false,
      error: error.message
    });
  }
});

/**
 * Save custom widget to database
 * POST /api/custom-code/save
 */
router.post('/save', async (req, res) => {
  try {
    const { name, description, python_code, author, parameters, category, tags } = req.body;

    if (!name || !python_code) {
      return res.status(400).json({ error: 'Name and code are required' });
    }

    if (!ensureSupabaseConfigured(res)) return;

    // Insert into Supabase
    const { data, error } = await supabase
      .from('custom_widgets')
      .insert([{
        name,
        description: description || '',
        python_code,
        author: author || 'anonymous',
        parameters: parameters || [],
        category: category || 'processing',
        tags: tags || [],
        is_public: true
      }])
      .select();

    if (error) {
      console.error('[Custom Code] Save error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      widget: data[0]
    });
  } catch (error) {
    console.error('[Custom Code] Save error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * List all custom widgets
 * GET /api/custom-code/list
 */
router.get('/list', async (req, res) => {
  try {
    const { category, author, limit = 100 } = req.query;

    let query = supabase
      .from('custom_widgets')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    // Optional filters
    if (category) {
      query = query.eq('category', category);
    }
    if (author) {
      query = query.eq('author', author);
    }

    if (!ensureSupabaseConfigured(res)) return;

    const { data, error } = await query;

    if (error) {
      console.error('[Custom Code] List error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      widgets: data,
      count: data.length
    });
  } catch (error) {
    console.error('[Custom Code] List error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get specific custom widget by ID
 * GET /api/custom-code/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ensureSupabaseConfigured(res)) return;

    const { data, error } = await supabase
      .from('custom_widgets')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Custom Code] Get error:', error);
      return res.status(404).json({ error: 'Widget not found' });
    }

    // Increment usage count
    await supabase
      .from('custom_widgets')
      .update({ usage_count: (data.usage_count || 0) + 1 })
      .eq('id', id);

    res.json({
      success: true,
      widget: data
    });
  } catch (error) {
    console.error('[Custom Code] Get error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update custom widget
 * PUT /api/custom-code/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, python_code, parameters, category, tags } = req.body;

    const updates = {};
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (python_code) updates.python_code = python_code;
    if (parameters) updates.parameters = parameters;
    if (category) updates.category = category;
    if (tags) updates.tags = tags;
    updates.updated_at = new Date().toISOString();

    if (!ensureSupabaseConfigured(res)) return;

    const { data, error } = await supabase
      .from('custom_widgets')
      .update(updates)
      .eq('id', id)
      .select();

    if (error) {
      console.error('[Custom Code] Update error:', error);
      return res.status(500).json({ error: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Widget not found' });
    }

    res.json({
      success: true,
      widget: data[0]
    });
  } catch (error) {
    console.error('[Custom Code] Update error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete custom widget
 * DELETE /api/custom-code/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ensureSupabaseConfigured(res)) return;

    const { error } = await supabase
      .from('custom_widgets')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Custom Code] Delete error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({
      success: true,
      message: 'Widget deleted successfully'
    });
  } catch (error) {
    console.error('[Custom Code] Delete error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
