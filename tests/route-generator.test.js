const {
  generateWaypoints,
  adjustWaypoints,
  pointInPolygon,
  nearestPointOnPolygon,
  projectToSegment,
  polygonCentroid,
  getWaypointCount,
  METERS_PER_MILE
} = require('../public/route-generator');

// --- getWaypointCount ---

describe('getWaypointCount', () => {
  test('returns 4 for distances under 5 miles', () => {
    expect(getWaypointCount(1)).toBe(4);
    expect(getWaypointCount(3)).toBe(4);
    expect(getWaypointCount(4.9)).toBe(4);
  });

  test('returns 6 for distances 5-12.9 miles', () => {
    expect(getWaypointCount(5)).toBe(6);
    expect(getWaypointCount(10)).toBe(6);
    expect(getWaypointCount(12.9)).toBe(6);
  });

  test('returns 8 for distances 13+ miles', () => {
    expect(getWaypointCount(13)).toBe(8);
    expect(getWaypointCount(20)).toBe(8);
    expect(getWaypointCount(26.2)).toBe(8);
  });
});

// --- generateWaypoints ---

describe('generateWaypoints', () => {
  const startLat = 40.7128;
  const startLng = -74.006;

  test('returns correct number of waypoints for given distance', () => {
    expect(generateWaypoints(startLat, startLng, 3)).toHaveLength(4);
    expect(generateWaypoints(startLat, startLng, 5)).toHaveLength(6);
    expect(generateWaypoints(startLat, startLng, 13)).toHaveLength(8);
  });

  test('each waypoint has lat and lng properties', () => {
    const waypoints = generateWaypoints(startLat, startLng, 5);
    waypoints.forEach(wp => {
      expect(wp).toHaveProperty('lat');
      expect(wp).toHaveProperty('lng');
      expect(typeof wp.lat).toBe('number');
      expect(typeof wp.lng).toBe('number');
    });
  });

  test('waypoints are near the start location (within reasonable radius)', () => {
    const waypoints = generateWaypoints(startLat, startLng, 5);
    waypoints.forEach(wp => {
      const dLat = Math.abs(wp.lat - startLat);
      const dLng = Math.abs(wp.lng - startLng);
      // For a 5-mile route, waypoints should be within ~0.02 degrees (~1.5 miles)
      expect(dLat).toBeLessThan(0.05);
      expect(dLng).toBeLessThan(0.05);
    });
  });

  test('waypoints for longer routes are farther from start', () => {
    const short = generateWaypoints(startLat, startLng, 2);
    const long = generateWaypoints(startLat, startLng, 20);

    const avgDistShort = short.reduce((sum, wp) =>
      sum + Math.sqrt((wp.lat - startLat) ** 2 + (wp.lng - startLng) ** 2), 0
    ) / short.length;

    const avgDistLong = long.reduce((sum, wp) =>
      sum + Math.sqrt((wp.lat - startLat) ** 2 + (wp.lng - startLng) ** 2), 0
    ) / long.length;

    expect(avgDistLong).toBeGreaterThan(avgDistShort);
  });

  test('accepts a custom radius override', () => {
    const wp1 = generateWaypoints(startLat, startLng, 5, 500);
    const wp2 = generateWaypoints(startLat, startLng, 5, 5000);

    const avgDist1 = wp1.reduce((sum, wp) =>
      sum + Math.sqrt((wp.lat - startLat) ** 2 + (wp.lng - startLng) ** 2), 0
    ) / wp1.length;

    const avgDist2 = wp2.reduce((sum, wp) =>
      sum + Math.sqrt((wp.lat - startLat) ** 2 + (wp.lng - startLng) ** 2), 0
    ) / wp2.length;

    expect(avgDist2).toBeGreaterThan(avgDist1);
  });

  test('generates different waypoints on each call (random offset)', () => {
    const wp1 = generateWaypoints(startLat, startLng, 5);
    const wp2 = generateWaypoints(startLat, startLng, 5);
    // Extremely unlikely to be identical due to random offset and perturbation
    const same = wp1.every((w, i) => w.lat === wp2[i].lat && w.lng === wp2[i].lng);
    expect(same).toBe(false);
  });
});

// --- generateWaypoints with polygon boundary ---

