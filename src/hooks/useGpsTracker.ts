import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { useAnchorStore } from '@/store/anchorStore';
import type { AlarmLevel, TimestampedCoordinate } from '@/types';

export const BACKGROUND_LOCATION_TASK = 'HOLDFAST_BG_LOCATION';

// How long after GPS is declared "lost" before the audible alarm fires.
// During this window a silent notification wakes the screen, which often
// restores the GPS signal without disturbing the crew.
const GPS_ALARM_DELAY_MS = 60_000; // 60 seconds

const GPS_CONFIGS = {
  precision: {
    fgTimeInterval: 6000,
    bgTimeInterval: 10_000,
    accuracy: Location.Accuracy.BestForNavigation,
  },
  standard: {
    fgTimeInterval: 10_000,
    bgTimeInterval: 15_000,
    accuracy: Location.Accuracy.Highest,
  },
} as const;

// ── Module-level GPS lost timers ──────────────────────────────────────────────
// Stage 1: gpsLostTimer  — fires after gpsLostSecs with no update → marks status 'lost'
//                          and fires a silent wake notification
// Stage 2: gpsAlarmTimer — fires GPS_ALARM_DELAY_MS later → triggers the audible alarm
//                          only if GPS is still lost

let gpsLostTimer:  ReturnType<typeof setTimeout> | null = null;
let gpsAlarmTimer: ReturnType<typeof setTimeout> | null = null;
let silentNotifId: string | null = null;

// ── Module-level background task state ───────────────────────────────────────
// These persist across background task firings within a single process lifecycle.
// They are reset each time the OS launches a fresh process for the background task.

let bgTaskHydrated = false;       // true once we've loaded state from AsyncStorage
let bgLastAlarmLevel: AlarmLevel = 'silent';
let bgLastNotifAt = 0;
const BG_NOTIF_COOLDOWN_MS = 90_000; // minimum gap between background alarm notifications

async function fireBgAlarmNotification(level: AlarmLevel, dist: number, radius: number) {
  const isEmergency = level === 'emergency';
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: isEmergency ? '🚨 ANCHOR DRAGGING — EMERGENCY' : '⚠️ ANCHOR DRAG ALERT',
        body: isEmergency
          ? `Boat is ${dist}m from anchor — ${dist - radius}m past boundary. IMMEDIATE ACTION REQUIRED!`
          : `Boat has reached the ${radius}m boundary (${dist}m from anchor).`,
        sound: 'alarm.mp3',
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'critical' } : {}),
      } as any,
      trigger: null,
      ...(Platform.OS === 'android'
        ? { channelId: isEmergency ? 'anchor_emergency' : 'anchor_alert' }
        : {}),
    } as Notifications.NotificationRequestInput);
  } catch (e) {
    console.warn('[BG Location] Failed to schedule alarm notification:', e);
  }
}

async function fireBgGpsLostNotification() {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔴 GPS SIGNAL LOST',
        body: 'No GPS fix. Anchor position unknown — check immediately!',
        sound: 'alarm.mp3',
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'critical' } : {}),
      } as any,
      trigger: null,
      ...(Platform.OS === 'android' ? { channelId: 'anchor_gps_lost' } : {}),
    } as Notifications.NotificationRequestInput);
  } catch (e) {
    console.warn('[BG Location] Failed to schedule GPS lost notification:', e);
  }
}

function cancelAlarmTimer() {
  if (gpsAlarmTimer) { clearTimeout(gpsAlarmTimer); gpsAlarmTimer = null; }
  if (silentNotifId) {
    Notifications.dismissNotificationAsync(silentNotifId).catch(() => {});
    silentNotifId = null;
  }
}

function resetGpsLostTimer() {
  if (gpsLostTimer) clearTimeout(gpsLostTimer);
  cancelAlarmTimer();

  const timeoutMs = (useAnchorStore.getState().alarmThresholds?.gpsLostSecs ?? 60) * 1000;

  gpsLostTimer = setTimeout(async () => {
    const state = useAnchorStore.getState();
    if (state.gpsStatus === 'lost') return; // already handled

    // Stage 1: declare lost silently — no alarm yet
    state.setGpsStatus('lost');

    if (!state.isWatchActive) return;

    // Fire a silent notification — wakes the phone screen which often restores GPS
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'GPS signal lost',
          body: 'Checking signal — alarm will sound in 60 seconds if not restored.',
          sound: undefined,
          priority: Notifications.AndroidNotificationPriority.LOW,
        } as any,
        trigger: null,
      });
      silentNotifId = id;
    } catch { /* non-fatal */ }

    // Stage 2: alarm fires after GPS_ALARM_DELAY_MS if GPS hasn't come back
    gpsAlarmTimer = setTimeout(async () => {
      const fresh = useAnchorStore.getState();
      if (fresh.gpsStatus === 'lost' && fresh.isWatchActive) {
        fresh.setAlarmLevel('emergency');
        // Fire notification directly — React alarm hook may not be running in background
        const now = Date.now();
        if (now - bgLastNotifAt > BG_NOTIF_COOLDOWN_MS) {
          bgLastAlarmLevel = 'emergency';
          bgLastNotifAt = now;
          await fireBgGpsLostNotification();
        }
      }
      silentNotifId = null;
    }, GPS_ALARM_DELAY_MS);
  }, timeoutMs);
}

