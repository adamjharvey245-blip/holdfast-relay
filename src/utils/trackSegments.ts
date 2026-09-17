import type { Coordinate, TimestampedCoordinate } from '@/types';

// ─── Snail-trail segmentation ─────────────────────────────────────────────────
//
// The track is drawn as a fixed number of Polylines, one per time window
// (segment 0 = most recent). This module turns the raw position history into
// per-segment coordinate arrays while keeping two properties that matter for
// react-native-maps:
//
//  1. Segments are chained: each segment starts from the last point of the
//     older window, so there are no gaps at colour boundaries.
//  2. Array references are STABLE. On iOS every new `coordinates` prop makes
//     the native view remove and re-add its MKOverlay, and overlays re-added
//     mid-gesture routinely fail to draw until the next invalidation. Feeding
//     six new arrays on every GPS fix meant any pinch-zoom had a good chance
//     of blanking a segment. Now a segment only gets a new array when its
//     points actually changed, so at most one or two overlays churn per fix.

export const TRACK_SEGMENT_COUNT = 6;
export const TRACK_SEGMENT_HOURS = 4;

export type TrackSegment = Coordinate[] | null;

/** Two GPS samples closer than this are treated as the same point. */
const DEDUPE_DEG = 1e-6; // ≈ 0.1 m

function samePoint(a: Coordinate, b: Coordinate): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < DEDUPE_DEG &&
    Math.abs(a.longitude - b.longitude) < DEDUPE_DEG
  );
}

function segmentsEqual(a: TrackSegment, b: TrackSegment): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].latitude !== b[i].latitude || a[i].longitude !== b[i].longitude) return false;
  }
  return true;
}

/**
 * Build the per-segment coordinate arrays for the snail trail.
 *
 * @param history  Position history, oldest → newest (as kept by the store).
 * @param now      Reference time in ms; segment 0 is (now - 4h, now].
 * @param previous Result of the last call. Segments whose content is unchanged
 *                 are returned as the SAME array reference from `previous`.
 */
export function buildTrackSegments(
  history: TimestampedCoordinate[],
  now: number,
  previous: TrackSegment[] | null = null,
): TrackSegment[] {
  const windowMs = TRACK_SEGMENT_HOURS * 3_600_000;
  const next: TrackSegment[] = new Array(TRACK_SEGMENT_COUNT).fill(null);

  for (let seg = 0; seg < TRACK_SEGMENT_COUNT; seg++) {
    const segEnd = now - seg * windowMs;
    const segStart = segEnd - windowMs;

    const pts: Coordinate[] = [];
    // Chain from the last point of the older window so segments join up.
    let carry: Coordinate | null = null;
    for (const p of history) {
      if (p.timestamp <= segStart) {
        carry = p;
        continue;
      }
      if (p.timestamp > segEnd) break;
      if (carry) {
        pts.push({ latitude: carry.latitude, longitude: carry.longitude });
        carry = null;
      }
      const last = pts[pts.length - 1];
      if (last && samePoint(last, p)) continue;
      pts.push({ latitude: p.latitude, longitude: p.longitude });
    }

    // A polyline needs two distinct points to be visible at all.
    const built: TrackSegment = pts.length >= 2 ? pts : null;
    const prev = previous?.[seg] ?? null;
    next[seg] = segmentsEqual(prev, built) ? prev : built;
  }

  // If nothing changed at all, hand back the previous array wholesale so
  // downstream memoisation sees a stable value.
  if (previous && previous.length === next.length && previous.every((s, i) => s === next[i])) {
    return previous;
  }
  return next;
}
