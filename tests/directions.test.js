/**
 * Tests for directions feature logic.
 * Since app.js functions are tightly coupled to the DOM and Google Maps,
 * we extract and test the pure logic: distance formatting, Google Maps URL
 * building, and step data parsing.
 */

// --- formatStepDistance ---

describe('formatStepDistance', () => {
  // Replicate the function from app.js for testing
  function formatStepDistance(meters) {
    if (meters >= 161) {
      return `${(meters / 1609.34).toFixed(2)} mi`;
    }
    return `${Math.round(meters * 3.28084)} ft`;
  }

  test('formats short distances in feet', () => {
    expect(formatStepDistance(10)).toBe('33 ft');
    expect(formatStepDistance(30)).toBe('98 ft');
    expect(formatStepDistance(100)).toBe('328 ft');
    expect(formatStepDistance(160)).toBe('525 ft');
  });

  test('formats longer distances in miles', () => {
    expect(formatStepDistance(161)).toBe('0.10 mi');
    expect(formatStepDistance(1609.34)).toBe('1.00 mi');
    expect(formatStepDistance(8046.7)).toBe('5.00 mi');
  });

  test('handles zero meters', () => {
    expect(formatStepDistance(0)).toBe('0 ft');
  });

  test('threshold is at 161 meters (~0.1 miles)', () => {
    expect(formatStepDistance(160)).toContain('ft');
    expect(formatStepDistance(161)).toContain('mi');
  });

  test('rounds feet to nearest integer', () => {
    // 50 meters = 164.042 feet → 164
    expect(formatStepDistance(50)).toBe('164 ft');
  });

  test('shows two decimal places for miles', () => {
    expect(formatStepDistance(200)).toBe('0.12 mi');
    expect(formatStepDistance(500)).toBe('0.31 mi');
  });
});

// --- buildGoogleMapsUrl ---

describe('buildGoogleMapsUrl', () => {
  // Replicate the URL construction logic from app.js
  function buildGoogleMapsUrl(startLocation, waypoints) {
    if (!startLocation || !waypoints.length) return null;

    const points = [
      startLocation,
      ...waypoints,
      startLocation
    ];

    const path = points
      .map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`)
      .join('/');

    return `https://www.google.com/maps/dir/${path}?travelmode=walking`;
  }

  test('builds a valid Google Maps URL', () => {
    const start = { lat: 40.7128, lng: -74.006 };
    const waypoints = [
      { lat: 40.72, lng: -73.99 },
      { lat: 40.71, lng: -73.98 }
    ];

    const url = buildGoogleMapsUrl(start, waypoints);
    expect(url).toContain('https://www.google.com/maps/dir/');
    expect(url).toContain('travelmode=walking');
  });

  test('starts and ends with the start location (loop)', () => {
    const start = { lat: 40.7128, lng: -74.006 };
    const waypoints = [{ lat: 40.72, lng: -73.99 }];

    const url = buildGoogleMapsUrl(start, waypoints);
    const pathPart = url.split('/dir/')[1].split('?')[0];
    const points = pathPart.split('/');

    expect(points[0]).toBe(points[points.length - 1]);
  });

  test('includes all waypoints in order', () => {
    const start = { lat: 40.0, lng: -74.0 };
    const waypoints = [
      { lat: 41.0, lng: -73.0 },
      { lat: 42.0, lng: -72.0 },
      { lat: 43.0, lng: -71.0 }
    ];

    const url = buildGoogleMapsUrl(start, waypoints);
    const pathPart = url.split('/dir/')[1].split('?')[0];
    const points = pathPart.split('/');

    // start + 3 waypoints + start = 5 points
    expect(points).toHaveLength(5);
    expect(points[0]).toBe('40.000000,-74.000000');
    expect(points[1]).toBe('41.000000,-73.000000');
    expect(points[2]).toBe('42.000000,-72.000000');
    expect(points[3]).toBe('43.000000,-71.000000');
    expect(points[4]).toBe('40.000000,-74.000000');
  });

  test('uses 6 decimal places for coordinates', () => {
    const start = { lat: 40.7128123456789, lng: -74.006 };
    const waypoints = [{ lat: 40.72, lng: -73.99 }];

    const url = buildGoogleMapsUrl(start, waypoints);
    expect(url).toContain('40.712812,');
  });

  test('returns null when start location is missing', () => {
    expect(buildGoogleMapsUrl(null, [{ lat: 1, lng: 2 }])).toBeNull();
  });

  test('returns null when waypoints are empty', () => {
    expect(buildGoogleMapsUrl({ lat: 1, lng: 2 }, [])).toBeNull();
  });
});

// --- parseSteps ---

