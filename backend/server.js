const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Set Supabase credentials directly (temporary solution)
process.env.SUPABASE_URL = 'https://zatafiglyptbujqzsohc.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphdGFmaWdseXB0YnVqcXpzb2hjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MTE5MjY2NywiZXhwIjoyMDc2NzY4NjY3fQ.9Fb2TCZ7L0sD3kAUXotQhiLu3zg0lgPGCb5CotbQ9fA';
process.env.SUPABASE_TABLE = 'raman_data';

// Manual .env loading as fallback
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const envKey = key.trim();
        const envValue = valueParts.join('=').trim();
        // Only set if not already set
        if (!process.env[envKey]) {
          process.env[envKey] = envValue;
        }
      }
    }
  });
}

require('dotenv').config({ path: envPath });


const uploadRouter = require('./routes/upload');
const supabaseRouter = require('./routes/supabase');
const baselineRouter = require('./routes/baseline');
const noiseRouter = require('./routes/noise');
const pcaRouter = require('./routes/pca');
const kmeansRouter = require('./routes/kmeans');
const customCodeRouter = require('./routes/customCode');

const app = express();
// Use PORT env if set, otherwise default to 5003 which our frontend expects
const PORT = process.env.PORT || 5003;


// CORS: Allow main Netlify site, all Netlify deploy previews, and localhost for dev
const allowedOrigins = [
  'https://spectraldataanalysis.netlify.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000'
];
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow non-browser requests
    // Allow any localhost origin (dev servers often run on varying ports)
    if (origin && origin.startsWith('http://localhost')) return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+--spectraldataanalysis\.netlify\.app$/.test(origin) ||
      origin.endsWith('.netlify.app')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

// Simple request logger for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl}`);
  next();
});

// NOTE: This project previously used MongoDB for file metadata. We're running in
// Supabase-first mode: if you have a Mongo URI you can re-add mongoose connection,
// otherwise the server will use Supabase (configured by SUPABASE_URL/SUPABASE_SERVICE_KEY)
if (!process.env.MONGO_URI) {
  console.warn('WARN: MONGO_URI not set — running in Supabase-only / local-fallback mode');
} else {
  // Optional: if a MONGO_URI is provided, you may add mongoose connection logic here.
  console.log('MONGO_URI provided — but mongoose connection is currently disabled in Supabase-only mode');
}

// Routes
app.use('/api/upload', uploadRouter);
app.use('/api/supabase', supabaseRouter);
app.use('/api/baseline-correction', baselineRouter);
app.use('/api/noise-filter', noiseRouter);
app.use('/api/custom-code', customCodeRouter);
app.use('/api/pca', pcaRouter);
app.use('/api/analytics', kmeansRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler to prevent server crashes
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error', 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Handle uncaught promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Explicitly bind to 0.0.0.0 (IPv4) to ensure local IPv4 clients (127.0.0.1) can connect reliably on Windows
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log('SUPABASE_URL set:', !!process.env.SUPABASE_URL);
  console.log('SUPABASE_URL value:', process.env.SUPABASE_URL);
  console.log('SUPABASE_SERVICE_KEY present:', !!process.env.SUPABASE_SERVICE_KEY);
  console.log('.env file location:', path.join(__dirname, '.env'));
});