// server.js - Updated with better error handling and debugging
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// Add startup logging
console.log('🚀 Starting server...');
console.log('📋 Environment check:');
console.log('- NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('- PORT:', process.env.PORT || '3000');
console.log('- RETELL_API_KEY exists:', !!process.env.RETELL_API_KEY);
console.log('- GOOGLE_SERVICE_ACCOUNT_KEY exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

// Initialize Google Auth with better error handling
let auth;
let authError = null;

try {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is missing');
  }

  console.log('📝 Parsing service account JSON...');
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  console.log('✅ Service account email:', credentials.client_email);
  
  auth = new google.auth.GoogleAuth({
    credentials: credentials,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  
  console.log('✅ Google Auth initialized successfully');
} catch (error) {
  authError = error;
  console.error('❌ Failed to initialize Google Auth:', error.message);
  console.error('Error details:', error);
}

// Basic error handler middleware
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Retell Google Calendar Agent',
    status: authError ? 'error' : 'running',
    authStatus: authError ? authError.message : 'connected',
    endpoints: ['/health', '/check-availability', '/create-event']
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  console.log('Health check requested');
  
  if (authError) {
    return res.status(503).json({ 
      status: 'unhealthy',
      error: 'Auth initialization failed',
      details: authError.message
    });
  }

  try {
    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    
    // Test the connection
    const calendarList = await calendar.calendarList.list({ maxResults: 1 });
    
    res.json({ 
      status: 'healthy',
      message: 'Server is running and Google Calendar is connected',
      calendarsFound: calendarList.data.items ? calendarList.data.items.length : 0
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message,
      code: error.code,
      details: error.errors ? error.errors[0] : 'Unknown error'
    });
  }
});

// Check availability endpoint
app.post('/check-availability', async (req, res) => {
  console.log('Check availability requested:', req.body);
  
  if (authError) {
    return res.status(503).json({ 
      result: "Service is not properly configured. Please check server logs."
    });
  }

  try {
    const { args } = req.body;
    const { date, startTime, endTime } = args;

    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });

    const timeMin = new Date(`${date}T${startTime}:00`).toISOString();
    const timeMax = new Date(`${date}T${endTime}:00`).toISOString();

    console.log('Checking calendar from', timeMin, 'to', timeMax);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];
    
    if (events.length === 0) {
      res.json({
        result: `The calendar is free on ${date} between ${startTime} and ${endTime}.`
      });
    } else {
      res.json({
        result: `There are ${events.length} appointments on ${date} between ${startTime} and ${endTime}.`
      });
    }
  } catch (error) {
    console.error('Check availability error:', error);
    res.json({
      result: "I'm having trouble checking the calendar. Please try again."
    });
  }
});

// Create event endpoint
app.post('/create-event', async (req, res) => {
  console.log('Create event requested:', req.body);
  
  if (authError) {
    return res.status(503).json({ 
      result: "Service is not properly configured. Please check server logs."
    });
  }

  try {
    const { args } = req.body;
    const { title, date, startTime, duration = 60 } = args;

    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });

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

    console.log('Creating event:', event);

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
      result: "I couldn't create the appointment. Please check the details and try again."
    });
  }
});

// Catch all 404
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log(`🌐 Ready to handle requests`);
  
  if (authError) {
    console.error('⚠️  WARNING: Server started but Google Auth failed to initialize');
  }
});
