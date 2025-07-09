// server.js - Stable version with proper error handling
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

console.log('Starting server...');
console.log('Environment check:', {
  hasServiceAccount: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  hasRetellKey: !!process.env.RETELL_API_KEY,
  port: process.env.PORT || 3000
});

// Global calendar variable
let calendar = null;
let authError = null;

// Initialize Google Auth with proper error handling
async function initializeGoogleAuth() {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not found in environment');
    }

    // Parse and validate the service account
    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
      console.log('Service account email:', credentials.client_email);
    } catch (e) {
      throw new Error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY: ' + e.message);
    }

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    // Get authenticated client
    const authClient = await auth.getClient();
    
    // Create calendar instance
    calendar = google.calendar({ version: 'v3', auth: authClient });
    
    // Test the connection
    await calendar.calendarList.list({ maxResults: 1 });
    
    console.log('✅ Google Calendar connected successfully');
    return true;
  } catch (error) {
    authError = error;
    console.error('❌ Failed to initialize Google Calendar:', error.message);
    // Don't crash the server, just log the error
    return false;
  }
}

// Initialize auth on startup
initializeGoogleAuth();

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: calendar ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: {
      server: 'running',
      auth: calendar ? 'connected' : 'disconnected'
    }
  };

  if (!calendar) {
    health.error = authError ? authError.message : 'Calendar not initialized';
    return res.status(503).json(health);
  }

  try {
    // Test calendar connection
    await calendar.calendarList.list({ maxResults: 1 });
    health.message = 'Server is running and Google Calendar is connected';
    res.json(health);
  } catch (error) {
    health.status = 'unhealthy';
    health.error = error.message;
    res.status(503).json(health);
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Retell Google Calendar Agent',
    status: calendar ? 'running' : 'initializing',
    endpoints: [
      'GET /health',
      'POST /check-availability',
      'POST /create-event'
    ],
    authStatus: calendar ? 'connected' : (authError ? authError.message : 'initializing')
  });
});

// Check availability endpoint
app.post('/check-availability', async (req, res) => {
  if (!calendar) {
    return res.json({ 
      result: 'Calendar service is not available. Please try again later.' 
    });
  }

  try {
    const { args = {} } = req.body;
    const { date, startTime, endTime } = args;

    if (!date || !startTime || !endTime) {
      return res.json({ 
        result: 'Please provide date, startTime, and endTime.' 
      });
    }

    const timeMin = new Date(`${date}T${startTime}:00`).toISOString();
    const timeMax = new Date(`${date}T${endTime}:00`).toISOString();

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];
    
    res.json({
      result: events.length === 0 
        ? `The calendar is free on ${date} between ${startTime} and ${endTime}.`
        : `There are ${events.length} appointments on ${date} between ${startTime} and ${endTime}.`
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.json({ 
      result: 'I had trouble checking the calendar. Please try again.' 
    });
  }
});

// Create event endpoint
app.post('/create-event', async (req, res) => {
  if (!calendar) {
    return res.json({ 
      result: 'Calendar service is not available. Please try again later.' 
    });
  }

  try {
    const { args = {} } = req.body;
    const { title, date, startTime, duration = 60 } = args;

    if (!title || !date || !startTime) {
      return res.json({ 
        result: 'Please provide title, date, and startTime for the event.' 
      });
    }

    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    const event = {
      summary: title,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'America/Chicago'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'America/Chicago'
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    res.json({
      result: `I've scheduled "${title}" on ${date} at ${startTime} for ${duration} minutes.`,
      eventId: response.data.id
    });
  } catch (error) {
    console.error('Create event error:', error);
    res.json({ 
      result: 'I couldn\'t create the appointment. Please check the details and try again.' 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found', 
    path: req.path,
    message: 'This endpoint does not exist' 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit, try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, try to keep running
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log('🌐 Ready to accept requests');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Keep the process alive
setInterval(() => {
  // Heartbeat to prevent timeout
}, 30000);
