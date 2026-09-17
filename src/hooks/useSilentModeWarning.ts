import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { VolumeManager, RINGER_MODE } from 'react-native-volume-manager';
import { useAnchorStore } from '@/store/anchorStore';

// ─── Silent-mode warning on background ───────────────────────────────────────
//
// When the user leaves the app with an active anchor watch, check whether the
// phone is on silent and — only if it is — post a warning notification.
//
// iOS:     There is no public API to read the ring/silent switch, so
//          react-native-volume-manager infers it by timing a silent system
//          sound. That check only runs reliably in the foreground, so we keep a
//          listener alive while the watch is active and cache the last result.
//          Critical Alerts (if entitled) and playsInSilentModeIOS mean the
//          alarm should still sound, but the user must not rely on that.
// Android: AudioManager ringer mode is readable at any time. Both SILENT and
//          VIBRATE are treated as silent. The alarm channels route through the
//          ALARM audio stream (see useAlarmSystem) which is not muted by the
//          ringer, but OEM builds vary, so we still warn the user.

const CHANNEL_SILENT_WARNING = 'anchor_silent_warning';
const SILENT_CHECK_INTERVAL_SEC = 2;

async function ensureWarningChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_SILENT_WARNING, {
    name: 'Silent Mode Warning',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

async function postWarning() {
  try {
    await ensureWarningChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚠️ Phone is on silent',
        body: 'Anchor watch is active but your phone is muted. Turn silent mode off so the drag alarm is audible.',
        sound: undefined,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' } : {}),
      },
      trigger: null,
      ...(Platform.OS === 'android' ? { channelId: CHANNEL_SILENT_WARNING } : {}),
    } as Notifications.NotificationRequestInput);
  } catch (e) {
    console.warn('[SilentModeWarning] failed to post notification:', e);
  }
}

async function isPhoneSilent(cachedIosMuted: boolean | null): Promise<boolean> {
  if (Platform.OS === 'ios') {
    return cachedIosMuted === true;
  }
  if (Platform.OS === 'android') {
    try {
      const mode = await VolumeManager.getRingerMode();
      return mode === RINGER_MODE.silent || mode === RINGER_MODE.vibrate;
    } catch (e) {
      console.warn('[SilentModeWarning] getRingerMode failed:', e);
      return false;
    }
  }
  return false;
}

export function useSilentModeWarning() {
  const isWatchActive = useAnchorStore((s) => s.isWatchActive);
  const iosMutedRef = useRef<boolean | null>(null);
  const warnedThisTripRef = useRef(false); // reset each time app returns to foreground

  // iOS: keep the silent-switch listener alive while the watch is active so we
  // always have a fresh reading when the app is sent to the background.
  useEffect(() => {
    if (Platform.OS !== 'ios' || !isWatchActive) {
      iosMutedRef.current = null;
      return;
    }
    let listener: { remove: () => void } | null = null;
    try {
      VolumeManager.setNativeSilenceCheckInterval(SILENT_CHECK_INTERVAL_SEC);
      listener = VolumeManager.addSilentListener((status) => {
        iosMutedRef.current = status.isMuted;
      });
    } catch (e) {
      console.warn('[SilentModeWarning] silent listener unavailable:', e);
    }
    return () => {
      listener?.remove();
      iosMutedRef.current = null;
    };
  }, [isWatchActive]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'background') {
        if (nextState === 'active') warnedThisTripRef.current = false;
        return;
      }
      if (warnedThisTripRef.current) return;
      warnedThisTripRef.current = true;

      const state = useAnchorStore.getState();
      if (!state.isWatchActive || !state.alarmsEnabled) return;

      const silent = await isPhoneSilent(iosMutedRef.current);
      if (!silent) return;

      console.log('[SilentModeWarning] phone is silent with watch active — warning user');
      await postWarning();
    });
    return () => sub.remove();
  }, []);
}
