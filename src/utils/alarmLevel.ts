import { pointInPolygon } from './haversine';
import type { AlarmLevel, Coordinate } from '@/types';

// ─── Pure alarm-level maths ───────────────────────────────────────────────────
// Kept free of store / native imports so it can be unit-tested directly.

export const MIN_EFFECTIVE_RADIUS_M = 5;
export const DEFAULT_EMERGENCY_THRESHOLD_PCT = 120;

/**
 * Tide compensation: as the tide rises the boat has less horizontal reach on
 * the same rode, so the effective watch radius shrinks by the tide rise since
 * the anchor was set (and grows as it falls). Floored so it can't collapse.
 */
export function computeEffectiveRadius(
  watchRadius: number,
  tideEnabled: boolean,
  anchorTideHeight: number,
  currentTideHeight: number
): number {
  if (!tideEnabled) return watchRadius;
  return Math.max(MIN_EFFECTIVE_RADIUS_M, watchRadius + anchorTideHeight - currentTideHeight);
}

/**
 * Map distance-from-anchor to an alarm level.
 * A custom zone (≥3 points) replaces the circle entirely and only ever yields
 * silent/alert — there is no "how far outside the polygon" escalation.
 */
export function computeAlarmLevel(
  distance: number,
  radius: number,
  customZone: Coordinate[] | null,
  boatPos: Coordinate | null,
  emergencyThresholdPct = DEFAULT_EMERGENCY_THRESHOLD_PCT
): AlarmLevel {
  if (customZone && customZone.length >= 3 && boatPos) {
    return pointInPolygon(boatPos, customZone) ? 'silent' : 'alert';
  }
  if (distance >= radius * (emergencyThresholdPct / 100)) return 'emergency';
  if (distance >= radius) return 'alert';
  return 'silent';
}

// ─── GPS quality gating ───────────────────────────────────────────────────────
//
// A single poor fix (phone in a locker, below deck, momentary multipath) can
// report the boat 80 m away with ±100 m accuracy. Alarming on that is the #1
// source of false 3 a.m. alarms, so fixes whose reported accuracy is worse
// than a fraction of the watch radius are shown on the map but never allowed
// to change the alarm level.

export const GPS_ACCURACY_GATE_MIN_M = 20;
export const GPS_ACCURACY_GATE_RADIUS_FRACTION = 0.5;

export function accuracyGateM(effectiveRadius: number): number {
  return Math.max(GPS_ACCURACY_GATE_MIN_M, effectiveRadius * GPS_ACCURACY_GATE_RADIUS_FRACTION);
}

/**
 * Whether a fix is good enough to drive the alarm.
 * - `null`/`undefined` accuracy: the platform gave no estimate — trust it
 *   (matches pre-gating behaviour rather than silently disabling the alarm).
 * - negative accuracy: iOS convention for "invalid" — never trust.
 */
export function isFixTrusted(accuracy: number | null | undefined, effectiveRadius: number): boolean {
  if (accuracy == null) return true;
  if (accuracy < 0) return false;
  return accuracy <= accuracyGateM(effectiveRadius);
}

// ─── Confirmation + hysteresis ────────────────────────────────────────────────
//
// Escalation requires ALARM_CONFIRM_FIXES consecutive trusted fixes at (or
// above) the new level. A genuine drag is monotonic so this only delays the
// alarm by one fix interval; boundary jitter that alternates in/out never
// reaches the count.
//
// De-escalation is evaluated against thresholds scaled by ALARM_HYSTERESIS so
// a boat sitting exactly on the ring doesn't toggle the siren every fix.

export const ALARM_CONFIRM_FIXES = 2;
export const ALARM_HYSTERESIS = 0.9;

const RANK: Record<AlarmLevel, number> = { silent: 0, alert: 1, emergency: 2 };

export interface PendingAlarm {
  level: AlarmLevel;
  count: number;
}

export const NO_PENDING_ALARM: PendingAlarm = { level: 'silent', count: 0 };

export interface AlarmTransitionInput {
  current: AlarmLevel;
  pending: PendingAlarm;
  distance: number;
  radius: number;
  customZone: Coordinate[] | null;
  boatPos: Coordinate | null;
  emergencyThresholdPct?: number;
  confirmFixes?: number;
  hysteresis?: number;
}

export interface AlarmTransition {
  level: AlarmLevel;
  pending: PendingAlarm;
}

export function nextAlarmLevel({
  current,
  pending,
  distance,
  radius,
  customZone,
  boatPos,
  emergencyThresholdPct = DEFAULT_EMERGENCY_THRESHOLD_PCT,
  confirmFixes = ALARM_CONFIRM_FIXES,
  hysteresis = ALARM_HYSTERESIS,
}: AlarmTransitionInput): AlarmTransition {
  const raw = computeAlarmLevel(distance, radius, customZone, boatPos, emergencyThresholdPct);

  if (RANK[raw] > RANK[current]) {
    // Escalating — count consecutive fixes that agree on the new level.
    const count = pending.level === raw ? pending.count + 1 : 1;
    if (count >= confirmFixes) {
      return { level: raw, pending: NO_PENDING_ALARM };
    }
    return { level: current, pending: { level: raw, count } };
  }

  if (RANK[raw] === RANK[current]) {
    return { level: current, pending: NO_PENDING_ALARM };
  }

  // De-escalating — re-evaluate with shrunk thresholds; never let the
  // hysteresis pass escalate above where we already are.
  const relaxed = computeAlarmLevel(distance, radius * hysteresis, customZone, boatPos, emergencyThresholdPct);
  const level = RANK[relaxed] < RANK[current] ? relaxed : current;
  return { level, pending: NO_PENDING_ALARM };
}
