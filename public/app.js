let map;
let startMarker;
let startLocation = null;
let currentPolyline = null;
let waypointMarkers = [];
let lastDistanceMiles = null;
let lastActualDistanceMeters = null;

// Boundary state
let boundaryMode = false;
let boundaryVertices = [];
let boundaryMarkers = [];
let boundaryPolygon = null;
let boundaryPreview = null; // live polyline while drawing

const searchInput = document.getElementById('search');
const distanceInput = document.getElementById('distance');
const generateBtn = document.getElementById('generate');
const regenerateBtn = document.getElementById('regenerate');
const setBoundaryBtn = document.getElementById('set-boundary');
const doneBoundaryBtn = document.getElementById('done-boundary');
const clearBoundaryBtn = document.getElementById('clear-boundary');
const routeInfo = document.getElementById('route-info');
const infoDistance = document.getElementById('info-distance');
const infoDuration = document.getElementById('info-duration');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');

// --- Init ---

async function init() {
  try {
    const res = await fetch('/api/config');
    const { apiKey } = await res.json();
    await loadGoogleMaps(apiKey);
    initMap();
    initAutocomplete();
    initEvents();
  } catch (err) {
    showError('Failed to initialize: ' + err.message);
  }
}

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
}

function initMap() {
  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 39.8283, lng: -98.5795 }, // Center of US
    zoom: 4,
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    styles: [
      { elementType: 'geometry', stylers: [{ color: '#212121' }] },
      { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
      { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
      { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#373737' }] },
      { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
      { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1626' }] },
      { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
      { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    ]
  });

  // Click to set starting point or draw boundary
  map.addListener('click', (e) => {
    if (boundaryMode) {
      handleBoundaryClick(e.latLng.lat(), e.latLng.lng());
    } else {
      setStartLocation(e.latLng.lat(), e.latLng.lng());
      reverseGeocode(e.latLng);
    }
  });

  // Try geolocation
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setCenter({ lat: latitude, lng: longitude });
        map.setZoom(14);
      },
      () => {} // Ignore errors, keep default center
    );
  }
}

function initAutocomplete() {
  const autocomplete = new google.maps.places.Autocomplete(searchInput, {
    fields: ['geometry', 'name']
  });

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.geometry) return;

    const loc = place.geometry.location;
    setStartLocation(loc.lat(), loc.lng());
    map.setCenter(loc);
    map.setZoom(14);
  });
}

function initEvents() {
  // Preset buttons
  document.querySelectorAll('#presets button').forEach(btn => {
    btn.addEventListener('click', () => {
      const miles = parseFloat(btn.dataset.miles);
      distanceInput.value = miles;
      document.querySelectorAll('#presets button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Sync active preset with manual input
  distanceInput.addEventListener('input', () => {
    const val = parseFloat(distanceInput.value);
    document.querySelectorAll('#presets button').forEach(btn => {
      btn.classList.toggle('active', parseFloat(btn.dataset.miles) === val);
    });
  });

  generateBtn.addEventListener('click', () => computeRoute(false));
  regenerateBtn.addEventListener('click', () => computeRoute(true));

  setBoundaryBtn.addEventListener('click', toggleBoundaryMode);
  doneBoundaryBtn.addEventListener('click', finishBoundary);
  clearBoundaryBtn.addEventListener('click', clearBoundary);
}

// --- Start location ---

function setStartLocation(lat, lng) {
  startLocation = { lat, lng };

  if (startMarker) {
    startMarker.setPosition(startLocation);
  } else {
    startMarker = new google.maps.Marker({
      position: startLocation,
      map: map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#3b82f6',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3
      },
      zIndex: 100
    });
  }

  generateBtn.disabled = false;
}

function reverseGeocode(latLng) {
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ location: latLng }, (results, status) => {
    if (status === 'OK' && results[0]) {
      searchInput.value = results[0].formatted_address;
    }
  });
}

// --- Route computation ---

async function computeRoute(isRegenerate) {
  if (!startLocation) return;

  const distanceMiles = parseFloat(distanceInput.value);
  if (!distanceMiles || distanceMiles < 0.5 || distanceMiles > 50) {
    showError('Enter a distance between 0.5 and 50 miles');
    return;
  }

  showLoading(true);
  hideError();
  routeInfo.hidden = true;
  generateBtn.disabled = true;
  regenerateBtn.disabled = true;

  try {
    let waypoints;
    let routeData;
    let attempts = 0;
    const maxAttempts = 3;
    let lastRadius = null;

    while (attempts < maxAttempts) {
      attempts++;

      if (attempts === 1 || !lastActualDistanceMeters) {
        waypoints = generateWaypoints(startLocation.lat, startLocation.lng, distanceMiles, null, boundaryVertices);
      } else {
        // Adjust based on previous result
        const targetMeters = distanceMiles * 1609.34;
        const ratio = targetMeters / lastActualDistanceMeters;
        const baseRadius = (distanceMiles * 1609.34) / (2 * Math.PI * 1.3);
        const adjustedRadius = (lastRadius || baseRadius) * Math.sqrt(ratio);
        lastRadius = adjustedRadius;
        waypoints = generateWaypoints(startLocation.lat, startLocation.lng, distanceMiles, adjustedRadius, boundaryVertices);
      }

      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: startLocation, waypoints })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.details || data.error || 'Route generation failed');
      }

      if (!data.routes || data.routes.length === 0) {
        throw new Error('No route found. Try a different starting location.');
      }

      routeData = data.routes[0];
      lastActualDistanceMeters = routeData.distanceMeters;

      const targetMeters = distanceMiles * 1609.34;
      const pctDiff = Math.abs(lastActualDistanceMeters - targetMeters) / targetMeters;

      if (pctDiff <= 0.10 || attempts >= maxAttempts) {
        break;
      }
    }

    lastDistanceMiles = distanceMiles;
    drawRoute(routeData);
    showRouteInfo(routeData);
    regenerateBtn.disabled = false;
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
    generateBtn.disabled = !startLocation;
  }
}