// ── Background task — defined at module level (required by expo-task-manager) ─
//
// IMPORTANT: When iOS wakes the app solely for a background location update the
// React component tree is NOT mounted. This means React hooks (including
// useAlarmSystem) do not run. All alarm notification logic must therefore be
// duplicated here so it fires even when the phone is asleep.

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('[BG Location]', error.message);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  const latest = locations[locations.length - 1];
  if (!latest) return;

  // ── Hydrate persisted state once per process lifecycle ──────────────────
  // When iOS cold-starts the app for a background location delivery, the
  // Zustand store starts with default values (isWatchActive: false, no anchor).
  // We only need to hydrate when anchorPosition is null (fresh process) because
  // if React has already run it will have called hydrateFromStorage itself.
  if (!bgTaskHydrated) {
    bgTaskHydrated = true;
    const currentState = useAnchorStore.getState();
    if (currentState.anchorPosition === null) {
      try {
        await useAnchorStore.getState().hydrateFromStorage();
      } catch (e) {
        console.warn('[BG Location] Failed to hydrate store:', e);
      }
    }
  }

  // ── Update position ──────────────────────────────────────────────────────
  resetGpsLostTimer();

  useAnchorStore.getState().updateBoatPosition({
    latitude: latest.coords.latitude,
    longitude: latest.coords.longitude,
    timestamp: latest.timestamp,
    accuracy: latest.coords.accuracy ?? undefined,
    speed: latest.coords.speed ?? undefined,
  });

  // ── Fire alarm notification if needed ───────────────────────────────────
  // The React alarm hook isn't running in background, so we do this here.
  const state = useAnchorStore.getState();
  if (!state.isWatchActive || !state.alarmsEnabled) return;

  const newLevel = state.alarmLevel;
  if (newLevel === 'silent') {
    bgLastAlarmLevel = 'silent';
    return;
  }

  const now = Date.now();
  const cooldownMs = (state.alarmThresholds?.alarmCooldownSecs ?? 120) * 1000;
  const dragCancelActive = state.draggingCancelledAt !== null && now < state.draggingCancelledAt + cooldownMs;
  if (dragCancelActive) return;

  // Only notify when level escalates or cooldown since last notification has passed
  const levelEscalated = newLevel !== bgLastAlarmLevel;
  const cooldownExpired = now - bgLastNotifAt > BG_NOTIF_COOLDOWN_MS;
  if (!levelEscalated && !cooldownExpired) return;

  bgLastAlarmLevel = newLevel;
  bgLastNotifAt = now;

  const dist = Math.round(state.currentDistance);
  await fireBgAlarmNotification(newLevel, dist, state.watchRadius);
});

