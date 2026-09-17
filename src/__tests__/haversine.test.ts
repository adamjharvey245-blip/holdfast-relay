import {
  haversineDistance,
  bearingDegrees,
  offsetCoordinate,
  pointInPolygon,
  circlePolygon,
} from '@/utils/haversine';

// Sydney Opera House — a real-world anchor for the sanity checks below.
const LAT = -33.8568;
const LON = 151.2153;

describe('haversineDistance', () => {
  it('is zero for identical points', () => {
    expect(haversineDistance(LAT, LON, LAT, LON)).toBe(0);
  });

  it('is symmetric', () => {
    const a = haversineDistance(LAT, LON, LAT + 0.001, LON + 0.001);
    const b = haversineDistance(LAT + 0.001, LON + 0.001, LAT, LON);
    expect(a).toBeCloseTo(b, 9);
  });

  it('matches a known long-distance reference (London → Paris ≈ 343.5 km)', () => {
    const d = haversineDistance(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d / 1000).toBeCloseTo(343.5, 0);
  });

  it('round-trips through offsetCoordinate at anchor-alarm scales', () => {
    for (const metres of [5, 30, 100, 500]) {
      const p = offsetCoordinate(LAT, LON, metres, 0);
      expect(haversineDistance(LAT, LON, p.latitude, p.longitude)).toBeCloseTo(metres, 2);
      const q = offsetCoordinate(LAT, LON, 0, metres);
      expect(haversineDistance(LAT, LON, q.latitude, q.longitude)).toBeCloseTo(metres, 2);
    }
  });
});

describe('bearingDegrees', () => {
  it('returns the cardinal directions for pure N/E/S/W offsets', () => {
    const n = offsetCoordinate(LAT, LON, 100, 0);
    const e = offsetCoordinate(LAT, LON, 0, 100);
    const s = offsetCoordinate(LAT, LON, -100, 0);
    const w = offsetCoordinate(LAT, LON, 0, -100);
    expect(bearingDegrees(LAT, LON, n.latitude, n.longitude)).toBeCloseTo(0, 0);
    expect(bearingDegrees(LAT, LON, e.latitude, e.longitude)).toBeCloseTo(90, 0);
    expect(bearingDegrees(LAT, LON, s.latitude, s.longitude)).toBeCloseTo(180, 0);
    expect(bearingDegrees(LAT, LON, w.latitude, w.longitude)).toBeCloseTo(270, 0);
  });

  it('always returns a value in [0, 360)', () => {
    const b = bearingDegrees(LAT, LON, LAT - 0.01, LON - 0.01);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('pointInPolygon', () => {
  const diamond = circlePolygon(LAT, LON, 50, 4); // 50 m to each vertex

  it('rejects polygons with fewer than 3 points', () => {
    expect(pointInPolygon({ latitude: LAT, longitude: LON }, diamond.slice(0, 2))).toBe(false);
  });

  it('contains its own centre', () => {
    expect(pointInPolygon({ latitude: LAT, longitude: LON }, diamond)).toBe(true);
  });

  it('excludes a point well outside', () => {
    const far = offsetCoordinate(LAT, LON, 200, 200);
    expect(pointInPolygon(far, diamond)).toBe(false);
  });

  it('circlePolygon vertices lie on the requested radius', () => {
    const ring = circlePolygon(LAT, LON, 30, 16);
    expect(ring).toHaveLength(17); // closed ring: points + 1
    for (const v of ring) {
      expect(haversineDistance(LAT, LON, v.latitude, v.longitude)).toBeCloseTo(30, 1);
    }
  });
});
