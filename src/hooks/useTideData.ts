import { useEffect, useRef } from 'react';
import { useAnchorStore } from '@/store/anchorStore';
import { WORLDTIDES_API_KEY, TIDE_API_CONFIGURED } from '@/config/tideApi';
import { haversineDistance } from '../utils/haversine';

// Re-fetch if boat has moved >50km from where data was fetched,
// or if cached data is older than 12 hours.
const REFETCH_DISTANCE_M = 50_000;
const REFETCH_AGE_MS = 12 * 60 * 60 * 1000;

// Update currentTideHeight from cached curve once per hour.
// Tides change slowly — hourly resolution is more than sufficient.
const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

function interpolate(
  data: { dt: number; height: number }[],
  nowSec: number
): number | null {
  if (!data.length) return null;
  for (let i = 0; i < data.length - 1; i++) {
    if (nowSec >= data[i].dt && nowSec <= data[i + 1].dt) {
      const frac = (nowSec - data[i].dt) / (data[i + 1].dt - data[i].dt);
      return data[i].height + frac * (data[i + 1].height - data[i].height);
    }
  }
  return nowSec < data[0].dt ? data[0].height : data[data.length - 1].height;
}

export function useTideData() {
  const fetchingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevAnchorKey = useRef<string | null>(null);

  const tideEnabled = useAnchorStore((s) => s.tideEnabled);
  const tideAutoMode = useAnchorStore((s) => s.tideAutoMode);
  const boatLat = useAnchorStore((s) => s.boatPosition?.latitude);
  const boatLon = useAnchorStore((s) => s.boatPosition?.longitude);
  const anchorLat = useAnchorStore((s) => s.anchorPosition?.latitude);
  const anchorLon = useAnchorStore((s) => s.anchorPosition?.longitude);
  const tideData = useAnchorStore((s) => s.tideData);

  // ── Fetch 48-hour tide curve when needed ──────────────────────────────────
  useEffect(() => {
    if (!tideEnabled || !tideAutoMode || !TIDE_API_CONFIGURED) return;

    const lat = boatLat ?? anchorLat;
    const lon = boatLon ?? anchorLon;
    if (lat === undefined || lon === undefined) return;

    const { tideData: data, tideDataFetchedAt, tideDataLat, tideDataLon } =
      useAnchorStore.getState();

    const needsFetch =
      !data ||
      !tideDataFetchedAt ||
      tideDataLat === null ||
      tideDataLon === null ||
      Date.now() - tideDataFetchedAt > REFETCH_AGE_MS ||
      haversineDistance(lat, lon, tideDataLat, tideDataLon) > REFETCH_DISTANCE_M;

    if (!needsFetch || fetchingRef.current) return;

    fetchingRef.current = true;
    const now = Math.floor(Date.now() / 1000);
    // Fetch 48 hours of heights at 10-minute intervals (1 API unit)
    const url =
      `https://www.worldtides.info/api/v3?heights` +
      `&lat=${lat}&lon=${lon}` +
      `&start=${now}&length=172800&step=600` +
      `&key=${WORLDTIDES_API_KEY}`;

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.heights) && json.heights.length > 0) {
          useAnchorStore.getState().setTideData(json.heights, lat, lon);
        }
      })
      .catch(() => {})
      .finally(() => { fetchingRef.current = false; });
  }, [tideEnabled, tideAutoMode, boatLat, boatLon, anchorLat, anchorLon]);

  // ── Update currentTideHeight hourly from cached curve ─────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!tideEnabled || !tideAutoMode || !tideData) return;

    const tick = () => {
      const h = interpolate(
        useAnchorStore.getState().tideData ?? [],
        Math.floor(Date.now() / 1000),
      );
      if (h !== null) {
        useAnchorStore.getState().setCurrentTideHeight(Math.round(h * 10) / 10);
      }
    };

    tick(); // apply immediately, then every hour
    timerRef.current = setInterval(tick, UPDATE_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [tideEnabled, tideAutoMode, tideData]);

  // ── Auto-set anchorTideHeight when anchor is dropped ─────────────────────
  useEffect(() => {
    if (!tideEnabled || !tideAutoMode || !tideData) return;
    if (anchorLat === undefined || anchorLon === undefined) return;

    const key = `${anchorLat},${anchorLon}`;
    if (key === prevAnchorKey.current) return;
    prevAnchorKey.current = key;

    const h = interpolate(tideData, Math.floor(Date.now() / 1000));
    if (h !== null) {
      useAnchorStore.getState().setAnchorTideHeight(Math.round(h * 10) / 10);
    }
  }, [tideEnabled, tideAutoMode, tideData, anchorLat, anchorLon]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);
}
