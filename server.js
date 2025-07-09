// server.js - Minimal debug version to isolate the issue
const express = require('express');
const app = express();

// Log everything at startup
console.log('=== SERVER STARTING ===');
console.log('Node version:', process.version);
console.log('Current time:', new Date().toISOString());

// Check environment variables
console.log('\n=== ENVIRONMENT CHECK ===');
console.log('PORT:', process.env.PORT || 'not set (using 3000)');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('GOOGLE_SERVICE_ACCOUNT_KEY exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
console.log('GOOGLE_SERVICE_ACCOUNT_KEY length:', process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? process.env.GOOGLE_SERVICE_ACCOUNT_KEY.length : 0);
console.log('RETELL_API_KEY exists:', !!process.env.RETELL_API_KEY);

// Try to parse the service account JSON
let serviceAccountEmail = 'unknown';
let parseError = null;

if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
  try {
    console.log('\n=== PARSING SERVICE ACCOUNT ===');
    const parsed = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    serviceAccountEmail = parsed.client_email || 'no client_email found';
    console.log('✅ Successfully parsed JSON');
    console.log('Service account email:', serviceAccountEmail);
    console.log('Project ID:', parsed.project_id);
    console.log('Has private_key:', !!parsed.private_key);
    console.log('Private key starts with:', parsed.private_key ? parsed.private_key.substring(0, 50) + '...' : 'missing');
  } catch (error) {
    parseError = error.message;
    console.error('❌ Failed to parse service account JSON:', error.message);
    console.error('First 100 chars of GOOGLE_SERVICE_ACCOUNT_KEY:', process.env.GOOGLE_SERVICE_ACCOUNT_KEY.substring(0, 100));
  }
}

// Simple health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    message: 'Basic server is running',
    serviceAccount: serviceAccountEmail,
    parseError: parseError,
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Retell Calendar Debug Server',
    status: 'running',
    debug: {
      hasServiceAccountKey: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      serviceAccountEmail: serviceAccountEmail,
      parseError: parseError
    }
  });
});

// DON'T initialize Google Calendar yet - just test basic server

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n=== SERVER STARTED ===`);
  console.log(`✅ Listening on port ${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/health`);
});

// Keep process alive
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  process.exit(0);
});

// Log any uncaught errors
process.on('uncaughtException', (error) => {
  console.error('UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION:', reason);
});
