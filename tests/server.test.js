const http = require('http');
const path = require('path');
const express = require('express');

/**
 * Tests for the Express server endpoints.
 * We recreate the app setup to test in isolation without needing
 * an actual Google API key or external network calls.
 */

let app, server;

function createApp(apiKey = 'test-api-key') {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(express.static(path.join(__dirname, '..', 'public')));

  testApp.get('/api/config', (req, res) => {
    res.json({ apiKey });
  });

  testApp.post('/api/route', async (req, res) => {
    const { origin, waypoints } = req.body;

    if (!origin || !waypoints || !Array.isArray(waypoints)) {
      return res.status(400).json({ error: 'origin and waypoints array are required' });
    }

    // Build the request body (same as server.js)
    const body = {
      origin: {
        location: { latLng: { latitude: origin.lat, longitude: origin.lng } }
      },
      destination: {
        location: { latLng: { latitude: origin.lat, longitude: origin.lng } }
      },
      intermediates: waypoints.map(wp => ({
        location: { latLng: { latitude: wp.lat, longitude: wp.lng } }
      })),
      travelMode: 'WALK',
      units: 'IMPERIAL',
      languageCode: 'en-US'
    };

    // Instead of calling Google, return the constructed body so we can verify it
    res.json({ _testRequestBody: body });
  });

  return testApp;
}

beforeAll((done) => {
  app = createApp();
  server = app.listen(0, done); // random port
});

afterAll((done) => {
  server.close(done);
});

function getPort() {
  return server.address().port;
}

function fetchJson(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `http://localhost:${getPort()}${path}`;
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: JSON.parse(data)
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.setHeader('Content-Type', 'application/json');
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

// --- GET /api/config ---

describe('GET /api/config', () => {
  test('returns the API key', async () => {
    const res = await fetchJson('/api/config');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ apiKey: 'test-api-key' });
  });
});

// --- POST /api/route ---

describe('POST /api/route', () => {
  test('rejects request with missing origin', async () => {
    const res = await fetchJson('/api/route', {
      method: 'POST',
      body: { waypoints: [{ lat: 1, lng: 2 }] }
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('origin and waypoints array are required');
  });

  test('rejects request with missing waypoints', async () => {
    const res = await fetchJson('/api/route', {
      method: 'POST',
      body: { origin: { lat: 40, lng: -74 } }
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('origin and waypoints array are required');
  });

  test('rejects request with waypoints as non-array', async () => {
    const res = await fetchJson('/api/route', {
      method: 'POST',
      body: { origin: { lat: 40, lng: -74 }, waypoints: 'not-an-array' }
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('origin and waypoints array are required');
  });

  test('rejects request with empty body', async () => {
    const res = await fetchJson('/api/route', {
      method: 'POST',
      body: {}
    });
    expect(res.status).toBe(400);
  });

  test('constructs correct Routes API request body', async () => {
    const origin = { lat: 40.7128, lng: -74.006 };
    const waypoints = [
      { lat: 40.72, lng: -73.99 },
      { lat: 40.71, lng: -73.98 }
    ];

    const res = await fetchJson('/api/route', {
      method: 'POST',
      body: { origin, waypoints }
    });

    expect(res.status).toBe(200);
    const body = res.body._testRequestBody;

    // Origin
    expect(body.origin.location.latLng.latitude).toBe(40.7128);
    expect(body.origin.location.latLng.longitude).toBe(-74.006);

    // Destination = Origin (loop)
    expect(body.destination.location.latLng.latitude).toBe(40.7128);
    expect(body.destination.location.latLng.longitude).toBe(-74.006);

    // Intermediates
    expect(body.intermediates).toHaveLength(2);
    expect(body.intermediates[0].location.latLng.latitude).toBe(40.72);
    expect(body.intermediates[1].location.latLng.latitude).toBe(40.71);

    // Travel mode
    expect(body.travelMode).toBe('WALK');
    expect(body.units).toBe('IMPERIAL');
  });

  test('sets destination equal to origin for loop route', async () => {
    const origin = { lat: 33.749, lng: -84.388 };
    const waypoints = [{ lat: 33.75, lng: -84.39 }];

    const res = await fetchJson('/api/route', {
      method: 'POST',
      body: { origin, waypoints }
    });

    const body = res.body._testRequestBody;
    expect(body.origin.location.latLng).toEqual(body.destination.location.latLng);
  });

  test('maps all waypoints to intermediates array', async () => {
    const origin = { lat: 40.0, lng: -74.0 };
    const waypoints = [
      { lat: 41.0, lng: -73.0 },
      { lat: 42.0, lng: -72.0 },
      { lat: 43.0, lng: -71.0 },
      { lat: 44.0, lng: -70.0 }
    ];

    const res = await fetchJson('/api/route', {
      method: 'POST',
      body: { origin, waypoints }
    });

    const body = res.body._testRequestBody;
    expect(body.intermediates).toHaveLength(4);
    expect(body.intermediates[2].location.latLng.latitude).toBe(43.0);
    expect(body.intermediates[3].location.latLng.longitude).toBe(-70.0);
  });
});

// --- Field mask verification ---

describe('server.js field mask', () => {
  const fs = require('fs');
  const serverSource = fs.readFileSync(
    path.join(__dirname, '..', 'server.js'),
    'utf-8'
  );

  test('requests step navigation instructions', () => {
    expect(serverSource).toContain('routes.legs.steps.navigationInstruction');
  });

  test('requests step distance', () => {
    expect(serverSource).toContain('routes.legs.steps.distanceMeters');
  });

  test('requests step duration', () => {
    expect(serverSource).toContain('routes.legs.steps.staticDuration');
  });

  test('requests route-level fields', () => {
    expect(serverSource).toContain('routes.distanceMeters');
    expect(serverSource).toContain('routes.duration');
    expect(serverSource).toContain('routes.polyline.encodedPolyline');
  });

  test('requests leg-level fields', () => {
    expect(serverSource).toContain('routes.legs.distanceMeters');
    expect(serverSource).toContain('routes.legs.duration');
    expect(serverSource).toContain('routes.legs.polyline.encodedPolyline');
  });
});

// --- Static file serving ---

describe('static file serving', () => {
  test('serves index.html at root', async () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${getPort()}/`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          expect(res.statusCode).toBe(200);
          expect(data).toContain('Training Routes');
          expect(data).toContain('google-maps-link');
          expect(data).toContain('directions-list');
          resolve();
        });
      }).on('error', reject);
    });
  });

  test('serves app.js', async () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${getPort()}/app.js`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          expect(res.statusCode).toBe(200);
          expect(data).toContain('buildGoogleMapsLink');
          expect(data).toContain('renderDirections');
          resolve();
        });
      }).on('error', reject);
    });
  });

  test('serves route-generator.js', async () => {
    return new Promise((resolve, reject) => {
      http.get(`http://localhost:${getPort()}/route-generator.js`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          expect(res.statusCode).toBe(200);
          expect(data).toContain('generateWaypoints');
          expect(data).toContain('pointInPolygon');
          resolve();
        });
      }).on('error', reject);
    });
  });
});
