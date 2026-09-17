import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, PanResponder, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, {
  Marker,
  Circle,
  Polyline,
  Polygon,
  UrlTile,
} from 'react-native-maps';
import { useAnchorStore } from '@/store/anchorStore';
import { haversineDistance } from '@/utils/haversine';
import { tourRefs } from '@/components/tourTargets';
import type { MapRegion } from '@/types';
import { buildTrackSegments, TRACK_SEGMENT_COUNT, type TrackSegment } from '@/utils/trackSegments';

// ─── Snail-trail rendering constants (module scope → stable references) ──────
// Always exactly TRACK_SEGMENT_COUNT Polylines. Segment 0 = most recent 0–4h,
// segment 5 = 20–24h. Empty segments are drawn transparent with a fixed
// off-screen placeholder so the native view count never changes.
const SEGMENT_COLORS = ['#00d4ff', '#10b981', '#C9A227', '#f97316', '#a855f7', '#3b82f6'];
const FALLBACK_COORDS = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.0001 }];

interface RadarMapProps {
  onLongPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  drawingMode?: boolean;
  drawnPoints?: { latitude: number; longitude: number }[];
  onAddPoint?: (coordinate: { latitude: number; longitude: number }) => void;
  onUpdatePoint?: (index: number, coordinate: { latitude: number; longitude: number }) => void;
  // When the guided tour is running, force normally-hidden controls (e.g. the
  // anchor lock) to render so the tour can highlight and point at them.
  tourActive?: boolean;
}

