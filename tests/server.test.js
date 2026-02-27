const configHandler = require('../api/config');
const routeHandler = require('../api/route');

/**
 * Tests for the serverless API handlers.
 * Handlers are called directly with mock req/res objects.
 */

function mockRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; }
  };
  return res;
}

// --- GET /api/config ---

describe('GET /api/config', () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalKey;
    }
  });

  test('returns the API key', () => {
    const req = { method: 'GET' };
    const res = mockRes();
    configHandler(req, res);
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ apiKey: 'test-api-key' });
  });

  test('returns 405 for non-GET methods', () => {
    const req = { method: 'POST' };
    const res = mockRes();
    configHandler(req, res);
    expect(res._status).toBe(405);
  });

  test('returns 500 when API key is not set', () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const req = { method: 'GET' };
    const res = mockRes();
    configHandler(req, res);
    expect(res._status).toBe(500);
  });
});

// --- POST /api/route ---

describe('POST /api/route', () => {
  const originalKey = process.env.GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.GOOGLE_MAPS_API_KEY;
    } else {
      process.env.GOOGLE_MAPS_API_KEY = originalKey;
    }
  });

  test('returns 405 for non-POST methods', async () => {
    const req = { method: 'GET', body: {} };
    const res = mockRes();
    await routeHandler(req, res);
    expect(res._status).toBe(405);
  });

  test('rejects request with missing origin', async () => {
    const req = { method: 'POST', body: { waypoints: [{ lat: 1, lng: 2 }] } };
    const res = mockRes();
    await routeHandler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('origin and waypoints array are required');
  });

  test('rejects request with missing waypoints', async () => {
    const req = { method: 'POST', body: { origin: { lat: 40, lng: -74 } } };
    const res = mockRes();
    await routeHandler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('origin and waypoints array are required');
  });

  test('rejects request with waypoints as non-array', async () => {
    const req = { method: 'POST', body: { origin: { lat: 40, lng: -74 }, waypoints: 'not-an-array' } };
    const res = mockRes();
    await routeHandler(req, res);
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('origin and waypoints array are required');
  });

  test('rejects request with empty body', async () => {
    const req = { method: 'POST', body: {} };
    const res = mockRes();
    await routeHandler(req, res);
    expect(res._status).toBe(400);
  });

  test('constructs correct Routes API request body', async () => {
    const origin = { lat: 40.7128, lng: -74.006 };
    const waypoints = [
      { lat: 40.72, lng: -73.99 },
      { lat: 40.71, lng: -73.98 }
    ];

    // Mock fetch to capture the outgoing request body
    let capturedBody;
    global.fetch = jest.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({ routes: [] })
      };
    });

    const req = { method: 'POST', body: { origin, waypoints } };
    const res = mockRes();
    await routeHandler(req, res);

    expect(capturedBody.origin.location.latLng.latitude).toBe(40.7128);
    expect(capturedBody.origin.location.latLng.longitude).toBe(-74.006);
    expect(capturedBody.destination.location.latLng.latitude).toBe(40.7128);
    expect(capturedBody.destination.location.latLng.longitude).toBe(-74.006);
    expect(capturedBody.intermediates).toHaveLength(2);
    expect(capturedBody.intermediates[0].location.latLng.latitude).toBe(40.72);
    expect(capturedBody.intermediates[1].location.latLng.latitude).toBe(40.71);
    expect(capturedBody.travelMode).toBe('WALK');
    expect(capturedBody.units).toBe('IMPERIAL');

    delete global.fetch;
  });

  test('sets destination equal to origin for loop route', async () => {
    const origin = { lat: 33.749, lng: -84.388 };
    const waypoints = [{ lat: 33.75, lng: -84.39 }];

    let capturedBody;
    global.fetch = jest.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ routes: [] }) };
    });

    const req = { method: 'POST', body: { origin, waypoints } };
    const res = mockRes();
    await routeHandler(req, res);

    expect(capturedBody.origin.location.latLng).toEqual(capturedBody.destination.location.latLng);

    delete global.fetch;
  });

  test('maps all waypoints to intermediates array', async () => {
    const origin = { lat: 40.0, lng: -74.0 };
    const waypoints = [
      { lat: 41.0, lng: -73.0 },
      { lat: 42.0, lng: -72.0 },
      { lat: 43.0, lng: -71.0 },
      { lat: 44.0, lng: -70.0 }
    ];

    let capturedBody;
    global.fetch = jest.fn(async (url, options) => {
      capturedBody = JSON.parse(options.body);
      return { ok: true, json: async () => ({ routes: [] }) };
    });

    const req = { method: 'POST', body: { origin, waypoints } };
    const res = mockRes();
    await routeHandler(req, res);

    expect(capturedBody.intermediates).toHaveLength(4);
    expect(capturedBody.intermediates[2].location.latLng.latitude).toBe(43.0);
    expect(capturedBody.intermediates[3].location.latLng.longitude).toBe(-70.0);

    delete global.fetch;
  });
});

// --- Field mask verification ---

describe('api/route.js field mask', () => {
  const fs = require('fs');
  const path = require('path');
  const routeSource = fs.readFileSync(
    path.join(__dirname, '..', 'api', 'route.js'),
    'utf-8'
  );

  test('requests step navigation instructions', () => {
    expect(routeSource).toContain('routes.legs.steps.navigationInstruction');
  });

  test('requests step distance', () => {
    expect(routeSource).toContain('routes.legs.steps.distanceMeters');
  });

  test('requests step duration', () => {
    expect(routeSource).toContain('routes.legs.steps.staticDuration');
  });

  test('requests route-level fields', () => {
    expect(routeSource).toContain('routes.distanceMeters');
    expect(routeSource).toContain('routes.duration');
    expect(routeSource).toContain('routes.polyline.encodedPolyline');
  });

  test('requests leg-level fields', () => {
    expect(routeSource).toContain('routes.legs.distanceMeters');
    expect(routeSource).toContain('routes.legs.duration');
    expect(routeSource).toContain('routes.legs.polyline.encodedPolyline');
  });
});
