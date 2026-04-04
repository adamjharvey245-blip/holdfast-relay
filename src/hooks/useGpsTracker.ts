import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useAnchorStore } from '@/store/anchorStore';
import type { TimestampedCoordinate } from '@/types';

export const BACKGROUND_LOCATION_TASK = 'HOLDFAST_BG_LOCATION';

// ── GPS config per battery mode ───────────────────────────────────────────────
// Precision: BestForNavigation (GPS + WiFi + Cell + barometer fusion) — maximum
//   accuracy and lock stability. Uses more power.
// Standard: Best (GPS primary) — high accuracy, lower power. Sufficient for
//   open anchorages where the watch radius is generous.
//
// We do NOT offer anything below Best — cell/WiFi-only accuracy (50–200m) is
// too coarse to be meaningful for an anchor alarm.

const GPS_CONFIGS = {
  precision: {
    fgTimeInterval: 3000,
    bgTimeInterval: 10_000,
    accuracy: Location.Accuracy.BestForNavigation,
  },
  standard: {
    fgTimeInterval: 5000,
    bgTimeInterval: 15_000,
    accuracy: Location.Accuracy.Best,
  },
} as const;

// ── Module-level GPS lost timer ───────────────────────────────────────────────
// Must live at module scope so the background task can reset it when a fix
// arrives while the screen is locked.

let gpsLostTimer: ReturnType<typeof setTimeout> | null = null;

function resetGpsLostTimer() {
  if (gpsLostTimer) clearTimeout(gpsLostTimer);
  const timeoutMs = (useAnchorStore.getState().alarmThresholds?.gpsLostSecs ?? 60) * 1000;
  gpsLostTimer = setTimeout(() => {
    const state = useAnchorStore.getState();
    if (state.gpsStatus !== 'lost') {
      state.setGpsStatus('lost');
      if (state.isWatchActive) state.setAlarmLevel('emergency');
    }
  }, timeoutMs);
}

// ── Background task — defined at module level (required by expo-task-manager) ─

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) {
    console.warn('[BG Location]', error.message);
    // Treat a background task error as an immediate GPS lost signal rather than
    // waiting for the timer. iOS fires this when the chip is throttled, the
    // signal is lost, or the task is being suspended.
    const state = useAnchorStore.getState();
    if (state.gpsStatus !== 'lost') {
      state.setGpsStatus('lost');
      if (state.isWatchActive) state.setAlarmLevel('emergency');
    }
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations[locations.length - 1];
    if (!latest) return;
    resetGpsLostTimer();
    useAnchorStore.getState().updateBoatPosition({
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      timestamp: latest.timestamp,
      accuracy: latest.coords.accuracy ?? undefined,
      speed: latest.coords.speed ?? undefined,
    });
  }
});

export function useGpsTracker() {
  const { updateBoatPosition, setGpsStatus } = useAnchorStore();
  const fgSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isStartedRef = useRef(false);

  const stopTracking = async () => {
    fgSubscriptionRef.current?.remove();
    fgSubscriptionRef.current = null;
    if (gpsLostTimer) {
      clearTimeout(gpsLostTimer);
      gpsLostTimer = null;
    }
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK
      ).catch(() => false);
      if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {}
  };

  const startTracking = async () => {
    // Read battery mode fresh at call time so restarts pick up the new value
    const batteryMode = useAnchorStore.getState().batteryMode ?? 'precision';
    const config = GPS_CONFIGS[batteryMode];

    // Step 1: foreground permission
    let fgStatus: string;
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      fgStatus = result.status;
    } catch (err) {
      console.warn('[GPS] Permission request failed:', err);
      setGpsStatus('lost');
      return;
    }

    if (fgStatus !== 'granted') {
      setGpsStatus('lost');
      return;
    }

    // Step 2: warm up the GPS chip with a one-shot fix
    try {
      await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch {
      // Chip not ready yet — continue anyway
    }

    // Step 3: continuous foreground watch
    try {
      fgSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: config.accuracy,
          timeInterval: config.fgTimeInterval,
          distanceInterval: 0,
        },
        (location) => {
          const coord: TimestampedCoordinate = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
            accuracy: location.coords.accuracy ?? undefined,
            speed: location.coords.speed ?? undefined,
          };
          resetGpsLostTimer();
          updateBoatPosition(coord);
        }
      );
    } catch (err) {
      console.warn('[GPS] watchPositionAsync failed:', err);
      setGpsStatus('lost');
      return;
    }

    // Step 4: background task
    try {
      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg === 'granted') {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        ).catch(() => false);
        if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
          accuracy: config.accuracy,
          timeInterval: config.bgTimeInterval,
          distanceInterval: 0,
          foregroundService: {
            notificationTitle: 'HoldFast is watching',
            notificationBody: 'Monitoring your anchor position',
            notificationColor: '#C9A227',
          },
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
          activityType: Location.ActivityType.OtherNavigation,
        });
      }
    } catch (bgErr) {
      console.warn('[GPS] Background unavailable (Expo Go?):', bgErr);
    }
  };

  // Initial start
  useEffect(() => {
    startTracking();
    isStartedRef.current = true;
    return () => { stopTracking(); };
  }, []);

  // Restart when battery mode changes (skip initial mount)
  const batteryMode = useAnchorStore(s => s.batteryMode);
  const prevBatteryModeRef = useRef(batteryMode);
  useEffect(() => {
    if (!isStartedRef.current) return;
    if (batteryMode === prevBatteryModeRef.current) return;
    prevBatteryModeRef.current = batteryMode;
    console.log('[GPS] Battery mode changed to', batteryMode, '— restarting tracking');
    stopTracking().then(() => startTracking());
  }, [batteryMode]);

  return { startTracking, stopTracking };
}
