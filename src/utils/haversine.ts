// ─── Haversine Formula ────────────────────────────────────────────────────────
// Returns the great-circle distance in metres between two GPS coordinates.

const EARTH_RADIUS_M = 6_371_000;

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

// ─── Bearing ──────────────────────────────────────────────────────────────────
// Returns the initial bearing in degrees (0–360) from point 1 to point 2.

export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ─── Offset coordinate ────────────────────────────────────────────────────────
// Returns a coordinate displaced by dx (east, metres) and dy (north, metres).

export function offsetCoordinate(
  lat: number,
  lon: number,
  northMetres: number,
  eastMetres: number
): { latitude: number; longitude: number } {
  const dLat = northMetres / EARTH_RADIUS_M;
  const dLon =
    eastMetres / (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180));

  return {
    latitude: lat + (dLat * 180) / Math.PI,
    longitude: lon + (dLon * 180) / Math.PI,
  };
}

// ─── Point in polygon (ray casting) ──────────────────────────────────────────
// Returns true if the point is inside the polygon (works with lat/lng coords).

export function pointInPolygon(
  point: { latitude: number; longitude: number },
  polygon: { latitude: number; longitude: number }[]
): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  const x = point.latitude, y = point.longitude;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].latitude, yi = polygon[i].longitude;
    const xj = polygon[j].latitude, yj = polygon[j].longitude;
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ─── Circle polygon for map overlay ──────────────────────────────────────────

export function circlePolygon(
  centerLat: number,
  centerLon: number,
  radiusMetres: number,
  points = 64
): { latitude: number; longitude: number }[] {
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = radiusMetres * Math.sin(angle);
    const dy = radiusMetres * Math.cos(angle);
    coords.push(offsetCoordinate(centerLat, centerLon, dy, dx));
  }
  return coords;
}
