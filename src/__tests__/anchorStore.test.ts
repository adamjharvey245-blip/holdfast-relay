import { useAnchorStore } from '@/store/anchorStore';
import { offsetCoordinate } from '@/utils/haversine';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const ANCHOR = { latitude: -33.8568, longitude: 151.2153 };

/** A fix `metres` north of the anchor with the given reported accuracy. */
function fix(metres: number, accuracy?: number, timestamp = Date.now()) {
  const c = offsetCoordinate(ANCHOR.latitude, ANCHOR.longitude, metres, 0);
  return { ...c, timestamp, accuracy };
}

function armWatch(radius = 30) {
  const s = useAnchorStore.getState();
  s.setAnchorPosition(ANCHOR);
  s.setWatchRadius(radius);
  s.setWatchActive(true);
}

beforeEach(() => {
  const s = useAnchorStore.getState();
  s.clearAnchor();
  s.setAlarmsEnabled(true);
  s.setIsPremium(true);
  s.clearTrack();
  s.setTideEnabled(false);
  s.setCustomZone(null);
});

describe('updateBoatPosition — accuracy gating', () => {
  it('a poor-accuracy fix far outside the radius does not alarm', () => {
    armWatch(30);
    useAnchorStore.getState().updateBoatPosition(fix(5, 4));
    useAnchorStore.getState().updateBoatPosition(fix(80, 80));
    useAnchorStore.getState().updateBoatPosition(fix(80, 80));

    const s = useAnchorStore.getState();
    expect(s.alarmLevel).toBe('silent');
    expect(s.gpsStatus).toBe('degraded');
    expect(s.gpsAccuracy).toBe(80);
    // distance stays at the last trusted value
    expect(Math.round(s.currentDistance)).toBe(5);
  });

  it('a degraded fix still updates the marker and the track', () => {
    armWatch(30);
    const t0 = Date.now() - 10_000; // inside the track retention window
    useAnchorStore.getState().updateBoatPosition(fix(5, 4, t0));
    useAnchorStore.getState().updateBoatPosition(fix(80, 80, t0 + 6_000));
    const s = useAnchorStore.getState();
    expect(s.boatPosition?.timestamp).toBe(t0 + 6_000);
    expect(s.positionHistory).toHaveLength(2);
  });

  it('recovers to ok and resumes alarm evaluation when accuracy returns', () => {
    armWatch(30);
    useAnchorStore.getState().updateBoatPosition(fix(80, 80));
    expect(useAnchorStore.getState().gpsStatus).toBe('degraded');
    useAnchorStore.getState().updateBoatPosition(fix(40, 5));
    useAnchorStore.getState().updateBoatPosition(fix(40, 5));
    const s = useAnchorStore.getState();
    expect(s.gpsStatus).toBe('ok');
    expect(s.alarmLevel).toBe('emergency');
  });
});

describe('updateBoatPosition — confirmation and hysteresis', () => {
  it('needs two consecutive trusted fixes to alert', () => {
    armWatch(30);
    useAnchorStore.getState().updateBoatPosition(fix(31, 5));
    expect(useAnchorStore.getState().alarmLevel).toBe('silent');
    expect(useAnchorStore.getState().pendingAlarmLevel).toBe('alert');
    expect(useAnchorStore.getState().pendingAlarmCount).toBe(1);
    useAnchorStore.getState().updateBoatPosition(fix(31, 5));
    expect(useAnchorStore.getState().alarmLevel).toBe('alert');
    expect(useAnchorStore.getState().isDragging).toBe(true);
    expect(useAnchorStore.getState().pendingAlarmCount).toBe(0);
  });

  it('holds alert while hovering just inside the ring', () => {
    armWatch(30);
    useAnchorStore.getState().updateBoatPosition(fix(31, 5));
    useAnchorStore.getState().updateBoatPosition(fix(31, 5));
    useAnchorStore.getState().updateBoatPosition(fix(28, 5));
    expect(useAnchorStore.getState().alarmLevel).toBe('alert');
    useAnchorStore.getState().updateBoatPosition(fix(20, 5));
    expect(useAnchorStore.getState().alarmLevel).toBe('silent');
    expect(useAnchorStore.getState().isDragging).toBe(false);
  });

  it('dropping the anchor resets pending confirmation state', () => {
    armWatch(30);
    useAnchorStore.getState().updateBoatPosition(fix(31, 5));
    expect(useAnchorStore.getState().pendingAlarmCount).toBe(1);
    useAnchorStore.getState().setAnchorPosition(ANCHOR);
    expect(useAnchorStore.getState().pendingAlarmCount).toBe(0);
    expect(useAnchorStore.getState().pendingAlarmLevel).toBe('silent');
  });
});

describe('user-initiated recompute', () => {
  it('shrinking the radius below the current distance alarms immediately (no confirmation)', () => {
    armWatch(30);
    useAnchorStore.getState().updateBoatPosition(fix(20, 5));
    expect(useAnchorStore.getState().alarmLevel).toBe('silent');
    useAnchorStore.getState().setWatchRadius(15);
    expect(useAnchorStore.getState().alarmLevel).toBe('emergency'); // 20 ≥ 15 × 1.2
    useAnchorStore.getState().setWatchRadius(18);
    expect(useAnchorStore.getState().alarmLevel).toBe('alert');
    useAnchorStore.getState().setWatchRadius(30);
    expect(useAnchorStore.getState().alarmLevel).toBe('silent');
  });

  it('tide compensation shrinks the effective radius and can trigger an alarm', () => {
    armWatch(30);
    useAnchorStore.getState().updateBoatPosition(fix(27, 5));
    useAnchorStore.getState().setTideEnabled(true);
    useAnchorStore.getState().setAnchorTideHeight(0);
    expect(useAnchorStore.getState().alarmLevel).toBe('silent');
    useAnchorStore.getState().setCurrentTideHeight(4); // effective radius 26
    expect(useAnchorStore.getState().alarmLevel).toBe('alert');
  });

  it('does nothing when the watch is off', () => {
    useAnchorStore.getState().setAnchorPosition(ANCHOR);
    useAnchorStore.getState().updateBoatPosition(fix(100, 5));
    useAnchorStore.getState().updateBoatPosition(fix(100, 5));
    expect(useAnchorStore.getState().alarmLevel).toBe('silent');
    useAnchorStore.getState().setWatchRadius(10);
    expect(useAnchorStore.getState().alarmLevel).toBe('silent');
  });
});
