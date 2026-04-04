import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Animated } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RadarMap } from '@/components/RadarMap';
import { TimeSlider } from '@/components/TimeSlider';
import { RadiusControl } from '@/components/RadiusControl';
import { AppTour } from '@/components/AppTour';
import { useAnchorStore } from '@/store/anchorStore';
import { useTideData } from '@/hooks/useTideData';
import { offsetCoordinate, bearingDegrees } from '@/utils/haversine';
import { TOUR_KEY } from './onboarding';

type Panel = 'none' | 'radius' | 'playback' | 'relativeAnchor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bearingToCardinal(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

// ─── GPS Signal Strength Bar ──────────────────────────────────────────────────

function GpsStrengthBar({ accuracy, status, lastFix }: { accuracy: number | null; status: string; lastFix: number | null }) {
  const bars =
    status === 'searching' ? 0 :
    status === 'lost' ? 0 :
    accuracy === null ? 1 :
    accuracy < 5 ? 5 :
    accuracy < 10 ? 4 :
    accuracy < 20 ? 3 :
    accuracy < 50 ? 2 : 1;

  const color =
    status === 'lost' ? '#ef4444' :
    bars >= 4 ? '#10b981' :
    bars >= 2 ? '#C9A227' : '#64748b';

  const label =
    status === 'searching' ? 'SEARCHING' :
    status === 'lost' ? 'GPS LOST' :
    accuracy !== null ? `±${Math.round(accuracy)}m` : 'GPS OK';

  const fixTime = lastFix
    ? new Date(lastFix).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <View style={sStyles.container}>
      <View style={sStyles.topRow}>
        <View style={sStyles.bars}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View
              key={i}
              style={[sStyles.bar, { height: 4 + i * 3 }, { backgroundColor: i <= bars ? color : '#1e3a6e' }]}
            />
          ))}
        </View>
        <Text style={[sStyles.label, { color }]}>{label}</Text>
      </View>
      {fixTime && (
        <Text style={sStyles.fixTime}>LAST FIX {fixTime}</Text>
      )}
    </View>
  );
}

const sStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0a1628cc', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 6,
    borderWidth: 1, borderColor: '#1e3a6e', gap: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 20 },
  bar: { width: 4, borderRadius: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  fixTime: { fontSize: 9, color: '#475569', fontFamily: 'monospace', letterSpacing: 0.3 },
});

// ─── Relative Anchor Panel ────────────────────────────────────────────────────

