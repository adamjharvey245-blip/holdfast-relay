import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, {
  Marker,
  Circle,
  Polyline,
  Polygon,
  UrlTile,
} from 'react-native-maps';
import { useAnchorStore } from '@/store/anchorStore';
import type { MapRegion } from '@/types';

interface RadarMapProps {
  onLongPress?: (coordinate: { latitude: number; longitude: number }) => void;
  onMapPress?: (coordinate: { latitude: number; longitude: number }) => void;
  drawingMode?: boolean;
  drawnPoints?: { latitude: number; longitude: number }[];
  onAddPoint?: (coordinate: { latitude: number; longitude: number }) => void;
  onUpdatePoint?: (index: number, coordinate: { latitude: number; longitude: number }) => void;
}

export function RadarMap({
  onLongPress,
  onMapPress,
  drawingMode = false,
  drawnPoints = [],
  onAddPoint,
  onUpdatePoint,
}: RadarMapProps) {
  const mapRef = useRef<MapView>(null);
  const isDraggingPointRef = useRef(false);
  const [followBoat, setFollowBoat] = useState(true);

  const [mapStyle, setMapStyle] = useState<'satellite' | 'standard' | 'chart'>('satellite');
  const [anchorLocked, setAnchorLocked] = useState(true);
  const [latitudeDelta, setLatitudeDelta] = useState(0.005);

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
    tideEnabled,
    anchorTideHeight,
    currentTideHeight,
  } = useAnchorStore();

  const effectiveRadius = tideEnabled
    ? Math.max(5, watchRadius + anchorTideHeight - currentTideHeight)
    : watchRadius;

  const displayBoatPosition =
    selectedHistoryIndex !== null
      ? positionHistory[selectedHistoryIndex] ?? boatPosition
      : boatPosition;

  const isPlayback = selectedHistoryIndex !== null;


  // ── Auto-centre on boat ──────────────────────────────────────────────────

  useEffect(() => {
    if (!followBoat || !displayBoatPosition || !mapRef.current) return;
    const region: MapRegion = {
      latitude: displayBoatPosition.latitude,
      longitude: displayBoatPosition.longitude,
      latitudeDelta: 0.002,
      longitudeDelta: 0.002,
    };
    mapRef.current.animateToRegion(region, 600);
  }, [displayBoatPosition, followBoat]);

  // ── Distance ring data — computed outside JSX, never returns null ────────

  const METRES_TO_LAT = 1 / 111320;

  // ── Fixed rings — always exactly 4 rings at 25/50/75/150% of effectiveRadius ─
  // Count NEVER changes so the native MapView children array is always stable.
  // Only the radius/color props update, which is safe in the New Architecture bridge.
  const RING_FRACTIONS = [0.25, 0.5, 0.75, 1.5];

  const ringProps = useMemo(() => {
    const center = anchorPosition ?? { latitude: 0, longitude: 0 };
    const fmt = (r: number) => r >= 1000 ? `${(r / 1000).toFixed(1)}km` : `${Math.round(r)}m`;
    return RING_FRACTIONS.map(f => {
      const r = effectiveRadius * f;
      return {
        radius: r,
        label: fmt(r),
        latTop: center.latitude + r * METRES_TO_LAT,
        latBot: center.latitude - r * METRES_TO_LAT,
        lng: center.longitude,
      };
    });
  }, [anchorPosition, effectiveRadius]);

  const watchLabel = effectiveRadius >= 1000
    ? `${(effectiveRadius / 1000).toFixed(1)}km`
    : `${Math.round(effectiveRadius)}m`;

  const anchorCenter = anchorPosition ?? { latitude: 0, longitude: 0 };

  // ── Watch radius ring colour ──────────────────────────────────────────────

  const ringColor =
    !isWatchActive ? '#C9A227' :
    alarmLevel === 'emergency' || alarmLevel === 'alert' ? '#ef4444' : '#10b981';

  // ── Map press handler ─────────────────────────────────────────────────────

  const handleMapPress = (e: any) => {
    if (isDraggingPointRef.current) return;
    const coord = e.nativeEvent.coordinate;
    if (drawingMode && onAddPoint) {
      onAddPoint(coord);
    } else if (onMapPress) {
      onMapPress(coord);
    }
  };

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        mapType={mapStyle === 'satellite' ? 'hybrid' : mapStyle === 'chart' ? 'none' : 'standard'}
        showsUserLocation={boatPosition === null}
        showsCompass={true}
        showsScale={true}
        rotateEnabled={!drawingMode}
        pitchEnabled={false}
        onPanDrag={() => setFollowBoat(false)}
        onRegionChangeComplete={(r) => setLatitudeDelta(r.latitudeDelta)}
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

        {/* Snail trail — always rendered, transparent when not enough points */}
        <Polyline
          coordinates={positionHistory.length > 1
            ? positionHistory.map(p => ({ latitude: p.latitude, longitude: p.longitude }))
            : [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.0001 }]}
          strokeColor={positionHistory.length > 1 ? '#00d4ff' : 'transparent'}
          strokeWidth={positionHistory.length > 1 ? 4 : 0}
        />

        {/* Saved custom zone polygon — always rendered, transparent when inactive */}
        <Polygon
          coordinates={customZone && customZone.length >= 3 && !drawingMode
            ? customZone
            : [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.0001 }, { latitude: 0.0001, longitude: 0 }]}
          strokeColor={customZone && customZone.length >= 3 && !drawingMode ? ringColor : 'transparent'}
          strokeWidth={customZone && customZone.length >= 3 && !drawingMode ? 2 : 0}
          fillColor={customZone && customZone.length >= 3 && !drawingMode ? ringColor + '14' : 'transparent'}
        />

        {/* Watch radius fill — always rendered, only props change (never add/remove) */}
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

        {/* Fixed 4 background rings at 25/50/75/150% — always rendered, count never changes */}
        {ringProps.map((rp, i) => (
          <Circle
            key={`fixed-ring-${i}`}
            center={anchorCenter}
            radius={anchorPosition && !customZone ? rp.radius : 1}
            strokeColor={anchorPosition && !customZone ? 'rgba(255,255,255,0.4)' : 'transparent'}
            strokeWidth={1}
            fillColor="transparent"
          />
        ))}

        {/* Watch ring labels — always rendered, content empty when no anchor */}
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

        {/* Anchor marker — always rendered, invisible when no anchor or in drawing mode */}
        <Marker
          identifier="anchor-marker"
          coordinate={anchorPosition ?? { latitude: 0, longitude: 0 }}
          anchor={{ x: 0.5, y: 0.5 }}
          zIndex={10}
          tracksViewChanges={false}
          draggable={!anchorLocked && !!anchorPosition && !drawingMode}
          onDragEnd={(e) => setAnchorPosition(e.nativeEvent.coordinate)}
        >
          <Image
            source={require('../../assets/images/anchor-icon.png')}
            style={[styles.anchorIcon, (!anchorPosition || drawingMode) && { opacity: 0 }]}
            resizeMode="contain"
          />
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

      {/* Playback indicator */}
      {isPlayback && !drawingMode && (
        <View style={styles.playbackBar}>
          <Ionicons name="time-outline" size={14} color="#0a1628" />
        </View>
      )}

      {/* Map style toggle — cycles satellite → standard → chart */}
      {!drawingMode && (
        <TouchableOpacity
          style={[styles.mapStyleBtn, mapStyle === 'chart' && styles.mapStyleBtnChart]}
          onPress={() => setMapStyle(s => s === 'satellite' ? 'standard' : s === 'standard' ? 'chart' : 'satellite')}
        >
          <Ionicons
            name={mapStyle === 'satellite' ? 'map-outline' : mapStyle === 'standard' ? 'earth-outline' : 'navigate-outline'}
            size={18}
            color={mapStyle === 'chart' ? '#C9A227' : '#94a3b8'}
          />
        </TouchableOpacity>
      )}

      {/* Anchor lock/unlock — icon only */}
      {anchorPosition && !drawingMode && (
        <TouchableOpacity
          style={[styles.lockBtn, !anchorLocked && styles.lockBtnUnlocked]}
          onPress={() => setAnchorLocked(l => !l)}
        >
          <Ionicons
            name={anchorLocked ? 'lock-closed-outline' : 'lock-open-outline'}
            size={18}
            color="#ffffff"
          />
        </TouchableOpacity>
      )}

      {/* Re-centre button */}
      {!followBoat && !drawingMode && (
        <TouchableOpacity
          style={styles.followBtn}
          onPress={() => setFollowBoat(true)}
        >
          <Ionicons name="locate-outline" size={18} color="#C9A227" />
        </TouchableOpacity>
      )}

      {/* Tap-to-place hint */}
      {onMapPress && !anchorPosition && !drawingMode && (
        <View style={[styles.hintBanner, styles.hintBannerTap]}>
          <Ionicons name="anchor" size={14} color="#C9A227" />
        </View>
      )}

      {/* Long-press hint */}
      {!anchorPosition && !onMapPress && !drawingMode && (
        <View style={styles.hintBanner}>
          <Ionicons name="finger-print-outline" size={14} color="#64748b" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  map: { flex: 1 },

  markerShadow: {
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

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

  // Simple GPS dot for boat
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

  // Small icon-only map overlay buttons
  mapStyleBtn: {
    position: 'absolute',
    bottom: 48,
    left: 12,
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
  },

  lockBtn: {
    position: 'absolute',
    bottom: 92,
    left: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f2040ee',
    borderWidth: 1,
    borderColor: '#1e3a6e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBtnUnlocked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },

  followBtn: {
    position: 'absolute',
    bottom: 48,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f2040ee',
    borderWidth: 1,
    borderColor: '#C9A22766',
    alignItems: 'center',
    justifyContent: 'center',
  },

  playbackBar: {
    position: 'absolute',
    bottom: 48,
    left: 56,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C9A227',
    alignItems: 'center',
    justifyContent: 'center',
  },

  hintBanner: {
    position: 'absolute',
    bottom: 12,
    left: 12,
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
