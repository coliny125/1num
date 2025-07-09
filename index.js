// index.js - Complete production version with Google Calendar integration
const express = require('express');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

// Log startup
console.log('🚀 Starting Retell Google Calendar server...');
console.log('Environment:', {
  port: process.env.PORT || 3000,
  hasServiceAccount: !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
  hasRetellKey: !!process.env.RETELL_API_KEY
});

//Personal Google Cal Email
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'colinyuan3333@gmail.com'; // Replace with your actual Gmail

// Global calendar instance
let calendar = null;
let authError = null;

// Initialize Google Calendar
async function initializeGoogleCalendar() {
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set');
    }

    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    console.log('📧 Service account:', credentials.client_email);

    const auth = new google.auth.GoogleAuth({
      credentials: credentials,
      scopes: ['https://www.googleapis.com/auth/calendar']
    });

    const authClient = await auth.getClient();
    calendar = google.calendar({ version: 'v3', auth: authClient });

    // Test the connection
    const calendarList = await calendar.calendarList.list({ maxResults: 1 });
    console.log('✅ Google Calendar connected successfully');
    console.log(`📅 Found ${calendarList.data.items.length} calendars`);
    
    return true;
  } catch (error) {
    authError = error;
    console.error('❌ Google Calendar initialization failed:', error.message);
    return false;
  }
}

// Initialize on startup
initializeGoogleCalendar();

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Retell Google Calendar Agent',
    status: calendar ? 'ready' : 'initializing',
    version: '2.0.0',
    endpoints: {
      health: '/health',
      checkAvailability: 'POST /check-availability',
      createEvent: 'POST /create-event',
      updateEvent: 'POST /update-event',
      cancelEvent: 'POST /cancel-event'
    },
    authStatus: calendar ? 'connected' : (authError ? authError.message : 'connecting...')
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    calendar: {
      connected: !!calendar,
      error: authError ? authError.message : null
    }
  };

  if (calendar) {
    try {
      // Quick test to ensure calendar is still accessible
      await calendar.calendarList.list({ maxResults: 1 });
      health.calendar.status = 'operational';
    } catch (error) {
      health.calendar.status = 'error';
      health.calendar.error = error.message;
    }
  }

  res.json(health);
});

// Middleware to check if calendar is ready
function requireCalendar(req, res, next) {
  if (!calendar) {
    return res.json({
      result: 'The calendar service is still initializing. Please try again in a moment.'
    });
  }
  next();
}

// Update the check-availability endpoint in your index.js
// Replace the check-availability endpoint with this version:

app.post('/check-availability', requireCalendar, async (req, res) => {
  try {
    const { args = {} } = req.body;
    const { date, startTime, endTime } = args;

    if (!date || !startTime || !endTime) {
      return res.json({
        result: 'I need a date, start time, and end time to check availability. Could you please provide those details?'
      });
    }

    console.log(`📅 Checking availability for ${date} from ${startTime} to ${endTime}`);

    // Create date times in the user's timezone
    const timeZone = process.env.TIMEZONE || 'America/Chicago';
    const timeMin = new Date(`${date}T${startTime}:00`).toISOString();
    const timeMax = new Date(`${date}T${endTime}:00`).toISOString();

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      timeZone: timeZone  // Add timezone to the query
    });

    const events = response.data.items || [];
    
    if (events.length === 0) {
      res.json({
        result: `Great news! Your calendar is completely free on ${date} between ${startTime} and ${endTime}.`
      });
    } else {
      // Format event times in the correct timezone
      const eventSummaries = events.map(event => {
        // Get the event start time
        const eventStart = event.start.dateTime || event.start.date;
        
        // Convert to user's timezone for display
        const startDate = new Date(eventStart);
        const timeOptions = {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: timeZone,  // Use the configured timezone
          hour12: true
        };
        
        const formattedTime = startDate.toLocaleString('en-US', timeOptions);
        return `${formattedTime}: ${event.summary || 'Busy'}`;
      }).join(', ');

      res.json({
        result: `On ${date}, you have ${events.length} appointment${events.length > 1 ? 's' : ''}: ${eventSummaries}. Would you like to schedule around these times?`
      });
    }
  } catch (error) {
    console.error('❌ Check availability error:', error);
    res.json({
      result: 'I encountered an issue checking the calendar. Please try again.'
    });
  }
});

