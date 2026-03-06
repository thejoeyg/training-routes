/**
 * Tests for unit toggle logic (mi/km).
 * Pure functions extracted from app.js for isolated testing.
 */

// --- kmToMiles ---

describe('kmToMiles', () => {
  function kmToMiles(km) {
    return km / 1.60934;
  }

  test('converts 1 km to ~0.621 miles', () => {
    expect(kmToMiles(1)).toBeCloseTo(0.6214, 3);
  });

  test('converts 5 km to ~3.107 miles', () => {
    expect(kmToMiles(5)).toBeCloseTo(3.107, 2);
  });

  test('converts 10 km to ~6.214 miles', () => {
    expect(kmToMiles(10)).toBeCloseTo(6.214, 2);
  });

  test('converts 21.1 km (half marathon) to ~13.1 miles', () => {
    expect(kmToMiles(21.1)).toBeCloseTo(13.1, 1);
  });

  test('converts 42.2 km (full marathon) to ~26.2 miles', () => {
    expect(kmToMiles(42.2)).toBeCloseTo(26.2, 1);
  });

  test('returns 0 for 0 km', () => {
    expect(kmToMiles(0)).toBe(0);
  });

  test('is the inverse of miles-to-km conversion', () => {
    const miles = 5;
    const km = miles * 1.60934;
    expect(kmToMiles(km)).toBeCloseTo(miles, 5);
  });
});

// --- inputToMiles ---

describe('inputToMiles', () => {
  // Replicate the function with explicit useKm param for testability
  function kmToMiles(km) {
    return km / 1.60934;
  }

  function inputToMiles(value, useKm) {
    return useKm ? kmToMiles(value) : value;
  }

  test('returns value as-is in miles mode', () => {
    expect(inputToMiles(5, false)).toBe(5);
    expect(inputToMiles(13.1, false)).toBe(13.1);
  });

  test('converts km to miles in km mode', () => {
    expect(inputToMiles(5, true)).toBeCloseTo(3.107, 2);
    expect(inputToMiles(10, true)).toBeCloseTo(6.214, 2);
  });

  test('round-trip: 5 mi → km → miles stays close to 5', () => {
    const km = 5 * 1.60934;
    expect(inputToMiles(km, true)).toBeCloseTo(5, 5);
  });
});

// --- formatStepDistance ---

describe('formatStepDistance (mi mode)', () => {
  function formatStepDistance(meters, useKm) {
    if (useKm) {
      if (meters >= 100) {
        return `${(meters / 1000).toFixed(2)} km`;
      }
      return `${Math.round(meters)} m`;
    }
    if (meters >= 161) {
      return `${(meters / 1609.34).toFixed(2)} mi`;
    }
    return `${Math.round(meters * 3.28084)} ft`;
  }

  test('formats short distances in feet', () => {
    expect(formatStepDistance(10, false)).toBe('33 ft');
    expect(formatStepDistance(160, false)).toBe('525 ft');
  });

  test('formats longer distances in miles', () => {
    expect(formatStepDistance(161, false)).toBe('0.10 mi');
    expect(formatStepDistance(1609.34, false)).toBe('1.00 mi');
  });

  test('threshold is at 161 meters', () => {
    expect(formatStepDistance(160, false)).toContain('ft');
    expect(formatStepDistance(161, false)).toContain('mi');
  });
});

describe('formatStepDistance (km mode)', () => {
  function formatStepDistance(meters, useKm) {
    if (useKm) {
      if (meters >= 100) {
        return `${(meters / 1000).toFixed(2)} km`;
      }
      return `${Math.round(meters)} m`;
    }
    if (meters >= 161) {
      return `${(meters / 1609.34).toFixed(2)} mi`;
    }
    return `${Math.round(meters * 3.28084)} ft`;
  }

  test('formats short distances in meters', () => {
    expect(formatStepDistance(10, true)).toBe('10 m');
    expect(formatStepDistance(50, true)).toBe('50 m');
    expect(formatStepDistance(99, true)).toBe('99 m');
  });

  test('formats longer distances in km', () => {
    expect(formatStepDistance(100, true)).toBe('0.10 km');
    expect(formatStepDistance(1000, true)).toBe('1.00 km');
    expect(formatStepDistance(5000, true)).toBe('5.00 km');
  });

  test('threshold is at 100 meters', () => {
    expect(formatStepDistance(99, true)).toContain('m');
    expect(formatStepDistance(99, true)).not.toContain('km');
    expect(formatStepDistance(100, true)).toContain('km');
  });

  test('rounds meters to nearest integer', () => {
    expect(formatStepDistance(50, true)).toBe('50 m');
    expect(formatStepDistance(73, true)).toBe('73 m');
  });

  test('shows two decimal places for km', () => {
    expect(formatStepDistance(1500, true)).toBe('1.50 km');
    expect(formatStepDistance(2250, true)).toBe('2.25 km');
  });
});

// --- preset value lookup ---

describe('preset value lookup', () => {
  // Mirrors the data-miles / data-km values from index.html
  const presets = [
    { miles: '3',    km: '3'    },
    { miles: '5',    km: '5'    },
    { miles: '10',   km: '10'   },
    { miles: '13.1', km: '21.1' },
    { miles: '26.2', km: '42.2' },
  ];

  function getPresetValue(preset, useKm) {
    return parseFloat(useKm ? preset.km : preset.miles);
  }

  test('returns miles values in mi mode', () => {
    expect(getPresetValue(presets[0], false)).toBe(3);
    expect(getPresetValue(presets[2], false)).toBe(10);
    expect(getPresetValue(presets[3], false)).toBe(13.1);
    expect(getPresetValue(presets[4], false)).toBe(26.2);
  });

  test('returns km values in km mode', () => {
    expect(getPresetValue(presets[0], true)).toBe(3);
    expect(getPresetValue(presets[2], true)).toBe(10);
    expect(getPresetValue(presets[3], true)).toBe(21.1);
    expect(getPresetValue(presets[4], true)).toBe(42.2);
  });

  test('numeric presets are the same round numbers in both units', () => {
    // 3, 5, 10 should be identical in both mi and km
    [presets[0], presets[1], presets[2]].forEach(p => {
      expect(p.miles).toBe(p.km);
    });
  });

  test('Half (13.1 mi) maps to 21.1 km', () => {
    expect(getPresetValue(presets[3], true)).toBeCloseTo(21.1, 1);
  });

  test('Full (26.2 mi) maps to 42.2 km', () => {
    expect(getPresetValue(presets[4], true)).toBeCloseTo(42.2, 1);
  });

  test('Half and Full km values are approximately correct conversions', () => {
    expect(13.1 * 1.60934).toBeCloseTo(21.1, 0);
    expect(26.2 * 1.60934).toBeCloseTo(42.2, 0);
  });
});
