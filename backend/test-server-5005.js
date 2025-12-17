const express = require('express');
const app = express();
const PORT = 5005; // Different port

app.get('/api/health', (req, res) => {
  console.log('Health check request received');
  res.json({ status: 'ok', port: PORT });
});

console.log('Starting server on port', PORT);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server successfully started on http://0.0.0.0:${PORT}`);
  console.log(`Try accessing: http://localhost:${PORT}/api/health`);
});

server.on('listening', () => {
  const addr = server.address();
  console.log('Server is now listening on:', addr);
});

server.on('error', (err) => {
  console.error('SERVER ERROR:', err.code, err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use!`);
  }
  process.exit(1);
});

// Prevent immediate exit
process.stdin.resume();

console.log('Script continues...');
