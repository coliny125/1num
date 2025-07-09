// server.js - Simplified version without retell-sdk
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

console.log('Starting server...');

// Initialize Google Auth
let calendar;
try {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY),
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
  
  auth.getClient().then(authClient => {
    calendar = google.calendar({ version: 'v3', auth: authClient });
    console.log('Google Calendar connected');
  });
} catch (error) {
  console.error('Auth error:', error.message);
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Retell Google Calendar Agent',
    status: 'running'
  });
});

// Health check
app.get('/health', async (req, res) => {
  if (!calendar) {
    return res.status(503).json({ 
      status: 'unhealthy',
      error: 'Calendar not initialized'
    });
  }

  try {
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

// Check availability
app.post('/check-availability', async (req, res) => {
  if (!calendar) {
    return res.json({ result: 'Service initializing, please try again.' });
  }

  try {
    const { args } = req.body;
    const { date, startTime, endTime } = args;

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: new Date(`${date}T${startTime}:00`).toISOString(),
      timeMax: new Date(`${date}T${endTime}:00`).toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });

    const events = response.data.items || [];
    
    res.json({
      result: events.length === 0 
        ? `Calendar is free on ${date} between ${startTime} and ${endTime}.`
        : `There are ${events.length} appointments scheduled.`
    });
  } catch (error) {
    console.error('Error:', error);
    res.json({ result: 'Error checking calendar.' });
  }
});

// Create event
app.post('/create-event', async (req, res) => {
  if (!calendar) {
    return res.json({ result: 'Service initializing, please try again.' });
  }

  try {
    const { args } = req.body;
    const { title, date, startTime, duration = 60 } = args;

    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: title,
        start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Chicago' },
        end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Chicago' }
      }
    });

    res.json({
      result: `Scheduled "${title}" on ${date} at ${startTime}.`,
      eventId: response.data.id
    });
  } catch (error) {
    console.error('Error:', error);
    res.json({ result: 'Error creating event.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