export function useGpsTracker() {
  const { updateBoatPosition, setGpsStatus } = useAnchorStore();
  const fgSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const isStartedRef = useRef(false);

  // Cache the permission results so restarts never re-request
  const fgGrantedRef = useRef(false);
  const bgGrantedRef = useRef(false);

  // ── Background task helpers ──────────────────────────────────────────────
  // The background task creates an Android foreground service. Starting it when
  // no watch is active causes Android to restart the app after the user closes it.
  // Only start/stop it in response to isWatchActive changes.

  const startBgTask = async () => {
    if (!bgGrantedRef.current) return;
    const batteryMode = useAnchorStore.getState().batteryMode ?? 'precision';
    const config = GPS_CONFIGS[batteryMode];
    try {
      // Never stop a running task before restarting — any gap between stop and
      // start risks leaving GPS dead if startLocationUpdatesAsync throws.
      // If the task is already running with current settings, leave it alone.
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
      if (isRunning) return;

      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: config.accuracy,
        timeInterval: config.bgTimeInterval,
        distanceInterval: 0,
        deferredUpdatesInterval: 0,   // never defer — deliver every update immediately
        deferredUpdatesDistance: 0,   // even when stationary (boat at anchor)
        foregroundService: {
          notificationTitle: 'HoldFast is watching',
          notificationBody: 'Monitoring your anchor position',
          notificationColor: '#C9A227',
        },
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        // AutomotiveNavigation gives highest-priority continuous GPS on iOS —
        // closer to marine use than OtherNavigation and less likely to be
        // throttled or paused by iOS power management.
        activityType: Location.ActivityType.AutomotiveNavigation,
      });
    } catch (bgErr) {
      console.warn('[GPS] Background task start failed:', bgErr);
    }
  };

  const stopBgTask = async () => {
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
      if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch (e) {
      console.warn('[GPS] stopBgTask error:', e);
    }
  };

  const stopFgTracking = () => {
    fgSubscriptionRef.current?.remove();
    fgSubscriptionRef.current = null;
    if (gpsLostTimer) { clearTimeout(gpsLostTimer); gpsLostTimer = null; }
    cancelAlarmTimer();
  };

  const stopTracking = async () => {
    stopFgTracking();
    await stopBgTask();
  };

  // Stable refs so the batteryMode effect always calls the latest functions
  const stopTrackingRef = useRef(stopTracking);
  const startBgTaskRef = useRef(startBgTask);
  const stopBgTaskRef = useRef(stopBgTask);
  stopTrackingRef.current = stopTracking;
  startBgTaskRef.current = startBgTask;
  stopBgTaskRef.current = stopBgTask;

  const startTracking = async (isRestart = false) => {
    const batteryMode = useAnchorStore.getState().batteryMode ?? 'precision';
    const config = GPS_CONFIGS[batteryMode];

    // ── Permissions ──────────────────────────────────────────────────────────
    if (!isRestart) {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        fgGrantedRef.current = status === 'granted';
      } catch (err) {
        console.warn('[GPS] FG permission request failed:', err);
        setGpsStatus('lost');
        return;
      }

      if (!fgGrantedRef.current) {
        setGpsStatus('lost');
        return;
      }

      // Warm up the GPS chip with a one-shot fix
      try {
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      } catch {
        // Chip not ready yet — continue anyway
      }

      try {
        const { status: bg } = await Location.requestBackgroundPermissionsAsync();
        bgGrantedRef.current = bg === 'granted';
      } catch (err) {
        console.warn('[GPS] BG permission request failed:', err);
      }
    }

    if (!fgGrantedRef.current) {
      setGpsStatus('lost');
      return;
    }

    // ── Foreground watch ─────────────────────────────────────────────────────
    try {
      fgSubscriptionRef.current = await Location.watchPositionAsync(
        { accuracy: config.accuracy, timeInterval: config.fgTimeInterval, distanceInterval: 0 },
        (location) => {
          resetGpsLostTimer();
          updateBoatPosition({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
            accuracy: location.coords.accuracy ?? undefined,
            speed: location.coords.speed ?? undefined,
          });
        }
      );
    } catch (err) {
      console.warn('[GPS] watchPositionAsync failed:', err);
      setGpsStatus('lost');
      return;
    }

    // Background task is NOT started here — only when watch becomes active.
  };

  const startTrackingRef = useRef(startTracking);
  startTrackingRef.current = startTracking;

  // ── Initial start (foreground only) ──────────────────────────────────────
  // Must be async so we can start the background task immediately after
  // permissions resolve, in case isWatchActive was already true when the
  // component mounted (restored from storage after a force-close).

  useEffect(() => {
    (async () => {
      await startTrackingRef.current(false);
      isStartedRef.current = true;
      // If watch was active in the previous session (restored from AsyncStorage),
      // the isWatchActive effect will have fired before bgGrantedRef was set and
      // returned early. Start the background task explicitly here now that
      // permissions are resolved.
      if (useAnchorStore.getState().isWatchActive) {
        await startBgTaskRef.current();
      }
    })();
    return () => { stopTrackingRef.current(); };
  }, []);

  // ── Start/stop background task with watch state ───────────────────────────
  // This is what creates the Android foreground service. Keeping it tied to
  // isWatchActive prevents Android from restarting the app when no watch is set.

  const isWatchActive = useAnchorStore(s => s.isWatchActive);

  useEffect(() => {
    if (!isStartedRef.current) return;
    if (isWatchActive) {
      startBgTaskRef.current();
    } else {
      stopBgTaskRef.current();
    }
  }, [isWatchActive]);

  // ── Restart foreground tracking on battery mode change ────────────────────

  const batteryMode = useAnchorStore(s => s.batteryMode);
  const prevBatteryModeRef = useRef(batteryMode);

  useEffect(() => {
    if (!isStartedRef.current) return;
    if (batteryMode === prevBatteryModeRef.current) return;
    prevBatteryModeRef.current = batteryMode;
    console.log('[GPS] Battery mode changed to', batteryMode, '— restarting');

    const restart = async () => {
      try {
        stopFgTracking();
        await stopBgTaskRef.current();
        await new Promise(resolve => setTimeout(resolve, 500));
        await startTrackingRef.current(true);
        // Re-start background task if watch is still active after restart
        if (useAnchorStore.getState().isWatchActive) {
          await startBgTaskRef.current();
        }
      } catch (err) {
        console.warn('[GPS] Restart failed:', err);
      }
    };
    restart();
  }, [batteryMode]);

  return { startTracking, stopTracking };
}
