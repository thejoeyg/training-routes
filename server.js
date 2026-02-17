const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
  console.error('GOOGLE_MAPS_API_KEY environment variable is required');
  process.exit(1);
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve API key for Maps JS loader
app.get('/api/config', (req, res) => {
  res.json({ apiKey: API_KEY });
});

// Proxy route computation to Google Routes API
app.post('/api/route', async (req, res) => {
  const { origin, waypoints } = req.body;

  if (!origin || !waypoints || !Array.isArray(waypoints)) {
    return res.status(400).json({ error: 'origin and waypoints array are required' });
  }

  const body = {
    origin: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lng }
      }
    },
    destination: {
      location: {
        latLng: { latitude: origin.lat, longitude: origin.lng }
      }
    },
    intermediates: waypoints.map(wp => ({
      location: {
        latLng: { latitude: wp.lat, longitude: wp.lng }
      }
    })),
    travelMode: 'WALK',
    units: 'IMPERIAL',
    languageCode: 'en-US'
  };

  try {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Routes API error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: 'Routes API error',
        details: data.error?.message || JSON.stringify(data)
      });
    }

    res.json(data);
  } catch (err) {
    console.error('Failed to call Routes API:', err.message);
    res.status(500).json({ error: 'Failed to compute route' });
  }
});

app.listen(PORT, () => {
  console.log(`Training Routes running at http://localhost:${PORT}`);
});