describe('parseSteps (directions extraction)', () => {
  // Replicate the step parsing logic from renderDirections in app.js
  function parseSteps(routeData) {
    const steps = [];
    if (!routeData.legs || routeData.legs.length === 0) return steps;

    let stepNumber = 0;
    routeData.legs.forEach(leg => {
      if (!leg.steps) return;
      leg.steps.forEach(step => {
        stepNumber++;
        steps.push({
          number: stepNumber,
          instruction: step.navigationInstruction?.instructions || 'Continue',
          distanceMeters: step.distanceMeters || 0
        });
      });
    });
    return steps;
  }

  test('extracts steps from a single leg', () => {
    const routeData = {
      legs: [{
        steps: [
          { navigationInstruction: { instructions: 'Head north' }, distanceMeters: 100 },
          { navigationInstruction: { instructions: 'Turn left onto Main St' }, distanceMeters: 500 }
        ]
      }]
    };

    const steps = parseSteps(routeData);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toEqual({ number: 1, instruction: 'Head north', distanceMeters: 100 });
    expect(steps[1]).toEqual({ number: 2, instruction: 'Turn left onto Main St', distanceMeters: 500 });
  });

  test('numbers steps sequentially across multiple legs', () => {
    const routeData = {
      legs: [
        {
          steps: [
            { navigationInstruction: { instructions: 'Head north' }, distanceMeters: 100 },
            { navigationInstruction: { instructions: 'Turn right' }, distanceMeters: 200 }
          ]
        },
        {
          steps: [
            { navigationInstruction: { instructions: 'Continue straight' }, distanceMeters: 300 },
            { navigationInstruction: { instructions: 'Turn left' }, distanceMeters: 400 }
          ]
        }
      ]
    };

    const steps = parseSteps(routeData);
    expect(steps).toHaveLength(4);
    expect(steps[0].number).toBe(1);
    expect(steps[1].number).toBe(2);
    expect(steps[2].number).toBe(3);
    expect(steps[3].number).toBe(4);
  });

  test('falls back to "Continue" when navigationInstruction is missing', () => {
    const routeData = {
      legs: [{
        steps: [
          { distanceMeters: 100 },
          { navigationInstruction: null, distanceMeters: 200 }
        ]
      }]
    };

    const steps = parseSteps(routeData);
    expect(steps[0].instruction).toBe('Continue');
    expect(steps[1].instruction).toBe('Continue');
  });

  test('defaults distanceMeters to 0 when missing', () => {
    const routeData = {
      legs: [{
        steps: [
          { navigationInstruction: { instructions: 'Go' } }
        ]
      }]
    };

    const steps = parseSteps(routeData);
    expect(steps[0].distanceMeters).toBe(0);
  });

  test('returns empty array for no legs', () => {
    expect(parseSteps({ legs: [] })).toEqual([]);
    expect(parseSteps({})).toEqual([]);
  });

  test('skips legs without steps', () => {
    const routeData = {
      legs: [
        { steps: [{ navigationInstruction: { instructions: 'Go' }, distanceMeters: 50 }] },
        { /* no steps */ },
        { steps: [{ navigationInstruction: { instructions: 'Stop' }, distanceMeters: 30 }] }
      ]
    };

    const steps = parseSteps(routeData);
    expect(steps).toHaveLength(2);
    expect(steps[0].number).toBe(1);
    expect(steps[1].number).toBe(2);
  });

  test('handles a realistic Routes API response structure', () => {
    const routeData = {
      distanceMeters: 8046,
      duration: '5400s',
      legs: [
        {
          distanceMeters: 2000,
          duration: '1200s',
          steps: [
            {
              navigationInstruction: { instructions: 'Head northeast on Broadway toward W 42nd St' },
              distanceMeters: 150,
              staticDuration: '120s'
            },
            {
              navigationInstruction: { instructions: 'Turn right onto 7th Ave' },
              distanceMeters: 800,
              staticDuration: '600s'
            },
            {
              navigationInstruction: { instructions: 'Turn left onto W 34th St' },
              distanceMeters: 1050,
              staticDuration: '480s'
            }
          ]
        },
        {
          distanceMeters: 6046,
          duration: '4200s',
          steps: [
            {
              navigationInstruction: { instructions: 'Continue on W 34th St' },
              distanceMeters: 500,
              staticDuration: '300s'
            },
            {
              navigationInstruction: { instructions: 'Turn right onto 5th Ave' },
              distanceMeters: 5546,
              staticDuration: '3900s'
            }
          ]
        }
      ]
    };

    const steps = parseSteps(routeData);
    expect(steps).toHaveLength(5);
    expect(steps[0].instruction).toBe('Head northeast on Broadway toward W 42nd St');
    expect(steps[2].instruction).toBe('Turn left onto W 34th St');
    expect(steps[4].instruction).toBe('Turn right onto 5th Ave');
    expect(steps[4].distanceMeters).toBe(5546);
  });
});
