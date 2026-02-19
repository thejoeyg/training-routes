const METERS_PER_MILE = 1609.34;
const METERS_PER_DEGREE_LAT = 111320;
const ROAD_WINDING_FACTOR = 1.3;

function getWaypointCount(distanceMiles) {
  if (distanceMiles < 5) return 4;
  if (distanceMiles < 13) return 6;
  return 8;
}

/**
 * Ray-casting point-in-polygon test.
 * Returns true if (lat, lng) is inside the polygon.
 */
function pointInPolygon(lat, lng, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i].lat, xi = polygon[i].lng;
    const yj = polygon[j].lat, xj = polygon[j].lng;
    if ((yi > lat) !== (yj > lat) &&
        lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Project point (lat, lng) onto the line segment from A to B.
 * Returns the closest point on the segment.
 */
function projectToSegment(lat, lng, a, b) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) return { lat: a.lat, lng: a.lng };

  let t = ((lng - a.lng) * dx + (lat - a.lat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  return {
    lat: a.lat + t * dy,
    lng: a.lng + t * dx
  };
}

/**
 * Find the nearest point on the polygon boundary to (lat, lng).
 * Then nudge it slightly inward toward the polygon centroid.
 */
function nearestPointOnPolygon(lat, lng, polygon) {
  let bestDist = Infinity;
  let bestPoint = { lat, lng };

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const proj = projectToSegment(lat, lng, polygon[j], polygon[i]);
    const d = (proj.lat - lat) ** 2 + (proj.lng - lng) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestPoint = proj;
    }
  }

  // Nudge slightly inward toward centroid so the point is inside the polygon
  const centroid = polygonCentroid(polygon);
  const nudge = 0.02; // 2% toward centroid
  return {
    lat: bestPoint.lat + (centroid.lat - bestPoint.lat) * nudge,
    lng: bestPoint.lng + (centroid.lng - bestPoint.lng) * nudge
  };
}

/**
 * Compute the centroid of a polygon.
 */
function polygonCentroid(polygon) {
  let latSum = 0, lngSum = 0;
  for (const p of polygon) {
    latSum += p.lat;
    lngSum += p.lng;
  }
  return { lat: latSum / polygon.length, lng: lngSum / polygon.length };
}

/**
 * Generate waypoints forming a rough loop around the starting point.
 * Returns an array of {lat, lng} objects.
 * Optional boundary: array of {lat, lng} polygon vertices to constrain waypoints.
 */
function generateWaypoints(startLat, startLng, distanceMiles, radiusOverride, boundary) {
  const count = getWaypointCount(distanceMiles);
  const targetCircumferenceMeters = distanceMiles * METERS_PER_MILE;
  const radius = radiusOverride || targetCircumferenceMeters / (2 * Math.PI * ROAD_WINDING_FACTOR);

  const randomOffset = Math.random() * 2 * Math.PI;
  const startLatRad = (startLat * Math.PI) / 180;
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(startLatRad);

  const waypoints = [];
  for (let i = 0; i < count; i++) {
    const angle = randomOffset + (2 * Math.PI * i) / count;
    // Perturb radius slightly for variety
    const perturbedRadius = radius * (0.85 + Math.random() * 0.3);

    const dLat = (perturbedRadius * Math.cos(angle)) / METERS_PER_DEGREE_LAT;
    const dLng = (perturbedRadius * Math.sin(angle)) / metersPerDegreeLng;

    let lat = startLat + dLat;
    let lng = startLng + dLng;

    // Constrain to polygon boundary if set
    if (boundary && boundary.length >= 3) {
      if (!pointInPolygon(lat, lng, boundary)) {
        const nearest = nearestPointOnPolygon(lat, lng, boundary);
        lat = nearest.lat;
        lng = nearest.lng;
      }
    }

    waypoints.push({ lat, lng });
  }

  return waypoints;
}

/**
 * Given the actual route distance from the API, compute an adjusted radius
 * and regenerate waypoints to get closer to the target distance.
 */
function adjustWaypoints(startLat, startLng, distanceMiles, actualDistanceMeters, boundary) {
  const targetMeters = distanceMiles * METERS_PER_MILE;
  const currentCircumference = distanceMiles * METERS_PER_MILE;
  const currentRadius = currentCircumference / (2 * Math.PI * ROAD_WINDING_FACTOR);

  const ratio = targetMeters / actualDistanceMeters;
  const adjustedRadius = currentRadius * Math.sqrt(ratio);

  return generateWaypoints(startLat, startLng, distanceMiles, adjustedRadius, boundary);
}

// Export for testing (no-op in browser)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateWaypoints,
    adjustWaypoints,
    pointInPolygon,
    nearestPointOnPolygon,
    projectToSegment,
    polygonCentroid,
    getWaypointCount,
    METERS_PER_MILE,
    METERS_PER_DEGREE_LAT,
    ROAD_WINDING_FACTOR
  };
}