// --- Drawing ---

function drawRoute(routeData) {
  clearRoute();

  const path = google.maps.geometry.encoding.decodePath(routeData.polyline.encodedPolyline);

  currentPolyline = new google.maps.Polyline({
    path: path,
    geodesic: true,
    strokeColor: '#3b82f6',
    strokeOpacity: 0.9,
    strokeWeight: 5,
    map: map
  });

  // Fit map to route
  const bounds = new google.maps.LatLngBounds();
  path.forEach(point => bounds.extend(point));
  bounds.extend(startMarker.getPosition());
  map.fitBounds(bounds, { top: 20, right: 20, bottom: 20, left: 360 });
}

function clearRoute() {
  if (currentPolyline) {
    currentPolyline.setMap(null);
    currentPolyline = null;
  }
  waypointMarkers.forEach(m => m.setMap(null));
  waypointMarkers = [];
}

// --- UI helpers ---

function showRouteInfo(routeData) {
  const miles = (routeData.distanceMeters / 1609.34).toFixed(2);
  const totalSeconds = parseInt(routeData.duration.replace('s', ''));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  infoDistance.textContent = `${miles} mi`;
  if (hours > 0) {
    infoDuration.textContent = `${hours}h ${minutes}m`;
  } else {
    infoDuration.textContent = `${minutes}m`;
  }
  routeInfo.hidden = false;
}

function showLoading(show) {
  loadingEl.hidden = !show;
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = false;
}

function hideError() {
  errorEl.hidden = true;
}

// --- Boundary ---

function toggleBoundaryMode() {
  if (boundaryMode) {
    // Cancel drawing mode — remove preview markers/lines but keep any existing polygon
    cancelBoundaryDrawing();
  } else {
    boundaryMode = true;
    boundaryVertices = [];
    setBoundaryBtn.classList.add('drawing');
    setBoundaryBtn.textContent = 'Drawing... (click map)';
    doneBoundaryBtn.hidden = false;

    // Clear any existing finalized polygon
    if (boundaryPolygon) {
      boundaryPolygon.setMap(null);
      boundaryPolygon = null;
    }
    clearBoundaryBtn.hidden = true;
  }
}

function handleBoundaryClick(lat, lng) {
  boundaryVertices.push({ lat, lng });

  // Add a small marker at the vertex
  const marker = new google.maps.Marker({
    position: { lat, lng },
    map: map,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 6,
      fillColor: '#f59e0b',
      fillOpacity: 1,
      strokeColor: '#fff',
      strokeWeight: 2
    },
    zIndex: 50
  });
  boundaryMarkers.push(marker);

  // Update the live preview polyline
  updateBoundaryPreview();

  setBoundaryBtn.textContent = `Drawing... (${boundaryVertices.length} points)`;
}

function updateBoundaryPreview() {
  if (boundaryPreview) {
    boundaryPreview.setMap(null);
  }

  if (boundaryVertices.length < 2) return;

  // Show a closed polyline preview connecting all points back to start
  const path = [...boundaryVertices, boundaryVertices[0]];
  boundaryPreview = new google.maps.Polyline({
    path: path,
    strokeColor: '#f59e0b',
    strokeOpacity: 0.6,
    strokeWeight: 2,
    geodesic: true,
    map: map
  });
}

function finishBoundary() {
  if (boundaryVertices.length < 3) {
    showError('Draw at least 3 points to create a boundary');
    return;
  }

  hideError();

  // Remove preview polyline
  if (boundaryPreview) {
    boundaryPreview.setMap(null);
    boundaryPreview = null;
  }

  // Remove vertex markers
  boundaryMarkers.forEach(m => m.setMap(null));
  boundaryMarkers = [];

  // Draw the finalized polygon
  boundaryPolygon = new google.maps.Polygon({
    paths: boundaryVertices,
    strokeColor: '#f59e0b',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#f59e0b',
    fillOpacity: 0.08,
    clickable: false,
    zIndex: 1,
    map: map
  });

  // Exit drawing mode
  boundaryMode = false;
  setBoundaryBtn.classList.remove('drawing');
  setBoundaryBtn.textContent = 'Draw Boundary';
  doneBoundaryBtn.hidden = true;
  clearBoundaryBtn.hidden = false;
}

function cancelBoundaryDrawing() {
  boundaryMode = false;
  boundaryVertices = [];

  // Remove preview
  if (boundaryPreview) {
    boundaryPreview.setMap(null);
    boundaryPreview = null;
  }

  // Remove vertex markers
  boundaryMarkers.forEach(m => m.setMap(null));
  boundaryMarkers = [];

  setBoundaryBtn.classList.remove('drawing');
  setBoundaryBtn.textContent = 'Draw Boundary';
  doneBoundaryBtn.hidden = true;
}

function clearBoundary() {
  boundaryVertices = [];
  boundaryMode = false;

  if (boundaryPreview) {
    boundaryPreview.setMap(null);
    boundaryPreview = null;
  }

  boundaryMarkers.forEach(m => m.setMap(null));
  boundaryMarkers = [];

  if (boundaryPolygon) {
    boundaryPolygon.setMap(null);
    boundaryPolygon = null;
  }

  setBoundaryBtn.classList.remove('drawing');
  setBoundaryBtn.textContent = 'Draw Boundary';
  doneBoundaryBtn.hidden = true;
  clearBoundaryBtn.hidden = true;
}

// --- Boot ---
init();
