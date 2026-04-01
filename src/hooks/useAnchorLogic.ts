import { useEffect, useRef } from 'react';
import { useAnchorStore } from '@/store/anchorStore';
import type { TimestampedCoordinate } from '@/types';

// Distance + alarm level computation is handled directly inside
// useAnchorStore.updateBoatPosition, so there can be no stale-closure issues.
// This hook's only job is to manage the GPS lost timer.

export function useAnchorLogic() {
  const gpsLostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetGpsLostTimer = () => {
    if (gpsLostTimerRef.current) clearTimeout(gpsLostTimerRef.current);
    const timeoutMs = (useAnchorStore.getState().alarmThresholds?.gpsLostSecs ?? 60) * 1000;
    gpsLostTimerRef.current = setTimeout(() => {
      const state = useAnchorStore.getState();
      if (state.gpsStatus !== 'lost') {
        state.setGpsStatus('lost');
        if (state.isWatchActive) {
          state.setAlarmLevel('emergency');
        }
      }
    }, timeoutMs);
  };

  useEffect(() => {
    return () => {
      if (gpsLostTimerRef.current) clearTimeout(gpsLostTimerRef.current);
    };
  }, []);

  const processNewPosition = (coord: TimestampedCoordinate) => {
    resetGpsLostTimer();
    // updateBoatPosition (called by useGpsTracker) handles distance + alarm level
  };

  return { processNewPosition };
}