export function RadarMap({
  onLongPress,
  onMapPress,
  drawingMode = false,
  drawnPoints = [],
  onAddPoint,
  onUpdatePoint,
  tourActive = false,
}: RadarMapProps) {
  const mapRef = useRef<MapView>(null);
  const isDraggingPointRef = useRef(false);
  const [followBoat, setFollowBoat] = useState(true);

  const [mapStyle, setMapStyle] = useState<'satellite' | 'standard' | 'chart'>('satellite');
  const [anchorLocked, setAnchorLocked] = useState(true);

  // Unlock hint toast
  const unlockToastAnim = useRef(new Animated.Value(0)).current;
  const showUnlockToast = () => {
    unlockToastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(unlockToastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(unlockToastAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
    ]).start();
  };

  const {
    anchorPosition,
    boatPosition,
    positionHistory,
    watchRadius,
    customZone,
    isDragging,
    isWatchActive,
    alarmLevel,
    selectedHistoryIndex,
    setAnchorPosition,
    setAnchorPositionSilent,
    setWatchRadius,
    setWatchRadiusSilent,
    tideEnabled,
    anchorTideHeight,
    currentTideHeight,
    ringLabelSpacingM,
    trackRetentionHours,
  } = useAnchorStore();

  // ── Track colour segments ─────────────────────────────────────────────────
  // Built with reference-stable output: a segment whose points have not
  // changed keeps its previous array, so react-native-maps only touches the
  // native overlays that actually need updating (see utils/trackSegments.ts).
  const trackSegmentsRef = useRef<TrackSegment[] | null>(null);
  const trackSegments = useMemo(() => {
    const next = buildTrackSegments(positionHistory, Date.now(), trackSegmentsRef.current);
    trackSegmentsRef.current = next;
    return next;
  }, [positionHistory]);

  const effectiveRadius = tideEnabled
    ? Math.max(5, watchRadius + anchorTideHeight - currentTideHeight)
    : watchRadius;

  const displayBoatPosition =
    selectedHistoryIndex !== null
      ? positionHistory[selectedHistoryIndex] ?? boatPosition
      : boatPosition;

  const isPlayback = selectedHistoryIndex !== null;

  // Last known map region (kept in sync from onRegionChange). Used for
  // synchronous screen→geo maths and to preserve zoom while following.
  const mapRegionRef = useRef({
    latitude: boatPosition?.latitude ?? 55.0,
    longitude: boatPosition?.longitude ?? -4.0,
    latitudeDelta: 0.005,
    longitudeDelta: 0.005,
  });

  // ── Auto-centre on boat ──────────────────────────────────────────────────

  // Re-centre on every fix while following, but keep whatever zoom the user
  // has chosen. Only snap to the close-up zoom when follow is (re)enabled —
  // forcing 0.002 on every fix undid pinch-zooms within seconds and made the
  // trail overlays flicker as the map jumped.
  const wasFollowingRef = useRef(false);
  useEffect(() => {
    if (!followBoat || !displayBoatPosition || !mapRef.current) {
      wasFollowingRef.current = followBoat;
      return;
    }
    const justEnabled = !wasFollowingRef.current;
    wasFollowingRef.current = true;
    const current = mapRegionRef.current;
    const region: MapRegion = {
      latitude: displayBoatPosition.latitude,
      longitude: displayBoatPosition.longitude,
      latitudeDelta: justEnabled ? 0.002 : current.latitudeDelta,
      longitudeDelta: justEnabled ? 0.002 : current.longitudeDelta,
    };
    mapRef.current.animateToRegion(region, justEnabled ? 600 : 400);
  }, [displayBoatPosition, followBoat]);

  // ── Distance ring data ───────────────────────────────────────────────────

  const METRES_TO_LAT = 1 / 111320;
  const FIXED_RING_COUNT = 5;

  const fixedRingProps = useMemo(() => {
    const center = anchorPosition ?? { latitude: 0, longitude: 0 };
    const spacing = ringLabelSpacingM ?? 10;
    return Array.from({ length: FIXED_RING_COUNT }, (_, i) => {
      const r = (i + 1) * spacing;
      const label = r >= 1000 ? `${(r / 1000).toFixed(1)}km` : `${r}m`;
      return {
        radius: r,
        label,
        latTop: center.latitude + r * METRES_TO_LAT,
        lng: center.longitude,
      };
    });
  }, [anchorPosition, ringLabelSpacingM]);

  const watchLabel = effectiveRadius >= 1000
    ? `${(effectiveRadius / 1000).toFixed(1)}km`
    : `${Math.round(effectiveRadius)}m`;

  const anchorCenter = anchorPosition ?? { latitude: 0, longitude: 0 };

  const METRES_TO_LON = anchorPosition
    ? 1 / (111320 * Math.cos(anchorPosition.latitude * Math.PI / 180))
    : 0;
  const radiusHandleCoord = anchorPosition && !anchorLocked && !customZone
    ? { latitude: anchorCenter.latitude, longitude: anchorCenter.longitude + effectiveRadius * METRES_TO_LON }
    : { latitude: 0, longitude: 0 };

  // ── Watch radius ring colour ─────────────────────────────────────────────

  const ringColor =
    !isWatchActive ? '#C9A227' :
    alarmLevel === 'emergency' || alarmLevel === 'alert' ? '#ef4444' : '#10b981';

  // ── Map press handler ────────────────────────────────────────────────────

  const handleMapPress = (e: any) => {
    if (isDraggingPointRef.current) return;
    const coord = e.nativeEvent.coordinate;
    if (drawingMode && onAddPoint) {
      onAddPoint(coord);
    } else if (onMapPress) {
      onMapPress(coord);
    }
  };

  // ── Custom drag system ───────────────────────────────────────────────────
  // PanResponder overlay intercepts touches near the anchor/radius handle and
  // converts screen coordinates to geo-coordinates synchronously, giving
  // instant response with no UILongPressGestureRecognizer delay.

  const mapSizeRef = useRef({ width: 1, height: 1 });
  const dragTargetRef = useRef<'anchor' | 'radius' | null>(null);
  const dragStartLocRef = useRef({ x: 0, y: 0 });

  // Refs for values used inside PanResponder (created once — closures are stale)
  const anchorLockedRef = useRef(anchorLocked);
  const anchorPositionRef = useRef(anchorPosition);
  const anchorCenterRef = useRef(anchorCenter);
  const radiusHandleRef = useRef(radiusHandleCoord);
  const drawingModeRef = useRef(drawingMode);
  const setFollowBoatRef = useRef(setFollowBoat);       // stable from useState
  const setAnchorPositionRef = useRef(setAnchorPosition);           // stable from zustand
  const setAnchorPositionSilentRef = useRef(setAnchorPositionSilent); // stable from zustand
  const setWatchRadiusRef = useRef(setWatchRadius);     // stable from zustand
  const setWatchRadiusSilentRef = useRef(setWatchRadiusSilent);     // stable from zustand

  useEffect(() => { anchorLockedRef.current = anchorLocked; }, [anchorLocked]);
  useEffect(() => { anchorPositionRef.current = anchorPosition; }, [anchorPosition]);
  useEffect(() => { anchorCenterRef.current = anchorCenter; }, [anchorCenter]);
  useEffect(() => { radiusHandleRef.current = radiusHandleCoord; }, [radiusHandleCoord]);
  useEffect(() => { drawingModeRef.current = drawingMode; }, [drawingMode]);

  // Synchronous screen → geo conversion using the stored map region.
  const screenToGeo = (x: number, y: number) => {
    const r = mapRegionRef.current;
    const { width, height } = mapSizeRef.current;
    if (!width || !height) return null;
    return {
      latitude: r.latitude + (height / 2 - y) / height * r.latitudeDelta,
      longitude: r.longitude + (x - width / 2) / width * r.longitudeDelta,
    };
  };

  // Synchronous geo → screen conversion.
  const geoToScreen = (coord: { latitude: number; longitude: number }) => {
    const r = mapRegionRef.current;
    const { width, height } = mapSizeRef.current;
    if (!width || !height) return null;
    return {
      x: width / 2 + (coord.longitude - r.longitude) / r.longitudeDelta * width,
      y: height / 2 - (coord.latitude - r.latitude) / r.latitudeDelta * height,
    };
  };

  const DRAG_SLOP = 44; // px touch target radius around anchor / handle

  const dragPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: (e) => {
      if (anchorLockedRef.current || drawingModeRef.current) return false;
      const ap = anchorPositionRef.current;
      if (!ap) return false;
      const { locationX: x, locationY: y } = e.nativeEvent;

      // Check if touch is near the anchor icon
      const anchorScrn = geoToScreen(ap);
      if (anchorScrn && Math.hypot(x - anchorScrn.x, y - anchorScrn.y) < DRAG_SLOP) {
        dragTargetRef.current = 'anchor';
        setFollowBoatRef.current(false);
        return true;
      }

      // Check if touch is near the radius drag handle
      const rh = radiusHandleRef.current;
      if (rh && !(rh.latitude === 0 && rh.longitude === 0)) {
        const rhScrn = geoToScreen(rh);
        if (rhScrn && Math.hypot(x - rhScrn.x, y - rhScrn.y) < DRAG_SLOP) {
          dragTargetRef.current = 'radius';
          return true;
        }
      }

      return false;
    },
    onMoveShouldSetPanResponder: () => dragTargetRef.current !== null,
    onPanResponderGrant: (e) => {
      dragStartLocRef.current = {
        x: e.nativeEvent.locationX,
        y: e.nativeEvent.locationY,
      };
    },
    onPanResponderMove: (_, gs) => {
      const newX = dragStartLocRef.current.x + gs.dx;
      const newY = dragStartLocRef.current.y + gs.dy;
      const geo = screenToGeo(newX, newY);
      if (!geo) return;

      if (dragTargetRef.current === 'anchor') {
        setAnchorPositionSilentRef.current(geo);
      } else if (dragTargetRef.current === 'radius') {
        const ac = anchorCenterRef.current;
        const dist = haversineDistance(ac.latitude, ac.longitude, geo.latitude, geo.longitude);
        setWatchRadiusSilentRef.current(Math.max(5, Math.round(dist)));
      }
    },
    onPanResponderRelease: (_, gs) => {
      const newX = dragStartLocRef.current.x + gs.dx;
      const newY = dragStartLocRef.current.y + gs.dy;
      const geo = screenToGeo(newX, newY);

      if (geo) {
        if (dragTargetRef.current === 'anchor') {
          setAnchorPositionRef.current(geo);
        } else if (dragTargetRef.current === 'radius') {
          const ac = anchorCenterRef.current;
          const dist = haversineDistance(ac.latitude, ac.longitude, geo.latitude, geo.longitude);
          setWatchRadiusRef.current(Math.max(5, Math.round(dist)));
        }
      }
      dragTargetRef.current = null;
    },
  })).current;

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        mapSizeRef.current = {
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        };
      }}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapStyle === 'satellite' ? 'hybrid' : mapStyle === 'chart' ? 'none' : 'standard'}
        showsUserLocation={boatPosition === null}
        showsCompass={true}
        showsScale={true}
        scrollEnabled={!drawingMode}
        zoomEnabled={!drawingMode}
        rotateEnabled={anchorLocked && !drawingMode}
        pitchEnabled={false}
        onPanDrag={() => setFollowBoat(false)}
        onRegionChange={(r) => { mapRegionRef.current = r; }}
        onRegionChangeComplete={(r) => { mapRegionRef.current = r; }}
        onLongPress={(!drawingMode && anchorLocked) ? (e) => onLongPress?.(e.nativeEvent.coordinate) : undefined}
        onPress={(drawingMode || onMapPress) ? handleMapPress : undefined}
        initialRegion={{
          latitude: boatPosition?.latitude ?? 55.0,
          longitude: boatPosition?.longitude ?? -4.0,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        }}
      >
        {/* Chart base tiles (OpenStreetMap) + OpenSeaMap nautical overlay */}
        {mapStyle === 'chart' && (
          <>
            <UrlTile
              urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              maximumZ={19}
              flipY={false}
              zIndex={-2}
            />
            <UrlTile
              urlTemplate="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
              maximumZ={18}
              flipY={false}
              zIndex={-1}
              opacity={0.9}
            />
          </>
        )}

        {/* Snail trail — always exactly TRACK_SEGMENT_COUNT Polylines, one per 4-hour segment */}
        {trackSegments.map((coords, seg) => (
          <Polyline
            key={`track-seg-${seg}`}
            coordinates={coords ?? FALLBACK_COORDS}
            strokeColor={coords ? SEGMENT_COLORS[seg] : 'transparent'}
            strokeWidth={coords ? 4 : 0}
            lineCap="round"
            lineJoin="round"
            zIndex={TRACK_SEGMENT_COUNT - seg}
          />
        ))}

        {/* Saved custom zone polygon — always rendered, transparent when inactive */}
        <Polygon
          coordinates={customZone && customZone.length >= 3 && !drawingMode
            ? customZone
            : [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.0001 }, { latitude: 0.0001, longitude: 0 }]}
          strokeColor={customZone && customZone.length >= 3 && !drawingMode ? ringColor : 'transparent'}
          strokeWidth={customZone && customZone.length >= 3 && !drawingMode ? 2 : 0}
          fillColor={customZone && customZone.length >= 3 && !drawingMode ? ringColor + '14' : 'transparent'}
        />

        {/* Watch radius fill — always rendered */}
        <Circle
          center={anchorCenter}
          radius={anchorPosition && !customZone ? effectiveRadius : 1}
          strokeColor="transparent"
          strokeWidth={0}
          fillColor={
            !anchorPosition || customZone ? 'transparent' :
            alarmLevel === 'emergency' ? 'rgba(239,68,68,0.15)' :
            alarmLevel === 'alert'     ? 'rgba(249,115,22,0.15)' :
                                         'rgba(16,185,129,0.12)'
          }
        />

        {/* Watch boundary ring — always rendered */}
        <Circle
          center={anchorCenter}
          radius={anchorPosition && !customZone ? effectiveRadius : 1}
          strokeColor={anchorPosition && !customZone ? 'rgba(255,255,255,0.9)' : 'transparent'}
          strokeWidth={2}
          fillColor="transparent"
        />

        {/* Fixed distance rings — always exactly 5, count never changes */}
        {fixedRingProps.map((rp, i) => (
          <Circle
            key={`fixed-ring-${i}`}
            center={anchorCenter}
            radius={anchorPosition ? rp.radius : 1}
            strokeColor={anchorPosition ? 'rgba(255,255,255,0.30)' : 'transparent'}
            strokeWidth={1}
            fillColor="transparent"
          />
        ))}

        {/* Fixed ring distance labels — always exactly 5 Markers */}
        {fixedRingProps.map((rp, i) => (
          <Marker
            key={`fixed-ring-label-${i}`}
            identifier={`fixed-ring-label-${i}`}
            coordinate={anchorPosition
              ? { latitude: rp.latTop, longitude: rp.lng }
              : { latitude: 0, longitude: 0 }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={styles.ringLabel}>
              <Text style={styles.ringLabelText}>
                {anchorPosition ? rp.label : ''}
              </Text>
            </View>
          </Marker>
        ))}

        {/* Watch ring labels — always rendered */}
        <Marker
          identifier="watch-label-top"
          coordinate={{ latitude: anchorCenter.latitude + (anchorPosition ? effectiveRadius * METRES_TO_LAT : 0.0001), longitude: anchorCenter.longitude }}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={false}
        >
          <View style={styles.ringLabel}>
            <Text style={styles.ringLabelTextWatch}>{anchorPosition && !customZone ? watchLabel : ''}</Text>
          </View>
        </Marker>
        <Marker
          identifier="watch-label-bot"
          coordinate={{ latitude: anchorCenter.latitude - (anchorPosition ? effectiveRadius * METRES_TO_LAT : 0.0001), longitude: anchorCenter.longitude }}
          anchor={{ x: 0.5, y: 0 }}
          tracksViewChanges={false}
        >
          <View style={styles.ringLabel}>
            <Text style={styles.ringLabelTextWatch}>{anchorPosition && !customZone ? watchLabel : ''}</Text>
          </View>
        </Marker>

        {/* Bearing line — always rendered, transparent when no anchor/boat */}
        <Polyline
          coordinates={anchorPosition && displayBoatPosition && !drawingMode
            ? [
                { latitude: displayBoatPosition.latitude, longitude: displayBoatPosition.longitude },
                { latitude: anchorPosition.latitude, longitude: anchorPosition.longitude },
              ]
            : [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.0001 }]}
          strokeColor={anchorPosition && displayBoatPosition && !drawingMode ? 'rgba(255,255,255,0.20)' : 'transparent'}
          strokeWidth={1}
          lineDashPattern={[8, 6]}
        />

        {/* Drawing mode preview */}
        {drawingMode && drawnPoints.length >= 2 && (
          <Polyline
            coordinates={[...drawnPoints, drawnPoints[0]]}
            strokeColor="#3b82f6"
            strokeWidth={2}
          />
        )}
        {drawingMode && drawnPoints.length >= 3 && (
          <Polygon
            coordinates={drawnPoints}
            strokeColor="#3b82f6"
            strokeWidth={2}
            fillColor="#3b82f614"
          />
        )}
        {drawingMode && drawnPoints.map((pt, i) => (
          <Marker
            key={`dp-${i}`}
            coordinate={pt}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={true}
            draggable
            onDragStart={() => { isDraggingPointRef.current = true; }}
            onDragEnd={(e) => {
              onUpdatePoint?.(i, e.nativeEvent.coordinate);
              setTimeout(() => { isDraggingPointRef.current = false; }, 150);
            }}
          >
            <View style={styles.drawPoint}>
              <Ionicons name="add" size={12} color="#fff" />
            </View>
          </Marker>
        ))}

        {/* Anchor marker — static display, dragging handled by overlay PanResponder */}
        <Marker
          identifier="anchor-marker"
          coordinate={anchorPosition ?? { latitude: 0, longitude: 0 }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={10}
          tracksViewChanges={!anchorLocked}
        >
          <Image
            source={require('../../assets/images/anchor-icon.png')}
            style={[styles.anchorIcon, (!anchorPosition || drawingMode) && { opacity: 0 }]}
            resizeMode="contain"
          />
        </Marker>

        {/* Radius drag handle — static display, dragging handled by overlay PanResponder */}
        <Marker
          identifier="radius-handle"
          coordinate={radiusHandleCoord}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={15}
          tracksViewChanges={!anchorLocked}
        >
          <View style={[
            styles.radiusHandle,
            (anchorLocked || !anchorPosition || !!customZone) && { opacity: 0 },
          ]}>
            <Ionicons name="resize-outline" size={12} color="#0a1628" />
          </View>
        </Marker>

        {/* Boat marker — always rendered, invisible when no GPS fix */}
        <Marker
          identifier="boat-marker"
          coordinate={displayBoatPosition
            ? { latitude: displayBoatPosition.latitude, longitude: displayBoatPosition.longitude }
            : { latitude: 0, longitude: 0 }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={20}
          tracksViewChanges={true}
        >
          <View style={[
            styles.boatDot,
            isDragging && !isPlayback && styles.boatDotDragging,
            isPlayback && styles.boatDotPlayback,
            !displayBoatPosition && { opacity: 0 },
          ]} />
        </Marker>
      </MapView>

      {/* Custom drag overlay — sits above map, intercepts anchor/radius drags.
          Returns false from onStartShouldSetPanResponder when touch is not near
          a draggable element, allowing map pan/zoom to work normally. */}
      {!anchorLocked && anchorPosition && !drawingMode && (
        <View
          style={StyleSheet.absoluteFillObject}
          {...dragPan.panHandlers}
        />
      )}

      {/* Unlock toast */}
      <Animated.View
        style={[styles.unlockToast, { opacity: unlockToastAnim }]}
        pointerEvents="none"
      >
        <Ionicons name="move-outline" size={14} color="#10b981" />
        <Text style={styles.unlockToastText}>Drag anchor or ring to reposition</Text>
      </Animated.View>

      {/* Map control stack — top-left, below the GPS / night-mode overlay so the
          floating bottom control card never covers it */}
      <View style={styles.leftControls} pointerEvents="box-none">
        {/* Anchor lock/unlock — also shown during the tour so it can be highlighted */}
        {(anchorPosition || tourActive) && !drawingMode && (
          <TouchableOpacity
            ref={tourRefs.lock}
            style={[styles.ctrlBtn, !anchorLocked && styles.lockBtnUnlocked]}
            onPress={() => {
              const next = !anchorLocked;
              setAnchorLocked(next);
              if (!next) showUnlockToast(); // unlocking → show hint
            }}
          >
            <Ionicons
              name={anchorLocked ? 'lock-closed-outline' : 'lock-open-outline'}
              size={18}
              color="#ffffff"
            />
          </TouchableOpacity>
        )}

        {/* Map style toggle */}
        {!drawingMode && (
          <TouchableOpacity
            ref={tourRefs.mapStyle}
            style={[styles.ctrlBtn, mapStyle === 'chart' && styles.mapStyleBtnChart]}
            onPress={() => setMapStyle(s => s === 'satellite' ? 'standard' : s === 'standard' ? 'chart' : 'satellite')}
          >
            <Ionicons
              name={mapStyle === 'satellite' ? 'map-outline' : mapStyle === 'standard' ? 'earth-outline' : 'navigate-outline'}
              size={18}
              color={mapStyle === 'chart' ? '#C9A227' : '#94a3b8'}
            />
          </TouchableOpacity>
        )}

        {/* Re-centre button */}
        {!followBoat && !drawingMode && (
          <TouchableOpacity
            style={[styles.ctrlBtn, styles.followBtn]}
            onPress={() => setFollowBoat(true)}
          >
            <Ionicons name="locate-outline" size={18} color="#C9A227" />
          </TouchableOpacity>
        )}

        {/* Playback indicator */}
        {isPlayback && !drawingMode && (
          <View style={[styles.ctrlBtn, styles.playbackBar]}>
            <Ionicons name="time-outline" size={14} color="#0a1628" />
          </View>
        )}
      </View>

      {/* Tap-to-place hint (anchor placement mode active) */}
      {onMapPress && !anchorPosition && !drawingMode && (
        <View style={[styles.hintBanner, styles.hintBannerTap]}>
          <Image
            source={require('../../assets/images/anchor-icon.png')}
            style={{ width: 16, height: 16, tintColor: '#C9A227' }}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  map: { flex: 1 },

  anchorIcon: {
    width: 40,
    height: 40,
  },

  drawPoint: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3b82f6',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  boatDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10b981',
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  boatDotDragging: {
    backgroundColor: '#ef4444',
  },
  boatDotPlayback: {
    backgroundColor: '#C9A227',
    opacity: 0.85,
  },

  // Top-left vertical stack for map controls (lock, map style, re-centre, playback)
  leftControls: {
    position: 'absolute',
    top: 112,
    left: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  ctrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f2040ee',
    borderWidth: 1,
    borderColor: '#1e3a6e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapStyleBtnChart: {
    backgroundColor: '#C9A22720',
    borderColor: '#C9A227',
  },

  ringLabel: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  ringLabelText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  ringLabelTextWatch: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  lockBtnUnlocked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },

  radiusHandle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#C9A227',
    borderWidth: 2,
    borderColor: '#0a1628',
    alignItems: 'center',
    justifyContent: 'center',
  },

  followBtn: {
    borderColor: '#C9A22766',
  },

  playbackBar: {
    backgroundColor: '#C9A227',
    borderColor: '#C9A227',
  },

  unlockToast: {
    position: 'absolute',
    top: 112,
    left: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0f2040ee',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#10b98166',
  },
  unlockToastText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },

  hintBanner: {
    position: 'absolute',
    top: 112,
    left: 56,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f2040ee',
    borderWidth: 1,
    borderColor: '#1e3a6e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintBannerTap: {
    backgroundColor: '#C9A22722',
    borderColor: '#C9A227',
  },
});
