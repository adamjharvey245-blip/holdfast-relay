import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// ─── Alarm notifications — single source of truth ─────────────────────────────
//
// Two code paths post alarm notifications:
//   1. useAlarmSystem (React hook) — runs while the JS tree is mounted.
//   2. The HOLDFAST_BG_LOCATION task in useGpsTracker — runs when the OS wakes
//      the app for a background location fix and React is NOT mounted.
//
// Both MUST post to the same Android channels with the same content. Keeping
// channel IDs and builders here means the two paths cannot drift apart (a
// channel rename in one file previously left the background path posting to a
// deleted channel, which Android silently downgrades to the default
// "Miscellaneous" channel — no alarm sound, no DnD bypass).

export type AlarmKind = 'alert' | 'emergency' | 'gps_lost';

// ─── Channel IDs ──────────────────────────────────────────────────────────────

// Android notification channels are immutable once created on a device. The
// "_v2" suffix forces existing installs onto the alarm-stream channels; the
// old IDs are deleted in setupNotificationChannels so they don't linger in
// system settings. Any future change to channel audio settings needs a new
// suffix here — and nowhere else.
export const CHANNEL_ALERT = 'anchor_alert_v2';
export const CHANNEL_EMERGENCY = 'anchor_emergency_v2';
export const CHANNEL_GPS_LOST = 'anchor_gps_lost_v2';
const LEGACY_CHANNELS = ['anchor_alert', 'anchor_emergency', 'anchor_gps_lost'];

export const ALARM_SOUND_FILE = 'alarm.mp3';

export function channelForKind(kind: AlarmKind): string {
  switch (kind) {
    case 'alert': return CHANNEL_ALERT;
    case 'emergency': return CHANNEL_EMERGENCY;
    case 'gps_lost': return CHANNEL_GPS_LOST;
  }
}

// Route channel audio through the ALARM stream rather than the NOTIFICATION
// stream. Silent / vibrate ringer modes mute the notification stream but not
// the alarm stream, so the drag alarm still sounds when the phone is on silent.
// enforceAudibility additionally asks the system to play even if the stream is
// muted (honoured on most OEM builds, best-effort elsewhere).
const ALARM_AUDIO_ATTRIBUTES = {
  usage: Notifications.AndroidAudioUsage.ALARM,
  contentType: Notifications.AndroidAudioContentType.SONIFICATION,
  flags: { enforceAudibility: true, requestHardwareAudioVideoSynchronization: false },
};

// ─── Channel setup (Android only) ─────────────────────────────────────────────

export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Promise.all(
    LEGACY_CHANNELS.map((id) => Notifications.deleteNotificationChannelAsync(id).catch(() => {}))
  );

  await Notifications.setNotificationChannelAsync(CHANNEL_ALERT, {
    name: 'Anchor Alert',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
    sound: ALARM_SOUND_FILE,
    audioAttributes: ALARM_AUDIO_ATTRIBUTES,
  });

  await Notifications.setNotificationChannelAsync(CHANNEL_EMERGENCY, {
    name: 'Anchor Emergency',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    bypassDnd: true,
    sound: ALARM_SOUND_FILE,
    audioAttributes: ALARM_AUDIO_ATTRIBUTES,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  await Notifications.setNotificationChannelAsync(CHANNEL_GPS_LOST, {
    name: 'GPS Signal Lost',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 1000, 500, 1000],
    bypassDnd: true,
    sound: ALARM_SOUND_FILE,
    audioAttributes: ALARM_AUDIO_ATTRIBUTES,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

// ─── Content ──────────────────────────────────────────────────────────────────

export interface AlarmNotificationParams {
  /** Rounded distance from anchor in metres. Unused for gps_lost. */
  distanceM?: number;
  /** Watch radius in metres. Unused for gps_lost. */
  radiusM?: number;
}

export function alarmNotificationContent(
  kind: AlarmKind,
  { distanceM = 0, radiusM = 0 }: AlarmNotificationParams = {}
): { title: string; body: string } {
  switch (kind) {
    case 'alert':
      return {
        title: '⚠️ ANCHOR DRAG ALERT',
        body: `Boat has reached the ${radiusM}m boundary (${distanceM}m from anchor).`,
      };
    case 'emergency':
      return {
        title: '🚨 ANCHOR DRAGGING — EMERGENCY',
        body: `Boat is ${distanceM}m from anchor — ${distanceM - radiusM}m past boundary. IMMEDIATE ACTION REQUIRED!`,
      };
    case 'gps_lost':
      return {
        title: '🔴 GPS SIGNAL LOST',
        body: 'No GPS fix. Anchor position unknown — check immediately!',
      };
  }
}

// ─── Post ─────────────────────────────────────────────────────────────────────

/**
 * Schedule an immediate alarm notification. Returns the notification id so the
 * caller can dismiss it later, or null if scheduling threw.
 */
export async function scheduleAlarmNotification(
  kind: AlarmKind,
  params: AlarmNotificationParams = {}
): Promise<string | null> {
  const { title, body } = alarmNotificationContent(kind, params);
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: ALARM_SOUND_FILE,
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'critical' } : {}),
      },
      trigger: null,
      ...(Platform.OS === 'android' ? { channelId: channelForKind(kind) } : {}),
    } as Notifications.NotificationRequestInput);
  } catch (e) {
    console.warn(`[AlarmNotifications] Failed to schedule ${kind} notification:`, e);
    return null;
  }
}
