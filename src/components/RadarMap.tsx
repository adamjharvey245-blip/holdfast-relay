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
  const latDeltaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const ringData = useMemo(() => {
    if (!anchorPosition || customZone) return { backgroundRings: [], watchLabel: '', labelMarkers: [] };

    const interval =
      latitudeDelta < 0.0008 ? 1 :
      latitudeDelta < 0.003  ? 5 :
      latitudeDelta < 0.012  ? 10 : 20;

    const allRings: number[] = [];
    for (let r = interval; r <= effectiveRadius * 2; r += interval) {
      allRings.push(r);
    }

    const watchIdx = allRings.reduce((best, r, i) =>
      Math.abs(r - effectiveRadius) < Math.abs(allRings[best] - effectiveRadius) ? i : best, 0);
    const start = Math.max(0, Math.min(watchIdx - 4, allRings.length - 10));
    const rings = allRings.slice(start, start + 10);

    const step = Math.max(1, Math.floor(rings.length / 5));
    const labelIndices = new Set<number>();
    for (let i = 0; i < rings.length && labelIndices.size < 6; i += step) {
      labelIndices.add(i);
    }

    // Background rings — exclude the watch ring
    const backgroundRings = rings.filter(r => Math.abs(r - effectiveRadius) >= interval * 0.1);

    // Label markers for background rings
    const labelMarkers: { key: string; coord: { latitude: number; longitude: number }; label: string; anchor: { x: number; y: number } }[] = [];
    rings.forEach((r, i) => {
      if (!labelIndices.has(i)) return;
      if (Math.abs(r - effectiveRadius) < interval * 0.1) return; // watch ring has its own labels
      const label = r >= 1000 ? `${(r / 1000).toFixed(1)}km` : `${r}m`;
      labelMarkers.push({
        key: `lbl-top-${r}`,
        coord: { latitude: anchorPosition.latitude + r * METRES_TO_LAT, longitude: anchorPosition.longitude },
        label,
        anchor: { x: 0.5, y: 1 },
      });
      labelMarkers.push({
        key: `lbl-bot-${r}`,
        coord: { latitude: anchorPosition.latitude - r * METRES_TO_LAT, longitude: anchorPosition.longitude },
        label,
        anchor: { x: 0.5, y: 0 },
      });
    });

    const watchLabel = effectiveRadius >= 1000
      ? `${(effectiveRadius / 1000).toFixed(1)}km`
      : `${Math.round(effectiveRadius)}m`;

    return { backgroundRings, watchLabel, labelMarkers };
  }, [anchorPosition, customZone, latitudeDelta, effectiveRadius]);

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
        onRegionChangeComplete={(r) => {
          if (latDeltaDebounceRef.current) clearTimeout(latDeltaDebounceRef.current);
          latDeltaDebounceRef.current = setTimeout(() => setLatitudeDelta(r.latitudeDelta), 500);
        }}
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

        {/* Snail trail */}
        {positionHistory.length > 1 && (
          <Polyline
            coordinates={positionHistory.map(p => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor="#00d4ff"
            strokeWidth={4}
          />
        )}

        {/* Saved custom zone polygon */}
        {customZone && customZone.length >= 3 && !drawingMode && (
          <Polygon
            coordinates={customZone}
            strokeColor={ringColor}
            strokeWidth={2}
            fillColor={ringColor + '14'}
          />
        )}

        {/* Watch radius fill */}
        {anchorPosition && !customZone && (
          <Circle
            center={anchorPosition}
            radius={effectiveRadius}
            strokeColor="transparent"
            strokeWidth={0}
            fillColor={
              alarmLevel === 'emergency' ? 'rgba(239,68,68,0.15)' :
              alarmLevel === 'alert'     ? 'rgba(249,115,22,0.15)' :
                                           'rgba(16,185,129,0.12)'
            }
          />
        )}

        {/* Background distance rings */}
        {anchorPosition && !customZone && ringData.backgroundRings.map(r => (
          <Circle
            key={`ring-${r}`}
            center={anchorPosition}
            radius={r}
            strokeColor="rgba(255,255,255,0.45)"
            strokeWidth={1}
            fillColor="transparent"
          />
        ))}

        {/* Background ring labels */}
        {anchorPosition && !customZone && ringData.labelMarkers.map(m => (
          <Marker
            key={m.key}
            identifier={m.key}
            coordinate={m.coord}
            anchor={m.anchor}
            tracksViewChanges={false}
          >
            <View style={styles.ringLabel}>
              <Text style={styles.ringLabelText}>{m.label}</Text>
            </View>
          </Marker>
        ))}

        {/* Watch boundary ring */}
        {anchorPosition && !customZone && (
          <Circle
            center={anchorPosition}
            radius={effectiveRadius}
            strokeColor="rgba(255,255,255,0.9)"
            strokeWidth={2}
            fillColor="transparent"
          />
        )}

        {/* Watch ring labels — top and bottom */}
        {anchorPosition && !customZone && (
          <Marker
            identifier="watch-label-top"
            coordinate={{ latitude: anchorPosition.latitude + effectiveRadius * METRES_TO_LAT, longitude: anchorPosition.longitude }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={styles.ringLabel}>
              <Text style={styles.ringLabelTextWatch}>{ringData.watchLabel}</Text>
            </View>
          </Marker>
        )}
        {anchorPosition && !customZone && (
          <Marker
            identifier="watch-label-bot"
            coordinate={{ latitude: anchorPosition.latitude - effectiveRadius * METRES_TO_LAT, longitude: anchorPosition.longitude }}
            anchor={{ x: 0.5, y: 0 }}
            tracksViewChanges={false}
          >
            <View style={styles.ringLabel}>
              <Text style={styles.ringLabelTextWatch}>{ringData.watchLabel}</Text>
            </View>
          </Marker>
        )}


        {/* Bearing line — dashed line from boat to anchor */}
        {anchorPosition && displayBoatPosition && !drawingMode && (
          <Polyline
            coordinates={[
              { latitude: displayBoatPosition.latitude, longitude: displayBoatPosition.longitude },
              { latitude: anchorPosition.latitude, longitude: anchorPosition.longitude },
            ]}
            strokeColor="rgba(255,255,255,0.20)"
            strokeWidth={1}
            lineDashPattern={[8, 6]}
          />
        )}

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

        {/* Anchor marker — custom icon image */}
        {anchorPosition && !drawingMode && (
          <Marker
            identifier="anchor-marker"
            coordinate={anchorPosition}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={10}
            tracksViewChanges={false}
            draggable={!anchorLocked}
            onDragEnd={(e) => setAnchorPosition(e.nativeEvent.coordinate)}
          >
            <View style={[styles.anchorContainer, !anchorLocked && styles.anchorContainerUnlocked]}>
              <Image
                source={require('../../assets/images/anchor-icon.png')}
                style={styles.anchorIcon}
                resizeMode="contain"
              />
            </View>
          </Marker>
        )}

        {/* Boat marker — simple GPS dot */}
        {displayBoatPosition && (
          <Marker
            identifier="boat-marker"
            coordinate={{
              latitude: displayBoatPosition.latitude,
              longitude: displayBoatPosition.longitude,
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={20}
            tracksViewChanges={false}
          >
            <View style={[
              styles.boatDot,
              isDragging && !isPlayback && styles.boatDotDragging,
              isPlayback && styles.boatDotPlayback,
            ]} />
          </Marker>
        )}
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
            color={anchorLocked ? '#64748b' : '#10b981'}
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

  anchorContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(10,22,40,0.7)',
    borderWidth: 2,
    borderColor: '#C9A227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchorContainerUnlocked: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16,185,129,0.2)',
  },
  anchorIcon: {
    width: 30,
    height: 30,
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
    backgroundColor: '#10b98122',
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
