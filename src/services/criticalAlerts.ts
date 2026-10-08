import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

// ─── iOS Critical Alerts status ──────────────────────────────────────────────
//
// Critical Alerts let an alarm notification sound through the mute switch and
// Focus modes while the app is suspended. They need an Apple-granted
// entitlement (com.apple.developer.usernotifications.critical-alerts) AND a
// separate user permission.
//
// iOS reports three states via UNNotificationSettings.criticalAlertSetting,
// which expo-notifications surfaces as `ios.allowsCriticalAlerts`:
//   true  → entitled and user granted
//   false → entitled but user declined (or revoked in Settings)
//   null  → not supported: the build has no entitlement, so there is nothing
//           the user can enable. Everything gated on this must stay inert.

export type CriticalAlertsStatus = 'granted' | 'denied' | 'unavailable';

/** Pure classifier — testable without native mocks. */
export function classifyCriticalAlerts(
  perm: { ios?: { allowsCriticalAlerts?: boolean | null } } | null | undefined,
): CriticalAlertsStatus {
  const v = perm?.ios?.allowsCriticalAlerts;
  if (v === true) return 'granted';
  if (v === false) return 'denied';
  return 'unavailable';
}

export async function getCriticalAlertsStatus(): Promise<CriticalAlertsStatus> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    return classifyCriticalAlerts(await Notifications.getPermissionsAsync());
  } catch (e) {
    console.warn('[CriticalAlerts] getPermissionsAsync failed:', e);
    return 'unavailable';
  }
}
