# Training Routes

A personal web app for marathon training that generates circular running routes. Set a starting point and a target distance, and the app creates a loop route on real roads that starts and ends at the same location.

Built with Node.js/Express, vanilla JS, and the Google Maps and Routes APIs. Runs in Docker.

## How It Works

1. Pick a starting point by searching for an address or clicking the map
2. Set your target distance (or use presets: 3mi, 5mi, 10mi, half marathon, full marathon)
3. Click **Generate Route** — the app places waypoints in a loop around your start point, calls the Google Routes API to snap them to walkable roads, and iterates up to 3 times to land within 10% of your target distance
4. Click **Regenerate** to get a different route for the same distance

The UI is responsive — works as a sidebar on desktop and a bottom sheet on mobile (accessible via ngrok).

## Prerequisites

- Docker (or Node.js 20+)
- A Google Cloud project with billing enabled
- The following APIs enabled in your Google Cloud Console:
  - **Maps JavaScript API**
  - **Routes API**
- A Google API key

## Setup

1. Clone the repo and create your `.env` file:

   ```sh
   cd training-routes
   cp .env.example .env
   ```

2. Edit `.env` and add your Google API key:

   ```
   GOOGLE_MAPS_API_KEY=your_key_here
   ```

3. Run with Docker:

   ```sh
   docker compose up --build
   ```

   Or run directly with Node:

   ```sh
   npm install
   node server.js
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Mobile Access via ngrok

To use the app on your phone:

```sh
ngrok http 3000
```

Open the ngrok URL on your phone. If your Google API key has HTTP referrer restrictions, add the ngrok domain to the allowed referrers in the Google Cloud Console.

## Project Structure

```
server.js                 Express server — serves static files and proxies Routes API calls
public/
  index.html              Single-page UI
  style.css               Dark theme, responsive layout
  app.js                  Map initialization, UI events, route display
  route-generator.js      Waypoint generation math and distance refinement
Dockerfile                Single-stage Node 20 Alpine image
docker-compose.yml        Reads API key from .env, exposes port 3000
```
