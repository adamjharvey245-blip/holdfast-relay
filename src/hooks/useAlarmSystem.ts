import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import { Vibration } from 'react-native';
import { useAnchorStore } from '@/store/anchorStore';
import { getSoundSource } from '@/config/sounds';
import {
  setupNotificationChannels,
  scheduleAlarmNotification,
  type AlarmKind,
} from '@/services/alarmNotifications';
import type { AlarmLevel } from '@/types';

// ─── Vibration patterns ───────────────────────────────────────────────────────
// ALERT:     two firm pulses, then silence — clearly attention-getting but not frantic
// EMERGENCY: four rapid heavy pulses with short gaps — urgent, unmistakable, wakes sleepers

const VIBRATE_ALERT     = [0, 600, 400, 600, 1200];        // buzz-buzz … pause
const VIBRATE_EMERGENCY = [0, 800, 150, 800, 150, 800, 150, 800]; // buzz-buzz-buzz-buzz rapid fire

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAlarmSystem() {
  const {
    alarmLevel,
    gpsStatus,
    currentDistance,
    watchRadius,
    gpsCancelledAt,
    draggingCancelledAt,
    alarmReFireTick,
    alarmThresholds,
    alarmsEnabled,
  } = useAnchorStore();

  const prevAlarmLevel = useRef<AlarmLevel>('silent');
  const prevGpsStatus = useRef(gpsStatus);
  const prevReFireTick = useRef(alarmReFireTick);
  const activeNotifRef = useRef<string | null>(null);
  const vibIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Three separate sound refs — alert, emergency dragging, and GPS lost can each have different sounds
  const alertSoundRef = useRef<Audio.Sound | null>(null);
  const emergencySoundRef = useRef<Audio.Sound | null>(null);
  const gpsLostSoundRef = useRef<Audio.Sound | null>(null);
  const loadedAlertKey = useRef<string>('');
  const loadedEmergencyKey = useRef<string>('');
  const loadedGpsLostKey = useRef<string>('');
  const shouldPlayRef = useRef(false);

  // ── Audio mode (set once) ────────────────────────────────────────────────

  const ensureAudioMode = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    } catch (e) {
      console.warn('[AlarmSystem] setAudioModeAsync failed (non-fatal):', e);
    }
  };

  // ── Sound management ─────────────────────────────────────────────────────

  const loadSoundForLevel = async (level: AlarmKind): Promise<Audio.Sound | null> => {
    const key = level === 'alert'
      ? (alarmThresholds.alertSoundKey ?? 'alarm')
      : level === 'gps_lost'
        ? (alarmThresholds.gpsLostSoundKey ?? 'alarm')
        : (alarmThresholds.emergencySoundKey ?? 'alarm');
    const soundRef = level === 'alert' ? alertSoundRef : level === 'gps_lost' ? gpsLostSoundRef : emergencySoundRef;
    const loadedKey = level === 'alert' ? loadedAlertKey : level === 'gps_lost' ? loadedGpsLostKey : loadedEmergencyKey;

    // Unload and reload if the sound key has changed
    if (soundRef.current && loadedKey.current !== key) {
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
      loadedKey.current = '';
    }

    if (soundRef.current) return soundRef.current;

    await ensureAudioMode();
    try {
      const source = getSoundSource(key);
      const { sound } = await Audio.Sound.createAsync(source, { isLooping: true, volume: 1.0 });
      soundRef.current = sound;
      loadedKey.current = key;
      console.log(`[AlarmSystem] Loaded ${level} sound: ${key}`);
      return sound;
    } catch (e) {
      console.error(`[AlarmSystem] Failed to load ${level} sound:`, e);
      return null;
    }
  };

  const playSound = async (level: AlarmKind) => {
    const sound = await loadSoundForLevel(level);
    if (!shouldPlayRef.current) return;
    if (sound) {
      try {
        await sound.setPositionAsync(0);
        if (!shouldPlayRef.current) return;
        await sound.playAsync();
      } catch (e) {
        console.error('[AlarmSystem] playAsync failed:', e);
      }
    }
  };

  const stopSound = async () => {
    shouldPlayRef.current = false;
    await alertSoundRef.current?.stopAsync().catch(() => {});
    await emergencySoundRef.current?.stopAsync().catch(() => {});
    await gpsLostSoundRef.current?.stopAsync().catch(() => {});
  };

  // ── Vibration management ─────────────────────────────────────────────────

  const startVibration = (pattern: number[], repeatMs = 4000) => {
    stopVibration();
    Vibration.vibrate(pattern);
    vibIntervalRef.current = setInterval(() => Vibration.vibrate(pattern), repeatMs);
  };

  const stopVibration = () => {
    if (vibIntervalRef.current) {
      clearInterval(vibIntervalRef.current);
      vibIntervalRef.current = null;
    }
    Vibration.cancel();
  };

  const startAlarm = (level: AlarmKind, pattern: number[], repeatMs = 4000) => {
    shouldPlayRef.current = true;
    startVibration(pattern, repeatMs);
    playSound(level);
  };

  const stopAlarm = () => {
    stopVibration();
    stopSound();
  };

  useEffect(() => () => {
    stopAlarm();
    alertSoundRef.current?.unloadAsync().catch(() => {});
    emergencySoundRef.current?.unloadAsync().catch(() => {});
    gpsLostSoundRef.current?.unloadAsync().catch(() => {});
  }, []);

  // ── One-time setup ───────────────────────────────────────────────────────

  useEffect(() => {
    setupNotificationChannels();
    Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: true,
      },
    });
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        // shouldShowAlert is deprecated in SDK 54+ — banner/list are now required
        shouldShowBanner: true,
        shouldShowList: true,
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.MAX,
      }),
    });
  }, []);

  // ── Dismiss active notification ──────────────────────────────────────────

  const dismissActive = async () => {
    if (activeNotifRef.current) {
      await Notifications.dismissNotificationAsync(activeNotifRef.current);
      activeNotifRef.current = null;
    }
  };

  // ── Fire notification ────────────────────────────────────────────────────
  // Content + channel come from services/alarmNotifications so this path and
  // the background location task always post identical notifications.

  const fireNotification = async (kind: AlarmKind, distanceM: number, radiusM: number) => {
    await dismissActive();
    activeNotifRef.current = await scheduleAlarmNotification(kind, { distanceM, radiusM });
  };

  // ── Stop alarm immediately when user cancels ────────────────────────────

  useEffect(() => {
    if (gpsCancelledAt !== null) {
      stopAlarm();
      dismissActive();
    }
  }, [gpsCancelledAt]);

  useEffect(() => {
    if (draggingCancelledAt !== null) {
      stopAlarm();
      dismissActive();
    }
  }, [draggingCancelledAt]);

  // ── GPS cancel cooldown timer — re-fires GPS alarm after cooldown ─────────

  useEffect(() => {
    if (gpsCancelledAt === null) return;
    const cooldownMs = (alarmThresholds.alarmCooldownSecs ?? 120) * 1000;
    const remaining = (gpsCancelledAt + cooldownMs) - Date.now();
    if (remaining <= 0) return;

    const timer = setTimeout(() => {
      const state = useAnchorStore.getState();
      if (state.gpsStatus === 'lost' && state.alarmLevel === 'emergency') {
        state.clearGpsCancel(); // clears cancel + increments reFireTick → triggers watcher
      }
    }, remaining);

    return () => clearTimeout(timer);
  }, [gpsCancelledAt, alarmThresholds.alarmCooldownSecs]);

  // ── Dragging cancel cooldown timer — re-fires dragging alarm after cooldown

  useEffect(() => {
    if (draggingCancelledAt === null) return;
    const cooldownMs = (alarmThresholds.alarmCooldownSecs ?? 120) * 1000;
    const remaining = (draggingCancelledAt + cooldownMs) - Date.now();
    if (remaining <= 0) return;

    const timer = setTimeout(() => {
      const state = useAnchorStore.getState();
      if (state.alarmLevel !== 'silent' && state.gpsStatus !== 'lost') {
        state.clearDraggingCancel(); // clears cancel + increments reFireTick → triggers watcher
      }
    }, remaining);

    return () => clearTimeout(timer);
  }, [draggingCancelledAt, alarmThresholds.alarmCooldownSecs]);

  // ── Main alarm watcher ───────────────────────────────────────────────────
  // Fires when level changes, GPS status changes, OR cooldown re-fire tick increments

  useEffect(() => {
    const levelChanged = alarmLevel !== prevAlarmLevel.current;
    // Only a lost ↔ not-lost flip matters here (it decides GPS-lost vs drag
    // emergency). ok ↔ degraded flips are frequent and must not re-fire.
    const gpsChanged = (gpsStatus === 'lost') !== (prevGpsStatus.current === 'lost');
    const reFireChanged = alarmReFireTick !== prevReFireTick.current;

    if (!levelChanged && !gpsChanged && !reFireChanged) return;

    prevAlarmLevel.current = alarmLevel;
    prevGpsStatus.current = gpsStatus;
    prevReFireTick.current = alarmReFireTick;

    // Read fresh state at fire time
    const state = useAnchorStore.getState();

    // Safety guards — never fire alarm if watch disabled or alarms muted
    if (!state.isWatchActive && alarmLevel !== 'silent') {
      stopAlarm();
      dismissActive();
      return;
    }
    if (!state.alarmsEnabled) {
      stopAlarm();
      dismissActive();
      return;
    }
    const cooldownMs = (state.alarmThresholds.alarmCooldownSecs ?? 120) * 1000;
    const now = Date.now();
    const gpsAlarmCancelled =
      state.gpsCancelledAt !== null && now < state.gpsCancelledAt + cooldownMs;
    const dragAlarmCancelled =
      state.draggingCancelledAt !== null && now < state.draggingCancelledAt + cooldownMs;

    const dist = Math.round(currentDistance);

    switch (alarmLevel) {
      case 'alert':
        if (!dragAlarmCancelled && (state.alarmThresholds.alertEnabled ?? true)) {
          fireNotification('alert', dist, watchRadius);
          startAlarm('alert', VIBRATE_ALERT, 6000);
        }
        break;

      case 'emergency':
        if (gpsStatus === 'lost') {
          if (!gpsAlarmCancelled && (state.alarmThresholds.gpsLostEnabled ?? true)) {
            fireNotification('gps_lost', dist, watchRadius);
            startAlarm('gps_lost', VIBRATE_EMERGENCY, 2000);
          }
        } else {
          if (!dragAlarmCancelled && (state.alarmThresholds.emergencyEnabled ?? true)) {
            fireNotification('emergency', dist, watchRadius);
            startAlarm('emergency', VIBRATE_EMERGENCY, 2000);
          }
        }
        break;

      case 'silent':
        dismissActive();
        stopAlarm();
        break;
    }
  }, [alarmLevel, gpsStatus, alarmReFireTick, alarmsEnabled]);

  return { dismissActive };
}
