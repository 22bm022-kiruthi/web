const express = require('express');
const app = express();
const PORT = 5004;

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on port ${PORT}`);
  console.log('Server is listening...');
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

// Keep the process alive
setInterval(() => {
  console.log('Server still running...');
}, 10000);
