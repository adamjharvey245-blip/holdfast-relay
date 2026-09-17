# HoldFast Anchor Alarm — Developer Guide

A production-grade anchor drag alarm for iOS and Android, built with React Native and Expo.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start Expo dev server
npx expo start

# 3. Run on device (recommended — GPS not available in simulator)
npx expo run:ios     # requires Xcode + Apple Developer account
npx expo run:android # requires Android Studio + device/emulator
```

> **Important:** GPS "Always" permission requires a physical device. Simulators
> can inject mock locations but do not emulate background location services.

---

## Project Structure

```
holdfast/
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout (GPS init, alarm system, relay)
│   ├── index.tsx           # Main screen (map + controls)
│   ├── onboarding.tsx      # First-run onboarding (permissions + setup)
│   ├── remote.tsx          # Remote watch panel
│   └── settings.tsx        # Settings / info
│
├── src/
│   ├── hooks/
│   │   ├── useGpsTracker.ts    # expo-location foreground + background task
│   │   ├── useAlarmSystem.ts   # In-app siren/vibration + foreground notifications
│   │   └── useSilentModeWarning.ts # Warns when backgrounded with phone on silent
│   │
│   ├── components/
│   │   ├── RadarMap.tsx         # react-native-maps with dark maritime style
│   │   ├── StatusPulse.tsx      # Animated status indicator
│   │   ├── TimeSlider.tsx       # Retroactive anchor positioning
│   │   ├── RadiusControl.tsx    # Drag radius setter
│   │   └── RemoteWatchPanel.tsx # 4-digit code + share link
│   │
│   ├── services/
│   │   ├── alarmNotifications.ts # SINGLE SOURCE for channel IDs + alarm notification content
│   │   └── websocketRelay.ts    # WebSocket relay client
│   │
│   ├── store/
│   │   └── anchorStore.ts       # Zustand global state
│   │
│   ├── types/index.ts           # All TypeScript interfaces
│   ├── utils/
│   │   ├── haversine.ts         # Haversine formula + geometry helpers
│   │   ├── alarmLevel.ts        # Pure distance → alarm level + tide radius maths
│   │   └── trackSegments.ts     # Snail-trail segmentation (reference-stable)
│   └── __tests__/               # Jest unit tests (npm test)
│
├── server/
│   ├── relay.js            # Node.js WebSocket relay server
│   └── watch.html          # Browser watch page (served by relay)
│
└── scripts/
    └── mock-drag.js        # Drag simulation for testing
```

---

## Background Location Architecture

### The Problem
iOS and Android aggressively kill background processes to save battery.
HoldFast uses a two-layer approach to survive OS suspension.

### Layer 1 — Foreground Subscription (`useGpsTracker.ts`)
```
Location.watchPositionAsync()
  accuracy: BestForNavigation
  timeInterval: 3000ms
  distanceInterval: 2m
```
Active when the app is in the foreground. Drives UI updates.

### Layer 2 — Background Task (`HOLDFAST_BG_LOCATION`)
```
Location.startLocationUpdatesAsync()
  accuracy: BestForNavigation
  timeInterval: 10000ms
  distanceInterval: 5m
  foregroundService: { ... }  ← Android: prevents task kill
  pausesUpdatesAutomatically: false
  activityType: OtherNavigation  ← iOS: navigation mode keeps GPS awake
