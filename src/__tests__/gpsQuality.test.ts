import {
  accuracyGateM,
  isFixTrusted,
  nextAlarmLevel,
  NO_PENDING_ALARM,
  ALARM_CONFIRM_FIXES,
  GPS_ACCURACY_GATE_MIN_M,
  type AlarmTransition,
  type PendingAlarm,
} from '@/utils/alarmLevel';
import { circlePolygon, offsetCoordinate } from '@/utils/haversine';
import type { AlarmLevel } from '@/types';

const R = 30;

// ─── Accuracy gate ────────────────────────────────────────────────────────────

describe('isFixTrusted', () => {
  it('gate is max(20 m, half the radius)', () => {
    expect(accuracyGateM(10)).toBe(GPS_ACCURACY_GATE_MIN_M);
    expect(accuracyGateM(30)).toBe(20);
    expect(accuracyGateM(100)).toBe(50);
  });

  it('trusts fixes at or under the gate', () => {
    expect(isFixTrusted(5, R)).toBe(true);
    expect(isFixTrusted(20, R)).toBe(true);
  });

  it('rejects the classic false-alarm fix: ±80 m against a 30 m radius', () => {
    expect(isFixTrusted(80, R)).toBe(false);
  });

  it('trusts an unreported accuracy (platform gave no estimate)', () => {
    expect(isFixTrusted(null, R)).toBe(true);
    expect(isFixTrusted(undefined, R)).toBe(true);
  });

  it('never trusts a negative (iOS "invalid") accuracy', () => {
    expect(isFixTrusted(-1, R)).toBe(false);
  });
});

// ─── Confirmation + hysteresis ────────────────────────────────────────────────

/** Feed a sequence of distances through nextAlarmLevel, returning each resulting level. */
function run(
  distances: number[],
  start: AlarmLevel = 'silent',
  emergencyThresholdPct = 120,
): AlarmLevel[] {
  let current = start;
  let pending: PendingAlarm = NO_PENDING_ALARM;
  const out: AlarmLevel[] = [];
  for (const distance of distances) {
    const t: AlarmTransition = nextAlarmLevel({
      current, pending, distance, radius: R, customZone: null, boatPos: null, emergencyThresholdPct,
    });
    current = t.level;
    pending = t.pending;
    out.push(current);
  }
  return out;
}

describe('nextAlarmLevel — confirmation', () => {
  it('requires consecutive out-of-bounds fixes before alerting', () => {
    expect(ALARM_CONFIRM_FIXES).toBe(2);
    expect(run([10, 31, 31])).toEqual(['silent', 'silent', 'alert']);
  });

  it('a single out-of-bounds spike never alarms', () => {
    expect(run([10, 31, 10, 31, 10])).toEqual(['silent', 'silent', 'silent', 'silent', 'silent']);
  });

  it('boundary jitter alternating in/out never alarms', () => {
    const jitter = [29.5, 30.5, 29.5, 30.5, 29.5, 30.5];
    expect(run(jitter).every((l) => l === 'silent')).toBe(true);
  });

  it('a genuine monotonic drag alarms after one extra fix and escalates through emergency', () => {
    // 1 knot ≈ 0.5 m/s; 6 s fixes ≈ 3 m per fix
    expect(run([28, 31, 34, 37, 40])).toEqual(['silent', 'silent', 'alert', 'alert', 'emergency']);
  });

  it('a fast drag can jump silent → emergency once confirmed', () => {
    expect(run([10, 50, 50])).toEqual(['silent', 'silent', 'emergency']);
  });

  it('resets the count if the candidate level changes between fixes', () => {
    // alert candidate, then emergency candidate — no two agree, so no escalation yet
    expect(run([10, 31, 50])).toEqual(['silent', 'silent', 'silent']);
    // ...and a second emergency fix confirms
    expect(run([10, 31, 50, 50])).toEqual(['silent', 'silent', 'silent', 'emergency']);
  });

  it('alert → emergency also needs confirmation', () => {
    expect(run([40, 40], 'alert')).toEqual(['alert', 'emergency']);
    expect(run([40, 33, 40], 'alert')).toEqual(['alert', 'alert', 'alert']);
  });

  it('pending is cleared once the level is reached', () => {
    const t = nextAlarmLevel({
      current: 'silent', pending: { level: 'alert', count: 1 }, distance: 31,
      radius: R, customZone: null, boatPos: null,
    });
    expect(t).toEqual({ level: 'alert', pending: NO_PENDING_ALARM });
  });
});

describe('nextAlarmLevel — hysteresis', () => {
  it('stays in alert while within 10% inside the boundary', () => {
    // alert boundary 30; relaxed boundary 27
    expect(run([29, 28, 27.5], 'alert')).toEqual(['alert', 'alert', 'alert']);
  });

  it('drops to silent once clearly inside', () => {
    expect(run([26.9], 'alert')).toEqual(['silent']);
  });

  it('de-escalation is immediate (no confirmation delay)', () => {
    expect(run([5], 'emergency')).toEqual(['silent']);
  });

  it('emergency drops to alert only below 90% of the emergency threshold', () => {
    // emergency at 36; relaxed 32.4
    expect(run([35, 33], 'emergency')).toEqual(['emergency', 'emergency']);
    expect(run([32], 'emergency')).toEqual(['alert']);
  });

  it('hysteresis never escalates', () => {
    // 33 m is below the 36 m emergency line but above the relaxed 32.4 m —
    // from alert it must stay alert, not become emergency.
    expect(run([33], 'alert')).toEqual(['alert']);
  });

  it('honours a custom emergency threshold in the relaxed pass', () => {
    // 150% → emergency at 45, relaxed 40.5
    expect(run([42], 'emergency', 150)).toEqual(['emergency']);
    expect(run([40], 'emergency', 150)).toEqual(['alert']);
  });
});

describe('nextAlarmLevel — custom polygon zone', () => {
  const LAT = -33.8568, LON = 151.2153;
  const zone = circlePolygon(LAT, LON, 40, 8);
  const inside = { latitude: LAT, longitude: LON };
  const outside = offsetCoordinate(LAT, LON, 100, 0);

  const step = (current: AlarmLevel, pending: PendingAlarm, boatPos: { latitude: number; longitude: number }) =>
    nextAlarmLevel({ current, pending, distance: 0, radius: R, customZone: zone, boatPos });

  it('still requires confirmation to alert', () => {
    const t1 = step('silent', NO_PENDING_ALARM, outside);
    expect(t1.level).toBe('silent');
    const t2 = step('silent', t1.pending, outside);
    expect(t2.level).toBe('alert');
  });

  it('de-escalates as soon as the boat is back inside', () => {
    expect(step('alert', NO_PENDING_ALARM, inside).level).toBe('silent');
  });
});
