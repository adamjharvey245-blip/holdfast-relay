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
