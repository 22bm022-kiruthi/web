// Debug wrapper to catch startup errors
try {
  require('./server.js');
} catch (err) {
  console.error('=== SERVER STARTUP ERROR ===');
  console.error('Error name:', err.name);
  console.error('Error message:', err.message);
  console.error('Error stack:', err.stack);
  console.error('===========================');
  process.exit(1);
}
