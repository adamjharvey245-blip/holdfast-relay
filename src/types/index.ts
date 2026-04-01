export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface TimestampedCoordinate extends Coordinate {
  timestamp: number;
  accuracy?: number;
  speed?: number;
}

export type AlarmLevel = 'silent' | 'alert' | 'emergency';

export type GpsStatus = 'searching' | 'ok' | 'degraded' | 'lost';

export interface AlarmThresholds {
  gpsLostSecs: number;
  alarmCooldownSecs: number;
  emergencyThresholdPct: number; // % of radius at which alert escalates to emergency (default 120)
  alertSoundKey: string;         // key into ALARM_SOUNDS (default 'alarm')
  emergencySoundKey: string;     // key into ALARM_SOUNDS (default 'alarm')
  gpsLostSoundKey: string;       // key into ALARM_SOUNDS (default 'alarm')
}

export interface TideDataPoint {
  dt: number;     // Unix timestamp in seconds
  height: number; // Height in metres above chart datum
}

export interface AnchorState {
  anchorPosition: Coordinate | null;
  boatPosition: TimestampedCoordinate | null;
  watchRadius: number;
  customZone: Coordinate[] | null;
  positionHistory: TimestampedCoordinate[];
  isWatchActive: boolean;
  isTrackingPaused: boolean;
  currentDistance: number;
  isDragging: boolean;
  alarmLevel: AlarmLevel;
  gpsCancelledAt: number | null;
  draggingCancelledAt: number | null;
  alarmReFireTick: number;
  gpsStatus: GpsStatus;
  gpsAccuracy: number | null;
  gpsLostAt: number | null;
  alarmThresholds: AlarmThresholds;
  watchCode: string | null;
  selectedHistoryIndex: number | null;
  tideEnabled: boolean;
  tideAutoMode: boolean;
  anchorTideHeight: number;
  currentTideHeight: number;
  tideData: TideDataPoint[] | null;
  tideDataFetchedAt: number | null;
  tideDataLat: number | null;
  tideDataLon: number | null;
}

export interface RelayMessage {
  type: 'position' | 'anchor' | 'alarm' | 'status';
  code: string;
  payload: PositionPayload | AnchorPayload | AlarmPayload | StatusPayload;
  ts: number;
}

export interface PositionPayload {
  lat: number;
  lng: number;
  accuracy?: number;
  distanceFromAnchor: number;
}

export interface AnchorPayload {
  lat: number;
  lng: number;
  radius: number;
}

export interface AlarmPayload {
  level: AlarmLevel;
  distanceFromAnchor: number;
}

export interface StatusPayload {
  gpsStatus: GpsStatus;
  isWatchActive: boolean;
}

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
