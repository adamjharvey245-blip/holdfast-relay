import { useEffect, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAnchorStore } from '@/store/anchorStore';
import { getCriticalAlertsStatus } from '@/services/criticalAlerts';

// ─── Critical Alerts nudge (iOS) ─────────────────────────────────────────────
//
// Users who granted notifications before the Critical Alerts entitlement
// shipped were never asked for the critical permission, and iOS won't re-prompt
// them. The first time they start a watch with critical alerts entitled-but-
// denied, point them at Settings once. Builds without the entitlement report
// 'unavailable' and this hook does nothing.

const NUDGED_KEY = 'holdfast_critical_alerts_nudged';

export function useCriticalAlertsNudge() {
  const isWatchActive = useAnchorStore((s) => s.isWatchActive);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !isWatchActive || checkedRef.current) return;
    checkedRef.current = true;

    (async () => {
      try {
        if (await AsyncStorage.getItem(NUDGED_KEY)) return;
        if ((await getCriticalAlertsStatus()) !== 'denied') return;
        await AsyncStorage.setItem(NUDGED_KEY, 'true');
        Alert.alert(
          'Enable Critical Alerts',
          'Critical Alerts let the drag alarm sound even when your phone is on silent or in a Focus mode. Turn them on in Settings → Notifications → HoldFast.',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
      } catch (e) {
        console.warn('[CriticalAlertsNudge] failed:', e);
      }
    })();
  }, [isWatchActive]);
}