function RelativeAnchorPanel({
  bearing, distance,
  onBearingChange, onDistanceChange,
  onDrop, onCancel,
}: {
  bearing: number; distance: number;
  onBearingChange: (b: number) => void;
  onDistanceChange: (d: number) => void;
  onDrop: () => void;
  onCancel: () => void;
}) {
  const cardinal = bearingToCardinal(bearing);
  const rotateBearing = (delta: number) =>
    onBearingChange(((bearing + delta) % 360 + 360) % 360);

  // ── Compass ──────────────────────────────────────────────────────────────
  const [compassActive, setCompassActive] = useState(false);
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const headingSubRef = useRef<Location.LocationSubscription | null>(null);

  const startCompass = async () => {
    try {
      headingSubRef.current = await Location.watchHeadingAsync((heading) => {
        // Use true heading if available (>= 0), fall back to magnetic
        const h = heading.trueHeading >= 0 ? heading.trueHeading : heading.magHeading;
        const rounded = Math.round(h);
        setCompassHeading(rounded);
        onBearingChange(rounded);
      });
      setCompassActive(true);
    } catch (e) {
      console.warn('[Compass] Failed to start heading watch:', e);
    }
  };

  const stopCompass = () => {
    headingSubRef.current?.remove();
    headingSubRef.current = null;
    setCompassActive(false);
    setCompassHeading(null);
  };

  // Stop compass when panel unmounts
  useEffect(() => () => { stopCompass(); }, []);

  const toggleCompass = () => {
    if (compassActive) stopCompass();
    else startCompass();
  };

  return (
    <View style={rStyles.container}>
      <Text style={rStyles.heading}>RELATIVE POSITION</Text>

      <View style={rStyles.summary}>
        <Text style={rStyles.summaryMain}>{distance}m {cardinal}</Text>
        <Text style={rStyles.summaryBearing}>{bearing}° — from your GPS position</Text>
      </View>

      <View style={rStyles.labelRow}>
        <Text style={rStyles.label}>BEARING</Text>
        <TouchableOpacity
          style={[rStyles.compassBtn, compassActive && rStyles.compassBtnActive]}
          onPress={toggleCompass}
        >
          <Ionicons name="compass-outline" size={14} color={compassActive ? '#0a1628' : '#C9A227'} />
          <Text style={[rStyles.compassBtnText, compassActive && rStyles.compassBtnTextActive]}>
            {compassActive ? `LIVE ${compassHeading ?? '—'}°` : 'USE COMPASS'}
          </Text>
        </TouchableOpacity>
      </View>

      {compassActive && (
        <View style={rStyles.compassHint}>
          <Ionicons name="information-circle-outline" size={13} color="#475569" />
          <Text style={rStyles.compassHintText}>
            Point your phone toward the anchor. Bearing updates live. Tap USE COMPASS again to lock.
          </Text>
        </View>
      )}

      <View style={rStyles.row}>
        <TouchableOpacity style={rStyles.btn} onPress={() => { stopCompass(); rotateBearing(-45); }}>
          <Text style={rStyles.btnText}>-45°</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rStyles.btn} onPress={() => { stopCompass(); rotateBearing(-10); }}>
          <Text style={rStyles.btnText}>-10°</Text>
        </TouchableOpacity>
        <View style={rStyles.valueBox}>
          <Text style={rStyles.valueMain}>{cardinal}</Text>
          <Text style={rStyles.valueSub}>{bearing}°</Text>
        </View>
        <TouchableOpacity style={rStyles.btn} onPress={() => { stopCompass(); rotateBearing(10); }}>
          <Text style={rStyles.btnText}>+10°</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rStyles.btn} onPress={() => { stopCompass(); rotateBearing(45); }}>
          <Text style={rStyles.btnText}>+45°</Text>
        </TouchableOpacity>
      </View>

      <Text style={rStyles.label}>DISTANCE</Text>
      <View style={rStyles.row}>
        <TouchableOpacity style={rStyles.btn} onPress={() => onDistanceChange(Math.max(5, distance - 10))}>
          <Text style={rStyles.btnText}>-10m</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rStyles.btn} onPress={() => onDistanceChange(Math.max(5, distance - 1))}>
          <Text style={rStyles.btnText}>-1m</Text>
        </TouchableOpacity>
        <View style={rStyles.valueBox}>
          <Text style={rStyles.valueMain}>{distance}</Text>
          <Text style={rStyles.valueSub}>metres</Text>
        </View>
        <TouchableOpacity style={rStyles.btn} onPress={() => onDistanceChange(Math.min(500, distance + 1))}>
          <Text style={rStyles.btnText}>+1m</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rStyles.btn} onPress={() => onDistanceChange(Math.min(500, distance + 10))}>
          <Text style={rStyles.btnText}>+10m</Text>
        </TouchableOpacity>
      </View>

      <View style={rStyles.actions}>
        <TouchableOpacity style={rStyles.cancelBtn} onPress={() => { stopCompass(); onCancel(); }}>
          <Text style={rStyles.cancelText}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rStyles.dropBtn} onPress={() => { stopCompass(); onDrop(); }}>
          <Text style={rStyles.dropText}>DROP ANCHOR HERE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const rStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0f2040', borderRadius: 12, padding: 14,
    marginHorizontal: 16, borderWidth: 1, borderColor: '#1e3a6e', gap: 10,
  },
  heading: { color: '#C9A227', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  summary: {
    backgroundColor: '#162d57', borderRadius: 10, padding: 12,
    alignItems: 'center',
  },
  summaryMain: { color: '#f1f5f9', fontSize: 22, fontWeight: '700' },
  summaryBearing: { color: '#64748b', fontSize: 12, marginTop: 2 },
  label: { color: '#475569', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compassBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: '#C9A22766', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  compassBtnActive: { backgroundColor: '#C9A227', borderColor: '#C9A227' },
  compassBtnText: { color: '#C9A227', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  compassBtnTextActive: { color: '#0a1628' },
  compassHint: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#162d57', borderRadius: 8, padding: 8,
  },
  compassHintText: { color: '#475569', fontSize: 11, lineHeight: 16, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#162d57', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1e3a6e',
  },
  btnText: { color: '#f1f5f9', fontSize: 11, fontWeight: '700' },
  valueBox: { minWidth: 70, alignItems: 'center' },
  valueMain: { color: '#C9A227', fontSize: 26, fontWeight: '700' },
  valueSub: { color: '#64748b', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#334155', alignItems: 'center',
  },
  cancelText: { color: '#64748b', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  dropBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 8,
    backgroundColor: '#C9A227', alignItems: 'center',
  },
  dropText: { color: '#0a1628', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  useTideData();

  const router = useRouter();
  const [activePanel, setActivePanel] = useState<Panel>('none');
  const [showDropMenu, setShowDropMenu] = useState(false);
  const [tapToPlace, setTapToPlace] = useState(false);
  const [relativeBearing, setRelativeBearing] = useState(0);
  const [relativeDistance, setRelativeDistance] = useState(25);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState<{ latitude: number; longitude: number }[]>([]);
  const [nightMode, setNightMode] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [trackToast, setTrackToast] = useState<'paused' | 'recording' | null>(null);
  const trackToastAnim = useRef(new Animated.Value(0)).current;
  const trackToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTrackToast = (state: 'paused' | 'recording') => {
    if (trackToastTimer.current) clearTimeout(trackToastTimer.current);
    setTrackToast(state);
    trackToastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(trackToastAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(trackToastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setTrackToast(null));
  };

  const handleTrackPause = () => {
    const next = !isTrackingPaused;
    setTrackingPaused(next);
    showTrackToast(next ? 'paused' : 'recording');
  };

  useEffect(() => {
    AsyncStorage.getItem(TOUR_KEY).then((done) => {
      if (!done) setShowTour(true);
    });
  }, []);

  const handleTourDone = async () => {
    await AsyncStorage.setItem(TOUR_KEY, 'true');
    setShowTour(false);
  };

  const {
    anchorPosition,
    boatPosition,
    isWatchActive,
    isTrackingPaused,
    gpsStatus,
    gpsAccuracy,
    alarmLevel,
    gpsCancelledAt,
    draggingCancelledAt,
    currentDistance,
    watchRadius,
    tideEnabled,
    anchorTideHeight,
    currentTideHeight,
    alarmThresholds,
    setAnchorPosition,
    clearAnchor,
    setWatchActive,
    setTrackingPaused,
    setCustomZone,
    cancelAlarm,
    setSelectedHistoryIndex,
  } = useAnchorStore();

  // Pulse animation for emergency banner — declared after alarmLevel is available
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (alarmLevel === 'emergency') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.7, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [alarmLevel]);

  // Determine which cancel timestamp applies to the current alarm
  const isGpsAlarm = alarmLevel === 'emergency' && gpsStatus === 'lost';
  const activeCancelledAt = isGpsAlarm ? gpsCancelledAt : draggingCancelledAt;
  const cooldownMs = (alarmThresholds.alarmCooldownSecs ?? 120) * 1000;
  const isCancelled = activeCancelledAt !== null && Date.now() < activeCancelledAt + cooldownMs;
  const cancelSecsLeft = activeCancelledAt !== null
    ? Math.max(0, Math.round((activeCancelledAt + cooldownMs - Date.now()) / 1000))
    : 0;

  // distText needed before JSX, also used in alarm banner
  const distText = currentDistance < 1000
    ? `${Math.round(currentDistance)}m`
    : `${(currentDistance / 1000).toFixed(2)}km`;

  const currentBearing = anchorPosition && boatPosition
    ? bearingDegrees(boatPosition.latitude, boatPosition.longitude, anchorPosition.latitude, anchorPosition.longitude)
    : 0;

  const effectiveRadius = tideEnabled
    ? Math.max(5, watchRadius + anchorTideHeight - currentTideHeight)
    : watchRadius;

  const dropAnchor = (coord: { latitude: number; longitude: number }) => {
    setAnchorPosition(coord);
    setWatchActive(true);
    setShowDropMenu(false);
    setTapToPlace(false);
    setActivePanel('none');
  };

  const handleDropAtGps = () => {
    if (!boatPosition) {
      Alert.alert('No GPS Fix', 'Waiting for a GPS signal. Try again in a moment.');
      return;
    }
    dropAnchor({ latitude: boatPosition.latitude, longitude: boatPosition.longitude });
  };

  const handleDropRelative = () => {
    if (!boatPosition) {
      Alert.alert('No GPS Fix', 'Waiting for a GPS signal. Try again in a moment.');
      return;
    }
    const bearingRad = (relativeBearing * Math.PI) / 180;
    const coord = offsetCoordinate(
      boatPosition.latitude,
      boatPosition.longitude,
      relativeDistance * Math.cos(bearingRad),
      relativeDistance * Math.sin(bearingRad),
    );
    dropAnchor(coord);
  };

  const handleMapTapPlace = (coord: { latitude: number; longitude: number }) => {
    dropAnchor(coord);
  };

  const handleMapLongPress = (coord: { latitude: number; longitude: number }) => {
    Alert.alert(
      'Drop Anchor Here?',
      `${coord.latitude.toFixed(5)}, ${coord.longitude.toFixed(5)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Drop Anchor', onPress: () => dropAnchor(coord) },
      ]
    );
  };

  const handleLiftAnchor = () => {
    Alert.alert('Lift Anchor?', 'Clear anchor and stop monitoring?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Lift Anchor', style: 'destructive',
        onPress: () => { clearAnchor(); setActivePanel('none'); },
      },
    ]);
  };

  const togglePanel = (panel: Panel) =>
    setActivePanel((prev) => (prev === panel ? 'none' : panel));

  const handleStartDrawing = () => {
    setDrawnPoints([]);
    setActivePanel('none');
    setIsDrawingZone(true);
  };

  const handleAddPoint = (coord: { latitude: number; longitude: number }) => {
    setDrawnPoints((prev) => [...prev, coord]);
  };

  const handleDrawDone = () => {
    if (drawnPoints.length >= 3) {
      setCustomZone(drawnPoints);
    }
    setIsDrawingZone(false);
    setDrawnPoints([]);
  };

  const handleDrawCancel = () => {
    setIsDrawingZone(false);
    setDrawnPoints([]);
  };

  const handleDrawUndo = () => {
    setDrawnPoints((prev) => prev.slice(0, -1));
  };

  const handleUpdatePoint = (index: number, coord: { latitude: number; longitude: number }) => {
    setDrawnPoints((prev) => prev.map((p, i) => (i === index ? coord : p)));
  };

  // Exit playback whenever any other panel is opened or panel is closed
  useEffect(() => {
    if (activePanel !== 'playback') {
      setSelectedHistoryIndex(null);
    }
  }, [activePanel]);

  const alarmColor =
    alarmLevel === 'emergency' ? '#ef4444' :
    alarmLevel === 'alert' ? '#ef4444' : '#10b981';

  return (
    <View style={[styles.container, nightMode && styles.nightContainer]}>

      {/* Night mode dim overlay */}
      {nightMode && <View style={styles.nightOverlay} pointerEvents="none" />}

      {/* MAP */}
      <View style={styles.mapContainer}>
        <RadarMap
          onLongPress={handleMapLongPress}
          onMapPress={tapToPlace ? handleMapTapPlace : undefined}
          drawingMode={isDrawingZone}
          drawnPoints={drawnPoints}
          onAddPoint={handleAddPoint}
          onUpdatePoint={handleUpdatePoint}
        />

        {/* Top-left: GPS signal strength + night mode toggle */}
        <View style={styles.gpsOverlay}>
          <GpsStrengthBar accuracy={gpsAccuracy} status={gpsStatus} lastFix={boatPosition?.timestamp ?? null} />
          <TouchableOpacity
            style={[styles.nightModeBtn, nightMode && styles.nightModeBtnActive]}
            onPress={() => setNightMode(n => !n)}
          >
            <Ionicons
              name={nightMode ? 'moon' : 'moon-outline'}
              size={14}
              color={nightMode ? '#C9A227' : '#64748b'}
            />
          </TouchableOpacity>
        </View>

        {/* Top-right: drop button (hidden once anchor is placed, hidden in drawing mode) */}
        {!anchorPosition && !isDrawingZone && (
          <TouchableOpacity
            style={styles.dropBtn}
            onPress={() => { setTapToPlace(false); setShowDropMenu(true); }}
          >
            <Ionicons name="anchor" size={14} color="#0a1628" />
            <Text style={styles.dropBtnText}>DROP ANCHOR</Text>
          </TouchableOpacity>
        )}

        {/* Lift anchor — shown in top-right once anchor is placed, hidden in drawing mode */}
        {anchorPosition && !isDrawingZone && (
          <TouchableOpacity style={styles.liftBtn} onPress={handleLiftAnchor}>
            <Ionicons name="arrow-up-circle-outline" size={14} color="#ef4444" />
            <Text style={styles.liftBtnText}>LIFT ANCHOR</Text>
          </TouchableOpacity>
        )}

        {/* Drop menu overlay */}
        {showDropMenu && (
          <View style={StyleSheet.absoluteFillObject}>
            <TouchableOpacity
              style={[StyleSheet.absoluteFillObject, styles.menuBackdrop]}
              onPress={() => setShowDropMenu(false)}
            />
            <View style={styles.dropMenuCard}>
              <Text style={styles.dropMenuHeading}>HOW TO DROP ANCHOR</Text>

              <TouchableOpacity style={styles.dropOption} onPress={handleDropAtGps}>
                <Text style={styles.dropOptionTitle}>CURRENT GPS POSITION</Text>
                <Text style={styles.dropOptionSub}>Drop anchor at your current location</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropOption}
                onPress={() => { setShowDropMenu(false); setActivePanel('relativeAnchor'); }}
              >
                <Text style={styles.dropOptionTitle}>RELATIVE POSITION</Text>
                <Text style={styles.dropOptionSub}>
                  Anchor is X metres in a given direction from you
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dropOption}
                onPress={() => { setShowDropMenu(false); setTapToPlace(true); }}
              >
                <Text style={styles.dropOptionTitle}>CHOOSE ON MAP</Text>
                <Text style={styles.dropOptionSub}>Press and hold the map to place the anchor</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        {/* Drawing zone overlay */}
        {isDrawingZone && (
          <View style={styles.drawingOverlay}>
            <View>
              <Text style={styles.drawingTitle}>DRAWING ZONE</Text>
              <Text style={styles.drawingHint}>
                {drawnPoints.length === 0
                  ? 'Tap map to add points'
                  : drawnPoints.length < 3
                  ? `${drawnPoints.length} point${drawnPoints.length > 1 ? 's' : ''} — need at least 3`
                  : `${drawnPoints.length} points — tap DONE to save`}
              </Text>
            </View>
            <View style={styles.drawingActions}>
              <TouchableOpacity
                style={[styles.drawActionBtn, drawnPoints.length === 0 && styles.drawActionBtnDisabled]}
                onPress={handleDrawUndo}
                disabled={drawnPoints.length === 0}
              >
                <Text style={[styles.drawActionText, drawnPoints.length === 0 && styles.drawActionTextDisabled]}>UNDO</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawActionBtn, styles.drawCancelBtn]}
                onPress={handleDrawCancel}
              >
                <Text style={[styles.drawActionText, styles.drawCancelText]}>CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.drawActionBtn, styles.drawDoneBtn, drawnPoints.length < 3 && styles.drawActionBtnDisabled]}
                onPress={handleDrawDone}
                disabled={drawnPoints.length < 3}
              >
                <Text style={[styles.drawActionText, styles.drawDoneText, drawnPoints.length < 3 && styles.drawActionTextDisabled]}>DONE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* In-app alarm banner — alert and emergency only */}
      {isWatchActive && anchorPosition && (alarmLevel === 'alert' || alarmLevel === 'emergency') && (
        <Animated.View
          style={[
            styles.alarmBanner,
            alarmLevel === 'emergency' ? styles.alarmBannerEmergency : styles.alarmBannerAlert,
            isCancelled && styles.alarmBannerMuted,
            alarmLevel === 'emergency' && { opacity: pulseAnim },
          ]}
        >
          <View style={styles.alarmBannerTop}>
            <Ionicons
              name={alarmLevel === 'emergency' ? 'warning' : 'alert-circle'}
              size={22}
              color="#fff"
            />
            <Text style={styles.alarmBannerText}>
              {alarmLevel === 'emergency' && gpsStatus === 'lost'
                ? 'GPS LOST — ANCHOR POSITION UNKNOWN'
                : alarmLevel === 'emergency'
                ? `EMERGENCY — ${distText} FROM ANCHOR`
                : `DRAGGING — ${distText} · ${bearingToCardinal(currentBearing)}`}
            </Text>
          </View>
          {isCancelled ? (
            <Text style={styles.alarmSilencedText}>
              {cancelSecsLeft > 60
                ? `SILENCED — ${Math.ceil(cancelSecsLeft / 60)}m remaining`
                : `SILENCED — ${cancelSecsLeft}s remaining`}
            </Text>
          ) : (
            <TouchableOpacity
              style={styles.alarmSilenceBtn}
              onPress={cancelAlarm}
              activeOpacity={0.7}
            >
              <Ionicons name="volume-mute" size={18} color={alarmLevel === 'emergency' ? '#ef4444' : '#f97316'} />
              <Text style={[
                styles.alarmSilenceBtnText,
                { color: alarmLevel === 'emergency' ? '#ef4444' : '#f97316' }
              ]}>SILENCE ALARM</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* BOTTOM CONTROLS — hidden in drawing mode */}
      {!isDrawingZone && <View style={styles.bottomBar}>

        {/* Watch toggle — full width hero button when anchor is placed */}
        {anchorPosition && (
          <View style={styles.watchRow}>
            <TouchableOpacity
              style={[
                styles.watchToggle,
                isWatchActive
                  ? (alarmLevel !== 'silent' ? styles.watchOnAlarm : styles.watchOn)
                  : styles.watchOff,
              ]}
              onPress={() => setWatchActive(!isWatchActive)}
            >
              {isWatchActive && anchorPosition && boatPosition ? (
                <>
                  <Text style={styles.watchHeroNum}>{distText}</Text>
                  <Text style={styles.watchHeroBearing}>{bearingToCardinal(currentBearing)}  {Math.round(currentBearing)}°</Text>
                  <Text style={styles.watchHeroSub}>WATCH ACTIVE · tap to disable</Text>
                </>
              ) : (
                <>
                  <Text style={styles.watchToggleText}>
                    {isWatchActive ? 'ANCHOR WATCH ACTIVE' : 'ANCHOR WATCH OFF'}
                  </Text>
                  <Text style={styles.watchToggleSub}>
                    {isWatchActive ? 'waiting for GPS…' : 'tap to enable alarm'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {/* Track pause — small icon + label button */}
            <TouchableOpacity
              style={[styles.trackPauseBtn, isTrackingPaused && styles.trackPauseBtnPaused]}
              onPress={handleTrackPause}
            >
              <Ionicons
                name={isTrackingPaused ? 'play-outline' : 'pause-outline'}
                size={18}
                color={isTrackingPaused ? '#ef4444' : '#475569'}
              />
              <Text style={[styles.trackPauseLabel, isTrackingPaused && styles.trackPauseLabelPaused]}>
                {isTrackingPaused ? 'PAUSED' : 'REC'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tool buttons */}
        <View style={styles.toolRow}>
          <TouchableOpacity
            style={[styles.toolBtn, activePanel === 'radius' && styles.toolBtnActive]}
            onPress={() => togglePanel('radius')}
          >
            <Ionicons
              name="radio-button-on-outline"
              size={20}
              color={activePanel === 'radius' ? '#C9A227' : '#64748b'}
            />
            <Text style={[styles.toolLabel, activePanel === 'radius' && styles.toolLabelActive]}>RADIUS</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toolBtn, activePanel === 'playback' && styles.toolBtnActive]}
            onPress={() => togglePanel('playback')}
          >
            <Ionicons
              name="time-outline"
              size={20}
              color={activePanel === 'playback' ? '#C9A227' : '#64748b'}
            />
            <Text style={[styles.toolLabel, activePanel === 'playback' && styles.toolLabelActive]}>HISTORY</Text>
          </TouchableOpacity>


          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => router.push('/settings')}
          >
            <Ionicons name="settings-outline" size={20} color="#64748b" />
            <Text style={styles.toolLabel}>SETTINGS</Text>
          </TouchableOpacity>
        </View>

        {activePanel === 'radius' && <RadiusControl onDrawZone={handleStartDrawing} />}
        {activePanel === 'playback' && <TimeSlider />}
        {activePanel === 'relativeAnchor' && (
          <RelativeAnchorPanel
            bearing={relativeBearing}
            distance={relativeDistance}
            onBearingChange={setRelativeBearing}
            onDistanceChange={setRelativeDistance}
            onDrop={handleDropRelative}
            onCancel={() => setActivePanel('none')}
          />
        )}
      </View>}

      {/* Track pause toast */}
      {trackToast !== null && (
        <Animated.View
          style={[styles.trackToast, { opacity: trackToastAnim }]}
          pointerEvents="none"
        >
          <Ionicons
            name={trackToast === 'paused' ? 'pause-circle' : 'ellipse'}
            size={16}
            color={trackToast === 'paused' ? '#ef4444' : '#10b981'}
          />
          <Text style={styles.trackToastText}>
            {trackToast === 'paused'
              ? 'Track recording paused — GPS history not saved'
              : 'Track recording resumed'}
          </Text>
        </Animated.View>
      )}

      {/* App tour overlay — shown once after first launch */}
      <AppTour visible={showTour} onDone={handleTourDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#04080f' },
  mapContainer: { flex: 1, position: 'relative' },

  // Night mode
  nightContainer: {},
  nightOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000000',
    opacity: 0.45,
    zIndex: 999,
  },

  // GPS badge — top left
  gpsOverlay: { position: 'absolute', top: 12, left: 12, gap: 6 },

  nightModeBtn: {
    backgroundColor: '#0a1628cc',
    borderRadius: 8, borderWidth: 1, borderColor: '#1e3a6e',
    paddingHorizontal: 8, paddingVertical: 5,
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start',
  },
  nightModeBtnActive: {
    backgroundColor: '#C9A22720', borderColor: '#C9A227',
  },

  // Drop anchor button — top right, below map compass
  dropBtn: {
    position: 'absolute', top: 56, right: 12,
    backgroundColor: '#C9A227', borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  dropBtnText: { color: '#0a1628', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  // Lift anchor — top right, replaces drop button when anchor is placed
  liftBtn: {
    position: 'absolute', top: 56, right: 12,
    backgroundColor: '#1a0505cc', borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
    borderWidth: 1, borderColor: '#ef444477',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  liftBtnText: { color: '#ef4444', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  // Drop anchor menu
  menuBackdrop: { backgroundColor: '#04080fbb' },
  dropMenuCard: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0a1628',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#1e3a6e',
    padding: 20, gap: 12,
  },
  dropMenuHeading: {
    color: '#475569', fontSize: 11, fontWeight: '700',
    letterSpacing: 2, marginBottom: 4,
  },
  dropOption: {
    backgroundColor: '#0f2040', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#1e3a6e', gap: 4,
  },
  dropOptionTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  dropOptionSub: { color: '#64748b', fontSize: 12 },

  // Bottom bar
  bottomBar: {
    backgroundColor: '#04080f', borderTopWidth: 1, borderTopColor: '#1a2d4a',
    paddingTop: 10, paddingBottom: 8, gap: 8,
  },
  watchRow: { flexDirection: 'row', marginHorizontal: 16, gap: 8, alignItems: 'stretch' },
  watchToggle: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  watchOn: { backgroundColor: '#10b981' },
  watchOff: { backgroundColor: '#0f2040', borderWidth: 1, borderColor: '#1e3a6e' },
  watchToggleText: { color: '#f1f5f9', fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  watchToggleSub: { color: '#f1f5f9aa', fontSize: 10, marginTop: 3, letterSpacing: 0.5 },
  trackPauseBtn: {
    width: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f2040',
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  trackPauseBtnPaused: { borderColor: '#ef444466', backgroundColor: '#ef444411' },
  trackPauseLabel: {
    color: '#475569',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  trackPauseLabelPaused: { color: '#ef4444' },
  trackToast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0f2040ee',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  trackToastText: {
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: '600',
  },

  // In-app alarm banner — large format for night legibility
  alarmBanner: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  alarmBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alarmBannerEmergency: { backgroundColor: '#ef4444' },
  alarmBannerAlert: { backgroundColor: '#f97316' },
  alarmBannerMuted: { opacity: 0.55 },
  alarmBannerText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Full-width silence button — large target for night/stressed use
  alarmSilenceBtn: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  alarmSilenceBtnText: { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  alarmSilencedText: {
    color: '#ffffffcc',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Drawing zone overlay
  drawingOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: '#0a1628ee',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3b82f6',
    padding: 12,
    gap: 10,
  },
  drawingTitle: { color: '#3b82f6', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  drawingHint: { color: '#64748b', fontSize: 12, marginTop: 2 },
  drawingActions: { flexDirection: 'row', gap: 8 },
  drawActionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#162d57',
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  drawActionBtnDisabled: { opacity: 0.35 },
  drawActionText: { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  drawActionTextDisabled: { color: '#475569' },
  drawCancelBtn: { borderColor: '#334155' },
  drawCancelText: { color: '#64748b' },
  drawDoneBtn: { flex: 2, backgroundColor: '#162d57', borderColor: '#3b82f6' },
  drawDoneText: { color: '#3b82f6' },

  toolRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 6 },
  toolBtn: {
    flex: 1, backgroundColor: '#0a1628', borderRadius: 10,
    paddingVertical: 9, alignItems: 'center',
    borderWidth: 1, borderColor: '#1a2d4a', gap: 4,
  },
  toolBtnActive: { borderColor: '#C9A22766', backgroundColor: '#C9A22710' },
  toolLabel: { color: '#475569', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  toolLabelActive: { color: '#C9A227' },

  // Watch toggle alarm states
  watchOnAlarm: { backgroundColor: '#ef4444' },

  // Hero distance/bearing display inside watch toggle
  watchHeroNum: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 44,
  },
  watchHeroBearing: {
    color: '#FFFFFFCC',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    marginTop: -2,
  },
  watchHeroSub: {
    color: '#FFFFFFAA',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 6,
  },
});