// Create event endpoint
app.post('/create-event', requireCalendar, async (req, res) => {
  try {
    const { args = {} } = req.body;
    const { 
      title, 
      date, 
      startTime, 
      duration = 60,
      description,
      attendeeEmail 
    } = args;

    if (!title || !date || !startTime) {
      return res.json({
        result: 'To create an appointment, I need a title, date, and start time. What would you like to schedule?'
      });
    }

    console.log(`📝 Creating event: ${title} on ${date} at ${startTime}`);

    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

    // Check for conflicts first
    const conflicts = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startDateTime.toISOString(),
      timeMax: endDateTime.toISOString(),
      singleEvents: true
    });

    if (conflicts.data.items && conflicts.data.items.length > 0) {
      return res.json({
        result: `There's already an appointment scheduled at that time. Would you like me to find another available time slot?`
      });
    }

    const event = {
      summary: title,
      description: description || `Appointment created via Retell voice agent`,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: process.env.TIMEZONE || 'America/Chicago'
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: process.env.TIMEZONE || 'America/Chicago'
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 30 }
        ]
      }
    };

    // Add attendee if provided
    if (attendeeEmail) {
      event.attendees = [{ email: attendeeEmail }];
    }

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: event,
      sendUpdates: attendeeEmail ? 'all' : 'none'
    });

    const formattedTime = startDateTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });

    res.json({
      result: `Perfect! I've scheduled "${title}" on ${date} at ${formattedTime} for ${duration} minutes. ${attendeeEmail ? `An invitation has been sent to ${attendeeEmail}.` : ''} You'll receive a reminder 30 minutes before.`,
      eventId: response.data.id,
      eventLink: response.data.htmlLink
    });
  } catch (error) {
    console.error('❌ Create event error:', error);
    res.json({
      result: 'I couldn\'t create the appointment. Please check the details and try again.'
    });
  }
});

// Update event endpoint
app.post('/update-event', requireCalendar, async (req, res) => {
  try {
    const { args = {} } = req.body;
    const { eventId, newDate, newTime, newDuration } = args;

    if (!eventId || (!newDate && !newTime && !newDuration)) {
      return res.json({
        result: 'To update an appointment, I need the event ID and at least one thing to change (date, time, or duration).'
      });
    }

    console.log(`📝 Updating event: ${eventId}`);

    // Get existing event
    const existingEvent = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId: eventId
    });

    // Update fields
    if (newDate || newTime) {
      const date = newDate || existingEvent.start.dateTime.split('T')[0];
      const time = newTime || existingEvent.start.dateTime.split('T')[1].substring(0, 5);
      const duration = newDuration || 
        (new Date(existingEvent.end.dateTime) - new Date(existingEvent.start.dateTime)) / 60000;

      existingEvent.start.dateTime = new Date(`${date}T${time}:00`).toISOString();
      existingEvent.end.dateTime = new Date(
        new Date(`${date}T${time}:00`).getTime() + duration * 60000
      ).toISOString();
    }

    const response = await calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId: eventId,
      resource: existingEvent.data
    });

    res.json({
      result: `I've successfully updated your appointment. ${newDate ? `New date: ${newDate}.` : ''} ${newTime ? `New time: ${newTime}.` : ''}`,
      eventId: response.data.id
    });
  } catch (error) {
    console.error('❌ Update event error:', error);
    res.json({
      result: 'I couldn\'t update the appointment. Please make sure you have the correct event ID.'
    });
  }
});

// Cancel event endpoint
app.post('/cancel-event', requireCalendar, async (req, res) => {
  try {
    const { args = {} } = req.body;
    const { eventId } = args;

    if (!eventId) {
      return res.json({
        result: 'To cancel an appointment, I need the event ID. Which appointment would you like to cancel?'
      });
    }

    console.log(`🗑️ Cancelling event: ${eventId}`);

    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: eventId
    });

    res.json({
      result: 'I\'ve successfully cancelled your appointment. Is there anything else I can help you with?'
    });
  } catch (error) {
    console.error('❌ Cancel event error:', error);
    res.json({
      result: 'I couldn\'t cancel the appointment. Please verify the appointment details.'
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    availableEndpoints: ['/', '/health', '/check-availability', '/create-event', '/update-event', '/cancel-event']
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong processing your request'
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 https://1num-production.up.railway.app`);
});