```
Registered as an `expo-task-manager` task at **module level** (outside any component).
This is critical — the task must be defined before the React tree mounts so
the OS can wake the app into it.

### iOS Specific
- `UIBackgroundModes: ["location"]` in `app.json` → `Info.plist`
- `showsBackgroundLocationIndicator: true` → blue status bar strip
- `activityType: OtherNavigation` → tells CoreLocation to stay awake

### Android Specific
- `ACCESS_BACKGROUND_LOCATION` permission (requires separate runtime prompt on API 29+)
- `FOREGROUND_SERVICE_LOCATION` permission (API 34+)
- Foreground service notification keeps the process alive
- The notification cannot be dismissed while watch is active

---

## Alarm System

### Progressive Urgency
| Level       | Trigger                              | Notification                        | Sound           |
|-------------|--------------------------------------|-------------------------------------|-----------------|
| `silent`    | < 80% of radius                      | None                                | —               |
| `nudge`     | 80–100% of radius                    | Default priority                    | None            |
| `alert`     | At boundary (100%)                   | High priority, bypass DnD           | alarm.wav       |
| `emergency` | > emergencyThresholdPct% of radius   | MAX priority, bypass DnD            | alarm.wav       |
| `gps_lost`  | No GPS fix for configured seconds    | MAX priority, bypass DnD            | alarm.wav       |

`emergencyThresholdPct` is user-configurable in Settings (default 120%).

### iOS Critical Alerts
Requires entitlement from Apple: `com.apple.developer.usernotifications.critical-alerts`.
In development, request with `allowCriticalAlerts: true` in `requestPermissionsAsync`.
Critical Alerts bypass Silent Mode and Focus modes at full volume.

The code already requests the permission and sends alarm notifications with
`interruptionLevel: 'critical'`, but iOS silently downgrades them until the
entitlement is granted. **Do not add the entitlement to `app.json` before Apple
approves it** — EAS cannot generate a matching provisioning profile and the build
fails at signing. Apply at https://developer.apple.com/contact/request/notifications-critical-alerts-entitlement/
then, once approved, add:

```json
"ios": {
  "entitlements": {
    "com.apple.developer.usernotifications.critical-alerts": true
  }
}
```

### Sounding through Silent Mode
- **iOS, app alive:** `playsInSilentModeIOS: true` on the expo-av loop plays through the
  mute switch. `UIBackgroundModes` includes `audio` so the loop keeps going in the background.
- **iOS, app suspended:** only a Critical Alert notification sounds on silent (see above).
  Without the entitlement, silent = vibration only.
- **Android:** alarm channels use `AndroidAudioUsage.ALARM`, so notification sound rides the
  ALARM stream, which the ringer's silent/vibrate modes do not mute. Channels are immutable
  once created, so any change to their audio settings needs a new channel ID (currently `_v2`).
- `useSilentModeWarning` posts a warning when the app is backgrounded with the phone on silent.

### Two alarm paths, one notification module
Alarm notifications are posted from two places: `useAlarmSystem` (React mounted)
and the `HOLDFAST_BG_LOCATION` task in `useGpsTracker` (React NOT mounted — iOS
cold-start). Both import channel IDs and content from
`src/services/alarmNotifications.ts`. **Never hard-code a channel ID anywhere
else** — a channel that isn't created falls back to Android's "Miscellaneous"
channel (no alarm sound, no DnD bypass) with no error. The test in
`src/__tests__/alarmNotifications.test.ts` guards this.

### Android Alarm Stream
Channels with `bypassDnd: true` and `importance: MAX` use the ALARM notification
channel category, which bypasses Do Not Disturb on Android 8+.

### GPS Deadman Switch
`useAnchorLogic.ts` starts a timeout (configurable, default 60s) each time a GPS fix arrives.
If no fix arrives within that time, `gpsStatus` → `'lost'` and the `EMERGENCY` alarm fires
with a "Signal Lost" message. The timer resets on every valid fix.

---

## Remote Watch (WebSocket Relay)

### Architecture
```
Boat App ──WS──► Relay Server ──WS──► Browser Watch Page
                     │
                     └──WS──► Any other watchers (same code)
```

### Setup
1. Deploy `server/relay.js` to any Node.js host:
   ```bash
   # Example: Railway, Fly.io, DigitalOcean App Platform
   npm install ws
   node server/relay.js
   ```

2. Update the URLs in the app source:
   - `src/services/websocketRelay.ts` → `RELAY_WS_URL`
   - `src/components/RemoteWatchPanel.tsx` → `RELAY_BASE_URL`

3. Share `https://your-relay.example.com/watch?code=XXXX`

### Protocol
All messages are JSON `RelayMessage` objects:
```typescript
{ type: 'position' | 'anchor' | 'alarm' | 'status', code: string, payload: ..., ts: number }
```

### Security
The 4-digit code is a simple shared secret — anyone with the code can view.
Generate a new code to revoke access. For production, consider a longer token.

---

## Testing the Alarm — Mock Drag Script

```bash
node scripts/mock-drag.js
```

Walks through all alarm thresholds over ~48 seconds:
- 0m → 44m (past all thresholds) → back to 0m

The script attempts to inject locations via Expo's dev server API.
If that endpoint is unavailable, position data is printed to console
(use `expo-location`'s `setMockLocationAsync` in the app for simulator testing).

---

## Build & Deploy

### EAS Build (recommended)
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios     # TestFlight / App Store
eas build --platform android # Google Play
```

### Key `app.json` settings to verify before release
- `ios.bundleIdentifier` — must match App Store Connect (`com.holdfast.app`)
- `android.package` — must match Google Play Console (`com.holdfast.app`)
- `ios.infoPlist.NSLocationAlwaysAndWhenInUseUsageDescription` — App Store review requires a clear explanation
- `android.permissions` includes `ACCESS_BACKGROUND_LOCATION`

### Apple App Store Notes
- Background location requires justification in App Store review
- Critical Alerts entitlement requires Apple approval
- Describe the maritime safety use case clearly

---

## Linting & Tests

```bash
npx expo lint
npm test
```

Run both after each major change. ESLint config is managed by Expo's default
preset. Tests use `jest-expo`; keep safety-critical logic (distance maths, alarm
levels, notification channels) in pure modules under `src/utils` /
`src/services` so it stays unit-testable without native mocks.

---

## Environment Variables

No secrets are required for basic operation. For relay server:
```
PORT=8080   (server/relay.js)
```
Add to your hosting platform's environment config.
