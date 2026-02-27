module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: API key not set' });
  }

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
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.legs.distanceMeters,routes.legs.duration,routes.legs.polyline.encodedPolyline,routes.legs.steps.navigationInstruction,routes.legs.steps.distanceMeters,routes.legs.steps.staticDuration'
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
};
