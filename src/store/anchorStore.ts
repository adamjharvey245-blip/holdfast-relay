import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { haversineDistance, pointInPolygon } from '../utils/haversine';
import type {
  AnchorState,
  AlarmLevel,
  AlarmThresholds,
  Coordinate,
  TimestampedCoordinate,
  GpsStatus,
  TideDataPoint,
} from '@/types';

const HISTORY_MAX_MS = 4 * 60 * 60 * 1000;
const STORAGE_KEY = 'holdfast_state';

const DEFAULT_THRESHOLDS: AlarmThresholds = {
  gpsLostSecs: 60,
  alarmCooldownSecs: 120,
  emergencyThresholdPct: 120,
  alertSoundKey: 'alarm',
  emergencySoundKey: 'alarm',
  gpsLostSoundKey: 'alarm',
};

function computeEffectiveRadius(
  watchRadius: number,
  tideEnabled: boolean,
  anchorTideHeight: number,
  currentTideHeight: number
): number {
  if (!tideEnabled) return watchRadius;
  return Math.max(5, watchRadius + anchorTideHeight - currentTideHeight);
}

function computeAlarmLevel(
  distance: number,
  radius: number,
  customZone: Coordinate[] | null,
  boatPos: Coordinate | null,
  emergencyThresholdPct = 120
): AlarmLevel {
  if (customZone && customZone.length >= 3 && boatPos) {
    return pointInPolygon(boatPos, customZone) ? 'silent' : 'alert';
  }
  if (distance >= radius * (emergencyThresholdPct / 100)) return 'emergency';
  if (distance >= radius) return 'alert';
  return 'silent';
}

// Shared reset applied whenever anchor is dropped or cleared
const ALARM_RESET = {
  alarmLevel: 'silent' as AlarmLevel,
  gpsCancelledAt: null as null,
  draggingCancelledAt: null as null,
  alarmReFireTick: 0,
  currentDistance: 0,
  isDragging: false,
};

interface AnchorActions {
  setAnchorPosition: (coord: Coordinate) => void;
  clearAnchor: () => void;
  updateBoatPosition: (coord: TimestampedCoordinate) => void;
  setWatchRadius: (radius: number) => void;
  setWatchActive: (active: boolean) => void;
  setTrackingPaused: (paused: boolean) => void;
  setCustomZone: (points: Coordinate[] | null) => void;
  setAlarmLevel: (level: AlarmLevel) => void;
  cancelAlarm: () => void;
  clearGpsCancel: () => void;
  clearDraggingCancel: () => void;
  setGpsStatus: (status: GpsStatus) => void;
  setCurrentDistance: (distance: number) => void;
  setIsDragging: (dragging: boolean) => void;
  setWatchCode: (code: string | null) => void;
  setSelectedHistoryIndex: (index: number | null) => void;
  useHistoryPositionAsAnchor: () => void;
  setAlarmThresholds: (t: Partial<AlarmThresholds>) => void;
  hydrateFromStorage: () => Promise<void>;
  persistToStorage: () => Promise<void>;
  generateWatchCode: () => void;
  setTideEnabled: (enabled: boolean) => void;
  setTideAutoMode: (auto: boolean) => void;
  setAnchorTideHeight: (height: number) => void;
  setCurrentTideHeight: (height: number) => void;
  setTideData: (data: TideDataPoint[], lat: number, lon: number) => void;
}

type AnchorStore = AnchorState & AnchorActions;

const initialState: AnchorState = {
  anchorPosition: null,
  boatPosition: null,
  watchRadius: 30,
  customZone: null,
  positionHistory: [],
  isWatchActive: false,
  isTrackingPaused: false,
  currentDistance: 0,
  isDragging: false,
  alarmLevel: 'silent',
  gpsCancelledAt: null,
  draggingCancelledAt: null,
  alarmReFireTick: 0,
  gpsStatus: 'searching',
  gpsAccuracy: null,
  gpsLostAt: null,
  alarmThresholds: DEFAULT_THRESHOLDS,
  watchCode: null,
  selectedHistoryIndex: null,
  tideEnabled: false,
  tideAutoMode: true,
  anchorTideHeight: 0,
  currentTideHeight: 0,
  tideData: null,
  tideDataFetchedAt: null,
  tideDataLat: null,
  tideDataLon: null,
};

