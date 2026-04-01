#!/usr/bin/env node
/**
 * mock-drag.js — HoldFast drag simulation script
 *
 * Simulates a boat slowly dragging past the anchor radius by injecting
 * spoofed location events into the app via Expo's location mock mechanism.
 *
 * Usage:
 *   node scripts/mock-drag.js
 *
 * Behaviour:
 *   1. Starts at the anchor position (0m drift)
 *   2. Drifts outward every 3 seconds
 *   3. Passes through nudge (80%), alert (100%), emergency (120%) thresholds
 *   4. Then circles back to safe zone
 *
 * Requirements:
 *   - Expo dev client running on device/simulator
 *   - App running with __DEV__ = true
 *   - Adjust ANCHOR_LAT/LON to match your test anchor
 */

const http = require('http');

// ── Config ────────────────────────────────────────────────────────────────────

const ANCHOR_LAT = 55.9533;       // Edinburgh (example)
const ANCHOR_LON = -3.1883;
const WATCH_RADIUS_M = 30;        // Must match app setting
const STEP_INTERVAL_MS = 3000;
const EARTH_RADIUS_M = 6_371_000;

// Expo dev tools location injection endpoint (Expo SDK 50+)
const EXPO_HOST = 'localhost';
const EXPO_PORT = 8081;
const EXPO_LOCATION_ENDPOINT = '/api/location';

// ── Helpers ───────────────────────────────────────────────────────────────────

function offsetCoord(lat, lon, northM, eastM) {
  const dLat = (northM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon =
    (eastM / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180))) *
    (180 / Math.PI);
  return { latitude: lat + dLat, longitude: lon + dLon };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Mock location sequence ────────────────────────────────────────────────────

const scenario = [
  // Phase 1: Safe zone (0-24m)
  { label: 'SAFE   (0m)',     northM: 0,  eastM: 0 },
  { label: 'SAFE   (5m)',     northM: 5,  eastM: 0 },
  { label: 'SAFE   (10m)',    northM: 10, eastM: 0 },
  { label: 'SAFE   (15m)',    northM: 15, eastM: 0 },
  { label: 'SAFE   (20m)',    northM: 20, eastM: 0 },
  // Phase 2: Nudge zone (24-30m = 80-100% of 30m radius)
  { label: 'NUDGE  (24m)',    northM: 24, eastM: 0 },
  { label: 'NUDGE  (27m)',    northM: 27, eastM: 0 },
  // Phase 3: Alert (at boundary = 30m)
  { label: 'ALERT  (30m)',    northM: 30, eastM: 0 },
  // Phase 4: Emergency (>36m = 120%)
  { label: 'EMERGENCY (36m)', northM: 36, eastM: 0 },
  { label: 'EMERGENCY (40m)', northM: 40, eastM: 2 },
  { label: 'EMERGENCY (44m)', northM: 44, eastM: 4 },
  // Phase 5: Recovery — drift back
  { label: 'RECOVERING (35m)', northM: 35, eastM: 0 },
  { label: 'RECOVERING (25m)', northM: 25, eastM: 0 },
  { label: 'SAFE   (15m)',    northM: 15, eastM: 0 },
  { label: 'SAFE   (5m)',     northM: 5,  eastM: 0 },
  { label: 'SAFE   (0m)',     northM: 0,  eastM: 0 },
];

// ── Inject location into Expo ─────────────────────────────────────────────────

function injectLocation(lat, lon) {
  const body = JSON.stringify({
    latitude: lat,
    longitude: lon,
    accuracy: 3,
    altitude: 5,
    altitudeAccuracy: 5,
    heading: 0,
    speed: 0.5,
  });

  const options = {
    hostname: EXPO_HOST,
    port: EXPO_PORT,
    path: EXPO_LOCATION_ENDPOINT,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', () => {
      // Expo dev server may not have this endpoint — fall back to console output
      resolve();
    });
    req.write(body);
    req.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  HoldFast — Drag Simulation');
  console.log('  ================================');
  console.log(`  Anchor: ${ANCHOR_LAT.toFixed(5)}, ${ANCHOR_LON.toFixed(5)}`);
  console.log(`  Radius: ${WATCH_RADIUS_M}m`);
  console.log(`  Steps:  ${scenario.length} positions @ ${STEP_INTERVAL_MS / 1000}s intervals`);
  console.log('');

  for (const step of scenario) {
    const { latitude, longitude } = offsetCoord(
      ANCHOR_LAT,
      ANCHOR_LON,
      step.northM,
      step.eastM
    );

    const distance = Math.sqrt(step.northM ** 2 + step.eastM ** 2).toFixed(1);

    console.log(
      `  [${step.label.padEnd(22)}]  lat=${latitude.toFixed(6)}  lon=${longitude.toFixed(6)}  dist=${distance}m`
    );

    await injectLocation(latitude, longitude);
    await sleep(STEP_INTERVAL_MS);
  }

  console.log('');
  console.log('  Simulation complete.');
  console.log('');
}

main().catch(console.error);