describe('generateWaypoints with polygon boundary', () => {
  const startLat = 40.7128;
  const startLng = -74.006;

  // A small box around the start location
  const boundary = [
    { lat: 40.710, lng: -74.010 },
    { lat: 40.710, lng: -74.002 },
    { lat: 40.716, lng: -74.002 },
    { lat: 40.716, lng: -74.010 }
  ];

  test('constrains all waypoints inside the polygon boundary', () => {
    // Run multiple times since waypoints are random
    for (let i = 0; i < 10; i++) {
      const waypoints = generateWaypoints(startLat, startLng, 5, null, boundary);
      waypoints.forEach(wp => {
        const inside = pointInPolygon(wp.lat, wp.lng, boundary);
        expect(inside).toBe(true);
      });
    }
  });

  test('works without a boundary (null)', () => {
    const waypoints = generateWaypoints(startLat, startLng, 5, null, null);
    expect(waypoints.length).toBeGreaterThan(0);
  });

  test('works without a boundary (undefined)', () => {
    const waypoints = generateWaypoints(startLat, startLng, 5);
    expect(waypoints.length).toBeGreaterThan(0);
  });

  test('ignores boundary with fewer than 3 vertices', () => {
    const tooSmall = [{ lat: 40.71, lng: -74.01 }, { lat: 40.72, lng: -74.00 }];
    const waypoints = generateWaypoints(startLat, startLng, 5, null, tooSmall);
    expect(waypoints.length).toBeGreaterThan(0);
    // No constraint applied, so waypoints could be outside the 2-point "boundary"
  });
});

// --- pointInPolygon ---

describe('pointInPolygon', () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 10 },
    { lat: 10, lng: 10 },
    { lat: 10, lng: 0 }
  ];

  test('returns true for a point inside', () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });

  test('returns true for a point near the center', () => {
    expect(pointInPolygon(3, 7, square)).toBe(true);
  });

  test('returns false for a point clearly outside', () => {
    expect(pointInPolygon(15, 5, square)).toBe(false);
    expect(pointInPolygon(-5, 5, square)).toBe(false);
    expect(pointInPolygon(5, -5, square)).toBe(false);
    expect(pointInPolygon(5, 15, square)).toBe(false);
  });

  test('handles a triangle', () => {
    const triangle = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 5 }
    ];
    expect(pointInPolygon(3, 5, triangle)).toBe(true);
    expect(pointInPolygon(20, 5, triangle)).toBe(false);
  });

  test('handles an irregular (concave) polygon', () => {
    // L-shaped polygon
    const lShape = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 4 },
      { lat: 2, lng: 4 },
      { lat: 2, lng: 2 },
      { lat: 4, lng: 2 },
      { lat: 4, lng: 0 }
    ];
    expect(pointInPolygon(1, 1, lShape)).toBe(true);   // inside bottom-left
    expect(pointInPolygon(1, 3, lShape)).toBe(true);   // inside top-left arm
    expect(pointInPolygon(3, 1, lShape)).toBe(true);   // inside bottom-right arm
    expect(pointInPolygon(3, 3, lShape)).toBe(false);  // outside the concave corner
    expect(pointInPolygon(5, 5, lShape)).toBe(false);  // outside entirely
  });
});

// --- projectToSegment ---

describe('projectToSegment', () => {
  test('projects to midpoint of horizontal segment', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 10 };
    const result = projectToSegment(5, 5, a, b);
    expect(result.lat).toBeCloseTo(0, 5);
    expect(result.lng).toBeCloseTo(5, 5);
  });

  test('clamps to start of segment', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 10 };
    const result = projectToSegment(5, -5, a, b);
    expect(result.lat).toBeCloseTo(0, 5);
    expect(result.lng).toBeCloseTo(0, 5);
  });

  test('clamps to end of segment', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 10 };
    const result = projectToSegment(5, 15, a, b);
    expect(result.lat).toBeCloseTo(0, 5);
    expect(result.lng).toBeCloseTo(10, 5);
  });

  test('handles a zero-length segment', () => {
    const a = { lat: 5, lng: 5 };
    const b = { lat: 5, lng: 5 };
    const result = projectToSegment(10, 10, a, b);
    expect(result.lat).toBeCloseTo(5, 5);
    expect(result.lng).toBeCloseTo(5, 5);
  });

  test('projects to diagonal segment correctly', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 10, lng: 10 };
    const result = projectToSegment(0, 10, a, b);
    expect(result.lat).toBeCloseTo(5, 5);
    expect(result.lng).toBeCloseTo(5, 5);
  });
});

