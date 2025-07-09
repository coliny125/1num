// server.js - Railway-ready with proper health checks
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// Middleware to handle Railway's health checks
app.use((req, res, next) => {
  // Log all requests for debugging
  console.log(`${req.method} ${req.path}`);
  next();
});

console.log('Starting server...');

// Global variables
let calendar = null;
let isReady = false;

// Initialize Google Calendar
async function initializeCalendar() {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    console.log('Initializing Google Calendar for:', credentials.client_email);
    
    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });
    
    const authClient = await auth.getClient();
    calendar = google.calendar({ version: 'v3', auth: authClient });
    
    // Test the connection
    await calendar.calendarList.list({ maxResults: 1 });
    
    isReady = true;
    console.log('✅ Google Calendar connected successfully');
  } catch (error) {
    console.error('Failed to initialize calendar:', error.message);
    // Don't crash, just mark as not ready
    isReady = false;
  }
}

// CRITICAL: Add root route for Railway
app.get('/', (req, res) => {
  res.json({
    service: 'Retell Google Calendar Agent',
    status: isReady ? 'ready' : 'initializing',
    version: '1.0.0'
  });
});

// Health endpoint - MUST return 200 for Railway
app.get('/health', (req, res) => {
  // Always return 200 to keep Railway happy
  res.status(200).json({
    status: isReady ? 'healthy' : 'starting',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Readiness check
app.get('/ready', (req, res) => {
  if (isReady && calendar) {
    res.json({ ready: true, message: 'Calendar service ready' });
  } else {
    res.status(503).json({ ready: false, message: 'Calendar service not ready' });
  }
});

// Check availability
app.post('/check-availability', async (req, res) => {
  if (!calendar) {
    return res.json({ 
      result: 'Calendar service is initializing. Please try again in a moment.' 
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
    console.error('Check availability error:', error.message);
    res.json({ 
      result: 'I had trouble checking the calendar. Please try again.' 
    });
  }
});

// Create event
app.post('/create-event', async (req, res) => {
  if (!calendar) {
    return res.json({ 
      result: 'Calendar service is initializing. Please try again in a moment.' 
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
    console.error('Create event error:', error.message);
    res.json({ 
      result: 'I couldn\'t create the appointment. Please check the details and try again.' 
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found', 
    path: req.path 
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server listening on port ${PORT}`);
  console.log('🌐 Initializing Google Calendar...');
  
  // Initialize calendar after server starts
  initializeCalendar().catch(console.error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  
  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('Forced exit');
    process.exit(1);
  }, 10000);
});

// Keep process alive
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit on errors
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  // Don't exit on errors
});
