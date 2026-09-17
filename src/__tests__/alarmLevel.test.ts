import { computeAlarmLevel, computeEffectiveRadius, MIN_EFFECTIVE_RADIUS_M } from '@/utils/alarmLevel';
import { circlePolygon, offsetCoordinate } from '@/utils/haversine';

const LAT = -33.8568;
const LON = 151.2153;

describe('computeAlarmLevel — circular zone', () => {
  const R = 30;

  it('is silent inside the radius', () => {
    expect(computeAlarmLevel(0, R, null, null)).toBe('silent');
    expect(computeAlarmLevel(29.9, R, null, null)).toBe('silent');
  });

  it('alerts exactly at the boundary', () => {
    expect(computeAlarmLevel(30, R, null, null)).toBe('alert');
  });

  it('stays at alert between the boundary and the emergency threshold', () => {
    expect(computeAlarmLevel(35.9, R, null, null)).toBe('alert');
  });

  it('escalates to emergency at the default 120% threshold', () => {
    expect(computeAlarmLevel(36, R, null, null)).toBe('emergency');
    expect(computeAlarmLevel(500, R, null, null)).toBe('emergency');
  });

  it('honours a custom emergency threshold', () => {
    expect(computeAlarmLevel(44, R, null, null, 150)).toBe('alert');
    expect(computeAlarmLevel(45, R, null, null, 150)).toBe('emergency');
  });

  it('treats a 100% threshold as immediate emergency at the boundary', () => {
    expect(computeAlarmLevel(30, R, null, null, 100)).toBe('emergency');
  });
});

describe('computeAlarmLevel — custom polygon zone', () => {
  const zone = circlePolygon(LAT, LON, 40, 8);
  const inside = { latitude: LAT, longitude: LON };
  const outside = offsetCoordinate(LAT, LON, 100, 0);

  it('is silent inside the polygon regardless of distance', () => {
    expect(computeAlarmLevel(999, 30, zone, inside)).toBe('silent');
  });

  it('alerts outside the polygon regardless of distance', () => {
    expect(computeAlarmLevel(0, 30, zone, outside)).toBe('alert');
  });

  it('never escalates to emergency for a polygon zone', () => {
    const veryFar = offsetCoordinate(LAT, LON, 5000, 0);
    expect(computeAlarmLevel(5000, 30, zone, veryFar)).toBe('alert');
  });

  it('falls back to the circle when the polygon has fewer than 3 points', () => {
    expect(computeAlarmLevel(50, 30, zone.slice(0, 2), outside)).toBe('emergency');
  });

  it('falls back to the circle when there is no boat position', () => {
    expect(computeAlarmLevel(50, 30, zone, null)).toBe('emergency');
  });
});

describe('computeEffectiveRadius', () => {
  it('returns the raw radius when tide compensation is off', () => {
    expect(computeEffectiveRadius(30, false, 2, 5)).toBe(30);
  });

  it('shrinks the radius as the tide rises above the anchor-set height', () => {
    expect(computeEffectiveRadius(30, true, 1.0, 3.0)).toBe(28);
  });

  it('grows the radius as the tide falls below the anchor-set height', () => {
    expect(computeEffectiveRadius(30, true, 3.0, 1.0)).toBe(32);
  });

  it('never collapses below the minimum', () => {
    expect(computeEffectiveRadius(6, true, 0, 10)).toBe(MIN_EFFECTIVE_RADIUS_M);
  });
});