// --- polygonCentroid ---

describe('polygonCentroid', () => {
  test('computes centroid of a square', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 10 },
      { lat: 10, lng: 10 },
      { lat: 10, lng: 0 }
    ];
    const c = polygonCentroid(square);
    expect(c.lat).toBeCloseTo(5, 5);
    expect(c.lng).toBeCloseTo(5, 5);
  });

  test('computes centroid of a triangle', () => {
    const triangle = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 6 },
      { lat: 6, lng: 3 }
    ];
    const c = polygonCentroid(triangle);
    expect(c.lat).toBeCloseTo(2, 5);
    expect(c.lng).toBeCloseTo(3, 5);
  });
});

// --- nearestPointOnPolygon ---

describe('nearestPointOnPolygon', () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 10 },
    { lat: 10, lng: 10 },
    { lat: 10, lng: 0 }
  ];

  test('returns a point inside the polygon for an external point', () => {
    const result = nearestPointOnPolygon(5, 15, square);
    expect(pointInPolygon(result.lat, result.lng, square)).toBe(true);
  });

  test('returned point is close to the polygon edge', () => {
    const result = nearestPointOnPolygon(5, 15, square);
    // Should be near lng=10 edge, nudged slightly inward
    expect(result.lng).toBeLessThan(10);
    expect(result.lng).toBeGreaterThan(9.5);
    expect(result.lat).toBeCloseTo(5, 0);
  });

  test('handles a point far above the polygon', () => {
    const result = nearestPointOnPolygon(20, 5, square);
    expect(pointInPolygon(result.lat, result.lng, square)).toBe(true);
    expect(result.lat).toBeLessThan(10);
    expect(result.lat).toBeGreaterThan(9);
  });

  test('handles a point at a corner', () => {
    const result = nearestPointOnPolygon(15, 15, square);
    expect(pointInPolygon(result.lat, result.lng, square)).toBe(true);
  });
});

// --- adjustWaypoints ---

describe('adjustWaypoints', () => {
  const startLat = 40.7128;
  const startLng = -74.006;

  test('returns waypoints array', () => {
    const result = adjustWaypoints(startLat, startLng, 5, 10000);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test('each waypoint has lat and lng', () => {
    const result = adjustWaypoints(startLat, startLng, 5, 10000);
    result.forEach(wp => {
      expect(typeof wp.lat).toBe('number');
      expect(typeof wp.lng).toBe('number');
    });
  });

  test('adjusts radius based on actual vs target distance', () => {
    // If actual distance was double the target, waypoints should be closer
    const targetMeters = 5 * METERS_PER_MILE;
    const closerWps = adjustWaypoints(startLat, startLng, 5, targetMeters * 2);
    const fartherWps = adjustWaypoints(startLat, startLng, 5, targetMeters * 0.5);

    const avgDistCloser = closerWps.reduce((sum, wp) =>
      sum + Math.sqrt((wp.lat - startLat) ** 2 + (wp.lng - startLng) ** 2), 0
    ) / closerWps.length;

    const avgDistFarther = fartherWps.reduce((sum, wp) =>
      sum + Math.sqrt((wp.lat - startLat) ** 2 + (wp.lng - startLng) ** 2), 0
    ) / fartherWps.length;

    expect(avgDistFarther).toBeGreaterThan(avgDistCloser);
  });

  test('forwards boundary parameter', () => {
    const boundary = [
      { lat: 40.710, lng: -74.010 },
      { lat: 40.710, lng: -74.002 },
      { lat: 40.716, lng: -74.002 },
      { lat: 40.716, lng: -74.010 }
    ];

    for (let i = 0; i < 5; i++) {
      const result = adjustWaypoints(startLat, startLng, 5, 10000, boundary);
      result.forEach(wp => {
        expect(pointInPolygon(wp.lat, wp.lng, boundary)).toBe(true);
      });
    }
  });
});
