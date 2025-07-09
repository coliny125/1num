// server.js - Complete Google Calendar + Retell Integration
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// Initialize Google Calendar with Service Account
const auth = new google.auth.GoogleAuth({
  credentials: process.env.GOOGLE_SERVICE_ACCOUNT_KEY ? 
    JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY) : undefined,
  scopes: ['https://www.googleapis.com/auth/calendar']
});

// Simple Retell signature verification (add full verification later)
const verifyRetell = (req, res, next) => {
  // For now, just check if API key exists
  if (!process.env.RETELL_API_KEY) {
    return res.status(500).json({ error: 'Retell API key not configured' });
  }
  next();
};

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    await calendar.calendarList.list({ maxResults: 1 });
    
    res.json({ 
      status: 'healthy',
      message: 'Server is running and Google Calendar is connected'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Retell Google Calendar Agent',
    status: 'running',
    endpoints: [
      'GET /health',
      'POST /check-availability',
      'POST /create-event'
    ]
  });
});

// Check calendar availability
app.post('/check-availability', verifyRetell, async (req, res) => {
  try {
    const { args } = req.body;
    const { date, startTime, endTime } = args;

    console.log('Checking availability:', { date, startTime, endTime });

    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: 'v3', auth: authClient });

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
    
    if (events.length === 0) {
      res.json({
        result: `The calendar is free on ${date} between ${startTime} and ${endTime}.`
      });
    } else {
      const busyCount = events.length;
      res.json({
        result: `There are ${busyCount} appointments on ${date} between ${startTime} and ${endTime}.`
      });
    }
  } catch (error) {
    console.error('Error:', error);
    res.json({
      result: "I'm having trouble checking the calendar. Please try again."
    });
  }
});

// Create calendar event
app.post('/create-event', verifyRetell, async (req, res) => {
  try {
    const { args } = req.body;
    const { title, date, startTime, duration = 60 } = args;

    console.log('Creating event:', { title, date, startTime, duration });

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

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: event
    });

    res.json({
      result: `I've scheduled "${title}" on ${date} at ${startTime} for ${duration} minutes.`,
      eventId: response.data.id
    });
  } catch (error) {
    console.error('Error:', error);
    res.json({
      result: "I couldn't create the appointment. Please check the details and try again."
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