export const useAnchorStore = create<AnchorStore>((set, get) => ({
  ...initialState,

  setAnchorPosition: (coord) => {
    set({ anchorPosition: coord, selectedHistoryIndex: null, ...ALARM_RESET });
    get().persistToStorage();
  },

  clearAnchor: () => {
    set({ anchorPosition: null, isWatchActive: false, selectedHistoryIndex: null, ...ALARM_RESET });
    get().persistToStorage();
  },

  // ── updateBoatPosition ───────────────────────────────────────────────────

  updateBoatPosition: (coord) => {
    const cutoff = Date.now() - HISTORY_MAX_MS;
    const state = get();

    const base = {
      boatPosition: coord,
      positionHistory: state.isTrackingPaused
        ? state.positionHistory.filter((p) => p.timestamp > cutoff)
        : [...state.positionHistory.filter((p) => p.timestamp > cutoff), coord],
      gpsStatus: 'ok' as GpsStatus,
      gpsAccuracy: coord.accuracy ?? null,
      gpsLostAt: null,
      // Clear GPS cancel when GPS signal returns — dragging alarm fires independently
      ...(state.gpsStatus === 'lost' ? { gpsCancelledAt: null } : {}),
    };

    if (!state.isWatchActive || !state.anchorPosition) {
      set(base);
      return;
    }

    const distance = haversineDistance(
      state.anchorPosition.latitude,
      state.anchorPosition.longitude,
      coord.latitude,
      coord.longitude
    );

    const effectiveRadius = computeEffectiveRadius(state.watchRadius, state.tideEnabled, state.anchorTideHeight, state.currentTideHeight);
    const alarmLevel = computeAlarmLevel(distance, effectiveRadius, state.customZone, coord, state.alarmThresholds.emergencyThresholdPct);

    // Only clear draggingCancelledAt when alarm resolves AND no active cancel cooldown.
    // GPS jitter can cause brief silent readings while still outside the zone — if we
    // clear the cancel, the alarm re-fires on the very next update outside the zone.
    const now = Date.now();
    const cooldownMs = (state.alarmThresholds?.alarmCooldownSecs ?? 120) * 1000;
    const dragCancelActive =
      state.draggingCancelledAt !== null && now < state.draggingCancelledAt + cooldownMs;

    set({
      ...base,
      currentDistance: distance,
      alarmLevel,
      isDragging: alarmLevel !== 'silent',
      // Only clear cancel stamp when alarm truly resolves (no active cooldown)
      ...(alarmLevel === 'silent' && !dragCancelActive ? { draggingCancelledAt: null } : {}),
    });
  },

  setWatchRadius: (radius) => {
    const clampedRadius = Math.max(5, Math.min(500, radius));
    const state = get();
    if (state.isWatchActive && state.anchorPosition && state.gpsStatus !== 'lost') {
      const er = computeEffectiveRadius(clampedRadius, state.tideEnabled, state.anchorTideHeight, state.currentTideHeight);
      const newLevel = computeAlarmLevel(state.currentDistance, er, state.customZone, state.boatPosition, state.alarmThresholds.emergencyThresholdPct);
      set({
        watchRadius: clampedRadius,
        alarmLevel: newLevel,
        isDragging: newLevel !== 'silent',
        ...(newLevel === 'silent' ? { draggingCancelledAt: null } : {}),
      });
    } else {
      set({ watchRadius: clampedRadius });
    }
    get().persistToStorage();
  },

  setWatchActive: (active) => {
    if (!active) {
      // Disabling watch — reset alarm state so alarm system stops sound/vibration
      set({ isWatchActive: false, ...ALARM_RESET });
    } else {
      set({ isWatchActive: true });
    }
  },
  setTrackingPaused: (paused) => set({ isTrackingPaused: paused }),
  setCustomZone: (points) => {
    set({ customZone: points });
    get().persistToStorage();
  },

  setAlarmLevel: (level) => set({ alarmLevel: level }),

  // Snooze the currently active alarm for alarmCooldownSecs
  cancelAlarm: () => {
    const { alarmLevel, gpsStatus } = get();
    const now = Date.now();
    if (gpsStatus === 'lost' && alarmLevel === 'emergency') {
      set({ gpsCancelledAt: now });
    } else if (alarmLevel !== 'silent') {
      set({ draggingCancelledAt: now });
    }
  },

  // Called when GPS cancel cooldown expires — increments tick to trigger re-fire
  clearGpsCancel: () =>
    set((s) => ({ gpsCancelledAt: null, alarmReFireTick: s.alarmReFireTick + 1 })),

  // Called when dragging cancel cooldown expires — increments tick to trigger re-fire
  clearDraggingCancel: () =>
    set((s) => ({ draggingCancelledAt: null, alarmReFireTick: s.alarmReFireTick + 1 })),

  setGpsStatus: (status) => {
    const prev = get().gpsStatus;
    if (status === 'lost' && prev !== 'lost') {
      set({ gpsStatus: status, gpsLostAt: Date.now() });
    } else if (status !== 'lost') {
      set({ gpsStatus: status, gpsLostAt: null });
    } else {
      set({ gpsStatus: status });
    }
  },

  setCurrentDistance: (distance) => set({ currentDistance: distance }),
  setIsDragging: (dragging) => set({ isDragging: dragging }),
  setWatchCode: (code) => set({ watchCode: code }),
  setSelectedHistoryIndex: (index) => set({ selectedHistoryIndex: index }),

  useHistoryPositionAsAnchor: () => {
    const { positionHistory, selectedHistoryIndex } = get();
    if (selectedHistoryIndex === null) return;
    const point = positionHistory[selectedHistoryIndex];
    if (!point) return;
    set({
      anchorPosition: { latitude: point.latitude, longitude: point.longitude },
      selectedHistoryIndex: null,
      ...ALARM_RESET,
    });
    get().persistToStorage();
  },

  setAlarmThresholds: (t) => {
    const state = get();
    const newThresholds = { ...state.alarmThresholds, ...t };
    set({ alarmThresholds: newThresholds });
    get().persistToStorage();
  },

  generateWatchCode: () => {
    set({ watchCode: Math.floor(1000 + Math.random() * 9000).toString() });
  },

  setTideEnabled: (enabled) => {
    set({ tideEnabled: enabled });
    const state = get();
    if (state.isWatchActive && state.anchorPosition && state.gpsStatus !== 'lost') {
      const er = computeEffectiveRadius(state.watchRadius, enabled, state.anchorTideHeight, state.currentTideHeight);
      const newLevel = computeAlarmLevel(state.currentDistance, er, state.customZone, state.boatPosition, state.alarmThresholds.emergencyThresholdPct);
      set({ alarmLevel: newLevel, isDragging: newLevel !== 'silent', ...(newLevel === 'silent' ? { draggingCancelledAt: null } : {}) });
    }
    get().persistToStorage();
  },

  setTideAutoMode: (auto) => {
    set({ tideAutoMode: auto });
    get().persistToStorage();
  },

  setTideData: (data, lat, lon) => {
    set({ tideData: data, tideDataFetchedAt: Date.now(), tideDataLat: lat, tideDataLon: lon });
  },

  setAnchorTideHeight: (height) => {
    const h = Math.round(height * 10) / 10;
    set({ anchorTideHeight: h });
    const state = get();
    if (state.tideEnabled && state.isWatchActive && state.anchorPosition && state.gpsStatus !== 'lost') {
      const er = computeEffectiveRadius(state.watchRadius, true, h, state.currentTideHeight);
      const newLevel = computeAlarmLevel(state.currentDistance, er, state.customZone, state.boatPosition, state.alarmThresholds.emergencyThresholdPct);
      set({ alarmLevel: newLevel, isDragging: newLevel !== 'silent', ...(newLevel === 'silent' ? { draggingCancelledAt: null } : {}) });
    }
    get().persistToStorage();
  },

  setCurrentTideHeight: (height) => {
    const h = Math.round(height * 10) / 10;
    set({ currentTideHeight: h });
    const state = get();
    if (state.tideEnabled && state.isWatchActive && state.anchorPosition && state.gpsStatus !== 'lost') {
      const er = computeEffectiveRadius(state.watchRadius, true, state.anchorTideHeight, h);
      const newLevel = computeAlarmLevel(state.currentDistance, er, state.customZone, state.boatPosition, state.alarmThresholds.emergencyThresholdPct);
      set({ alarmLevel: newLevel, isDragging: newLevel !== 'silent', ...(newLevel === 'silent' ? { draggingCancelledAt: null } : {}) });
    }
    get().persistToStorage();
  },

  hydrateFromStorage: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<AnchorState>;
      const saved_thresholds = saved.alarmThresholds ?? {};
      set({
        anchorPosition: saved.anchorPosition ?? null,
        watchRadius: saved.watchRadius ?? 30,
        customZone: (saved as any).customZone ?? null,
        tideEnabled: (saved as any).tideEnabled ?? false,
        tideAutoMode: (saved as any).tideAutoMode ?? true,
        anchorTideHeight: (saved as any).anchorTideHeight ?? 0,
        currentTideHeight: (saved as any).currentTideHeight ?? 0,
        alarmThresholds: {
          gpsLostSecs: (saved_thresholds as AlarmThresholds).gpsLostSecs ?? DEFAULT_THRESHOLDS.gpsLostSecs,
          alarmCooldownSecs: (saved_thresholds as AlarmThresholds).alarmCooldownSecs ?? DEFAULT_THRESHOLDS.alarmCooldownSecs,
          emergencyThresholdPct: (saved_thresholds as AlarmThresholds).emergencyThresholdPct ?? DEFAULT_THRESHOLDS.emergencyThresholdPct,
          alertSoundKey: (saved_thresholds as AlarmThresholds).alertSoundKey ?? DEFAULT_THRESHOLDS.alertSoundKey,
          emergencySoundKey: (saved_thresholds as AlarmThresholds).emergencySoundKey ?? DEFAULT_THRESHOLDS.emergencySoundKey,
          gpsLostSoundKey: (saved_thresholds as AlarmThresholds).gpsLostSoundKey ?? DEFAULT_THRESHOLDS.gpsLostSoundKey,
        },
      });
    } catch {}
  },

  persistToStorage: async () => {
    const { anchorPosition, watchRadius, alarmThresholds, customZone, tideEnabled, tideAutoMode, anchorTideHeight, currentTideHeight } = get();
    try {
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ anchorPosition, watchRadius, alarmThresholds, customZone, tideEnabled, tideAutoMode, anchorTideHeight, currentTideHeight })
      );
    } catch {}
  },
}));
