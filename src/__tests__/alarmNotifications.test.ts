import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  alarmNotificationContent,
  channelForKind,
  scheduleAlarmNotification,
  setupNotificationChannels,
  ALARM_SOUND_FILE,
  type AlarmKind,
} from '@/services/alarmNotifications';

jest.mock('expo-notifications', () => ({
  AndroidAudioUsage: { ALARM: 4 },
  AndroidAudioContentType: { SONIFICATION: 4 },
  AndroidImportance: { HIGH: 4, MAX: 5 },
  AndroidNotificationPriority: { MAX: 'max' },
  AndroidNotificationVisibility: { PUBLIC: 1 },
  deleteNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationChannelAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'notif-id'),
}));

const mocked = Notifications as jest.Mocked<typeof Notifications>;
const KINDS: AlarmKind[] = ['alert', 'emergency', 'gps_lost'];

function withPlatform(os: 'ios' | 'android', fn: () => Promise<void>) {
  return async () => {
    const original = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    try {
      await fn();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: original, configurable: true });
    }
  };
}

beforeEach(() => jest.clearAllMocks());

describe('alarmNotificationContent', () => {
  it('embeds distance and radius in drag alarms', () => {
    expect(alarmNotificationContent('alert', { distanceM: 31, radiusM: 30 }).body)
      .toBe('Boat has reached the 30m boundary (31m from anchor).');
    expect(alarmNotificationContent('emergency', { distanceM: 45, radiusM: 30 }).body)
      .toContain('15m past boundary');
  });

  it('has a fixed message for GPS lost', () => {
    const { title, body } = alarmNotificationContent('gps_lost');
    expect(title).toContain('GPS SIGNAL LOST');
    expect(body).toContain('Anchor position unknown');
  });
});

describe('Android channel consistency', () => {
  // Regression guard: the foreground hook and the background location task
  // once posted to different channel IDs after a rename, and Android silently
  // downgraded the background alarm to the default channel.
  it('every channel a notification can target is one setupNotificationChannels creates', withPlatform('android', async () => {
    await setupNotificationChannels();
    const created = mocked.setNotificationChannelAsync.mock.calls.map(([id]) => id);
    for (const kind of KINDS) {
      expect(created).toContain(channelForKind(kind));
    }
  }));

  it('never creates a channel it also deletes', withPlatform('android', async () => {
    await setupNotificationChannels();
    const created = mocked.setNotificationChannelAsync.mock.calls.map(([id]) => id);
    const deleted = mocked.deleteNotificationChannelAsync.mock.calls.map(([id]) => id);
    for (const id of created) expect(deleted).not.toContain(id);
  }));

  it('creates every alarm channel on the ALARM audio stream with the alarm sound and DnD bypass', withPlatform('android', async () => {
    await setupNotificationChannels();
    expect(mocked.setNotificationChannelAsync).toHaveBeenCalledTimes(KINDS.length);
    for (const [, config] of mocked.setNotificationChannelAsync.mock.calls) {
      expect(config.sound).toBe(ALARM_SOUND_FILE);
      expect(config.bypassDnd).toBe(true);
      expect(config.audioAttributes?.usage).toBe(Notifications.AndroidAudioUsage.ALARM);
    }
  }));

  it('does nothing on iOS', withPlatform('ios', async () => {
    await setupNotificationChannels();
    expect(mocked.setNotificationChannelAsync).not.toHaveBeenCalled();
  }));
});

describe('scheduleAlarmNotification', () => {
  it('posts to the matching Android channel with the alarm sound', withPlatform('android', async () => {
    for (const kind of KINDS) {
      await scheduleAlarmNotification(kind, { distanceM: 40, radiusM: 30 });
      const calls = mocked.scheduleNotificationAsync.mock.calls;
      const req = calls[calls.length - 1][0] as any;
      expect(req.channelId).toBe(channelForKind(kind));
      expect(req.content.sound).toBe(ALARM_SOUND_FILE);
      expect(req.content.interruptionLevel).toBeUndefined();
      expect(req.trigger).toBeNull();
    }
  }));

  it('requests a critical interruption level on iOS and no channelId', withPlatform('ios', async () => {
    await scheduleAlarmNotification('emergency', { distanceM: 40, radiusM: 30 });
    const req = mocked.scheduleNotificationAsync.mock.calls[0][0] as any;
    expect(req.content.interruptionLevel).toBe('critical');
    expect(req.channelId).toBeUndefined();
  }));

  it('returns the notification id, or null if scheduling throws', withPlatform('ios', async () => {
    expect(await scheduleAlarmNotification('alert')).toBe('notif-id');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mocked.scheduleNotificationAsync.mockRejectedValueOnce(new Error('boom'));
    expect(await scheduleAlarmNotification('alert')).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  }));
});
