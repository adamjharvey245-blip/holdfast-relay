import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity, Alert, Animated, Modal, TextInput, KeyboardAvoidingView, ScrollView } from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RadarMap } from '@/components/RadarMap';
import { TimeSlider } from '@/components/TimeSlider';
import { RadiusControl } from '@/components/RadiusControl';
import { AppTour } from '@/components/AppTour';
import { tourRefs } from '@/components/tourTargets';
import { useAnchorStore } from '@/store/anchorStore';
import { useTideData } from '@/hooks/useTideData';
import { useReviewPrompt } from '@/hooks/useReviewPrompt';
import { useSilentModeWarning } from '@/hooks/useSilentModeWarning';
import { useCriticalAlertsNudge } from '@/hooks/useCriticalAlertsNudge';
import { offsetCoordinate, bearingDegrees } from '@/utils/haversine';
import { TOUR_KEY } from './onboarding';

type Panel = 'none' | 'radius' | 'playback' | 'relativeAnchor' | 'coordInput';

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
    status === 'degraded' ? '#f97316' :
    bars >= 4 ? '#10b981' :
    bars >= 2 ? '#C9A227' : '#64748b';

  // 'degraded' = fix accuracy is too poor to drive the alarm (see utils/alarmLevel.ts)
  const label =
    status === 'searching' ? 'SEARCHING' :
    status === 'lost' ? 'GPS LOST' :
    status === 'degraded' ? `±${Math.round(accuracy ?? 0)}m · LOW ACCURACY` :
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
    backgroundColor: '#0a1628d9', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: '#1e3a6e', gap: 3,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 20 },
  bar: { width: 4, borderRadius: 1 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  fixTime: { fontSize: 9, color: '#ffffff', fontFamily: 'monospace', letterSpacing: 0.3 },
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
  const { isPremium } = useAnchorStore();
  const router = useRouter();

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
          style={[rStyles.compassBtn, compassActive && rStyles.compassBtnActive, !isPremium && rStyles.compassBtnLocked]}
          onPress={isPremium ? toggleCompass : () => Alert.alert(
            'Live Compass Bearing',
            'Point your phone toward the anchor and the bearing updates live — tap again to lock it in.',
            [{ text: 'Not now', style: 'cancel' }, { text: 'Go Premium', onPress: () => router.push('/upgrade') }]
          )}
        >
          <Ionicons
            name={isPremium ? 'compass-outline' : 'lock-closed-outline'}
            size={14}
            color={compassActive ? '#0a1628' : '#C9A227'}
          />
          <Text style={[rStyles.compassBtnText, compassActive && rStyles.compassBtnTextActive]}>
            {!isPremium ? 'COMPASS — PREMIUM' : compassActive ? `LIVE ${compassHeading ?? '—'}°` : 'USE COMPASS'}
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
    backgroundColor: '#0f2040', borderRadius: 16, padding: 14,
    marginHorizontal: 16, borderWidth: 1, borderColor: '#1e3a6e', gap: 10,
  },
  heading: { color: '#C9A227', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  summary: {
    backgroundColor: '#162d57', borderRadius: 10, padding: 12,
    alignItems: 'center',
  },
  summaryMain: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  summaryBearing: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  label: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compassBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: '#C9A22766', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  compassBtnActive: { backgroundColor: '#C9A227', borderColor: '#C9A227' },
  compassBtnLocked: { borderColor: '#475569', opacity: 0.7 },
  compassBtnText: { color: '#C9A227', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  compassBtnTextActive: { color: '#0a1628' },
  compassHint: {
    flexDirection: 'row', gap: 6, alignItems: 'flex-start',
    backgroundColor: '#162d57', borderRadius: 8, padding: 8,
  },
  compassHintText: { color: '#94a3b8', fontSize: 11, lineHeight: 16, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#162d57', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#1e3a6e',
  },
  btnText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  valueBox: { minWidth: 70, alignItems: 'center' },
  valueMain: { color: '#C9A227', fontSize: 26, fontWeight: '700' },
  valueSub: { color: '#94a3b8', fontSize: 11 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#334155', alignItems: 'center',
  },
  cancelText: { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  dropBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 8,
    backgroundColor: '#C9A227', alignItems: 'center',
  },
  dropText: { color: '#0a1628', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
});

// ─── Coordinate Input Panel ───────────────────────────────────────────────────

function CoordinateInputPanel({
  onDrop,
  onCancel,
}: {
  onDrop: (coord: { latitude: number; longitude: number }) => void;
  onCancel: () => void;
}) {
  const [latDeg, setLatDeg] = useState('');
  const [latMin, setLatMin] = useState('');
  const [latHem, setLatHem] = useState<'N' | 'S'>('S');
  const [lonDeg, setLonDeg] = useState('');
  const [lonMin, setLonMin] = useState('');
  const [lonHem, setLonHem] = useState<'E' | 'W'>('E');
  const [error, setError] = useState<string | null>(null);

  const handleDrop = () => {
    const ld = parseFloat(latDeg);
    const lm = parseFloat(latMin);
    const lod = parseFloat(lonDeg);
    const lom = parseFloat(lonMin);

    if (isNaN(ld) || isNaN(lm) || isNaN(lod) || isNaN(lom)) {
      setError('Enter degrees and minutes for both coordinates.');
      return;
    }
    if (ld < 0 || ld > 90 || lm < 0 || lm >= 60) {
      setError('Latitude: degrees 0–90, minutes 0–59.999');
      return;
    }
    if (lod < 0 || lod > 180 || lom < 0 || lom >= 60) {
      setError('Longitude: degrees 0–180, minutes 0–59.999');
      return;
    }

    const latitude = (ld + lm / 60) * (latHem === 'S' ? -1 : 1);
    const longitude = (lod + lom / 60) * (lonHem === 'W' ? -1 : 1);
    onDrop({ latitude, longitude });
  };

  const preview =
    latDeg && latMin && lonDeg && lonMin
      ? `${latDeg}° ${latMin}' ${latHem}   ${lonDeg}° ${lonMin}' ${lonHem}`
      : null;

  return (
    <KeyboardAvoidingView behavior="padding">
      <View style={cStyles.container}>
        <Text style={cStyles.heading}>ENTER COORDINATES</Text>
        <Text style={cStyles.hint}>Chartplotter format — degrees and decimal minutes</Text>

        {/* Latitude */}
        <Text style={cStyles.label}>LATITUDE</Text>
        <View style={cStyles.row}>
          <TextInput
            style={cStyles.degInput}
            value={latDeg}
            onChangeText={(t) => { setLatDeg(t.replace(/[^0-9]/g, '')); setError(null); }}
            keyboardType="number-pad"
            placeholder="33"
            placeholderTextColor="#334155"
            maxLength={2}
          />
          <Text style={cStyles.unit}>°</Text>
          <TextInput
            style={cStyles.minInput}
            value={latMin}
            onChangeText={(t) => { setLatMin(t.replace(/[^0-9.]/g, '')); setError(null); }}
            keyboardType="decimal-pad"
            placeholder="51.234"
            placeholderTextColor="#334155"
            maxLength={7}
          />
          <Text style={cStyles.unit}>&apos;</Text>
          <View style={cStyles.hemRow}>
            {(['N', 'S'] as const).map((h) => (
              <TouchableOpacity
                key={h}
                style={[cStyles.hemBtn, latHem === h && cStyles.hemBtnActive]}
                onPress={() => setLatHem(h)}
              >
                <Text style={[cStyles.hemText, latHem === h && cStyles.hemTextActive]}>{h}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Longitude */}
        <Text style={cStyles.label}>LONGITUDE</Text>
        <View style={cStyles.row}>
          <TextInput
            style={cStyles.degInput}
            value={lonDeg}
            onChangeText={(t) => { setLonDeg(t.replace(/[^0-9]/g, '')); setError(null); }}
            keyboardType="number-pad"
            placeholder="151"
            placeholderTextColor="#334155"
            maxLength={3}
          />
          <Text style={cStyles.unit}>°</Text>
          <TextInput
            style={cStyles.minInput}
            value={lonMin}
            onChangeText={(t) => { setLonMin(t.replace(/[^0-9.]/g, '')); setError(null); }}
            keyboardType="decimal-pad"
            placeholder="12.567"
            placeholderTextColor="#334155"
            maxLength={7}
          />
          <Text style={cStyles.unit}>&apos;</Text>
          <View style={cStyles.hemRow}>
            {(['E', 'W'] as const).map((h) => (
              <TouchableOpacity
                key={h}
                style={[cStyles.hemBtn, lonHem === h && cStyles.hemBtnActive]}
                onPress={() => setLonHem(h)}
              >
                <Text style={[cStyles.hemText, lonHem === h && cStyles.hemTextActive]}>{h}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {preview && (
          <View style={cStyles.preview}>
            <Text style={cStyles.previewText}>{preview}</Text>
          </View>
        )}

        {error && <Text style={cStyles.error}>{error}</Text>}

        <View style={rStyles.actions}>
          <TouchableOpacity style={rStyles.cancelBtn} onPress={onCancel}>
            <Text style={rStyles.cancelText}>CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={rStyles.dropBtn} onPress={handleDrop}>
            <Text style={rStyles.dropText}>DROP ANCHOR HERE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const cStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0f2040', borderRadius: 16, padding: 14,
    marginHorizontal: 16, borderWidth: 1, borderColor: '#1e3a6e', gap: 10,
  },
  heading: { color: '#C9A227', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  hint: { color: '#475569', fontSize: 11 },
  label: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  degInput: {
    width: 52, height: 44,
    backgroundColor: '#162d57', borderRadius: 8,
    borderWidth: 1, borderColor: '#1e3a6e',
    color: '#ffffff', fontSize: 18, fontWeight: '700',
    textAlign: 'center',
  },
  minInput: {
    flex: 1, height: 44,
    backgroundColor: '#162d57', borderRadius: 8,
    borderWidth: 1, borderColor: '#1e3a6e',
    color: '#ffffff', fontSize: 16, fontWeight: '600',
    textAlign: 'center',
  },
  unit: { color: '#C9A227', fontSize: 18, fontWeight: '700', width: 14, textAlign: 'center' },
  hemRow: { flexDirection: 'row', gap: 4 },
  hemBtn: {
    width: 36, height: 44, borderRadius: 8,
    backgroundColor: '#162d57', borderWidth: 1, borderColor: '#1e3a6e',
    alignItems: 'center', justifyContent: 'center',
  },
  hemBtnActive: { backgroundColor: '#C9A227', borderColor: '#C9A227' },
  hemText: { color: '#94a3b8', fontSize: 14, fontWeight: '800' },
  hemTextActive: { color: '#0a1628' },
  preview: {
    backgroundColor: '#162d57', borderRadius: 8, padding: 10,
    alignItems: 'center', borderWidth: 1, borderColor: '#1e3a6e',
  },
  previewText: { color: '#ffffff', fontSize: 15, fontWeight: '700', fontFamily: 'monospace', letterSpacing: 1 },
  error: { color: '#ef4444', fontSize: 11, fontWeight: '600' },
});

// ─── Review Prompt Modal ──────────────────────────────────────────────────────

function ReviewPromptModal({
  visible,
  onYes,
  onNo,
}: {
  visible: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={reviewStyles.backdrop}>
        <View style={reviewStyles.card}>
          <Text style={reviewStyles.anchor}>⚓</Text>
          <Text style={reviewStyles.title}>Enjoying HoldFast?</Text>
          <Text style={reviewStyles.body}>
            If the app is keeping your boat safe, a quick review helps other sailors find it.
          </Text>
          <TouchableOpacity style={reviewStyles.yesBtn} onPress={onYes}>
            <Text style={reviewStyles.yesText}>YES — LEAVE A REVIEW</Text>
          </TouchableOpacity>
          <TouchableOpacity style={reviewStyles.noBtn} onPress={onNo}>
            <Text style={reviewStyles.noText}>Not right now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const reviewStyles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: '#04080fcc',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  card: {
    backgroundColor: '#0a1628', borderRadius: 16,
    borderWidth: 1, borderColor: '#1e3a6e',
    padding: 24, alignItems: 'center', gap: 12, width: '100%',
  },
  anchor: { fontSize: 36 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  body: { color: '#94a3b8', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  yesBtn: {
    backgroundColor: '#C9A227', borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center',
  },
  yesText: { color: '#0a1628', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  noBtn: { paddingVertical: 8 },
  noText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen() {
  useTideData();

  const router = useRouter();
  const { showPrompt, recordActivation, handleEnjoyingApp, handleNotEnjoyingApp } = useReviewPrompt();
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

  // ── Silent mode warning on background ──────────────────────────────────────
  // Posts a warning notification if the app is backgrounded with the watch
  // active while the phone is on silent (iOS mute switch / Android ringer mode).
  useSilentModeWarning();

  // ── Critical Alerts nudge (iOS) ────────────────────────────────────────────
  // One-time prompt to enable Critical Alerts in Settings when a watch starts
  // on an entitled build where the user hasn't granted them. Inert otherwise.
  useCriticalAlertsNudge();

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
    isPremium,
    lastAnchorPosition,
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
    setShowDropMenu(false);
    setTapToPlace(false);
    // Show radius panel so user can confirm radius before watch starts
    setActivePanel('radius');
  };

  const handleConfirmAnchor = () => {
    setWatchActive(true);
    setActivePanel('none');
    recordActivation();
  };

  const handleDropAtLastPosition = () => {
    if (!lastAnchorPosition) return;
    dropAnchor({ latitude: lastAnchorPosition.latitude, longitude: lastAnchorPosition.longitude });
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
      <View ref={tourRefs.mapRoot} style={styles.mapContainer}>
        <RadarMap
          onLongPress={handleMapLongPress}
          onMapPress={tapToPlace ? handleMapTapPlace : undefined}
          drawingMode={isDrawingZone}
          drawnPoints={drawnPoints}
          onAddPoint={handleAddPoint}
          onUpdatePoint={handleUpdatePoint}
          tourActive={showTour}
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
            ref={tourRefs.drop}
            style={styles.dropBtn}
            onPress={() => { setTapToPlace(false); setShowDropMenu(true); }}
          >
            <Image source={require('../assets/images/anchor-icon.png')} style={{ width: 16, height: 16, tintColor: '#0a1628' }} resizeMode="contain" />
            <Text style={styles.dropBtnText}>DROP ANCHOR</Text>
          </TouchableOpacity>
        )}

        {/* Lift anchor — shown in top-right once anchor is placed, hidden in drawing mode */}
        {anchorPosition && !isDrawingZone && (
          <TouchableOpacity style={styles.liftBtn} onPress={handleLiftAnchor} activeOpacity={0.85}>
            <View style={styles.liftBtnIcon}>
              <Ionicons name="arrow-up" size={14} color="#ffffff" />
            </View>
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

              {lastAnchorPosition && (
                <TouchableOpacity style={[styles.dropOption, styles.dropOptionLast]} onPress={handleDropAtLastPosition}>
                  <Text style={styles.dropOptionTitle}>LAST ANCHOR POSITION</Text>
                  <Text style={styles.dropOptionSub}>
                    {`${Math.abs(lastAnchorPosition.latitude).toFixed(5)}°${lastAnchorPosition.latitude >= 0 ? 'N' : 'S'}  ${Math.abs(lastAnchorPosition.longitude).toFixed(5)}°${lastAnchorPosition.longitude >= 0 ? 'E' : 'W'}`}
                  </Text>
                </TouchableOpacity>
              )}

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
                onPress={() => { setShowDropMenu(false); setActivePanel('coordInput'); }}
              >
                <Text style={styles.dropOptionTitle}>ENTER COORDINATES</Text>
                <Text style={styles.dropOptionSub}>
                  Chartplotter format, e.g. 33° 51.234&apos; S, 151° 12.567&apos; E
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

      {/* Floating bottom overlay — controls sit over the satellite map */}
      <View style={styles.bottomFloat} pointerEvents="box-none">

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

        {/* Unified control card — watch status + tool row */}
        <View style={styles.controlCard}>

          {/* Watch status row — shown once an anchor is placed (or during the tour) */}
          {(anchorPosition || showTour) && (
            <>
              <View style={styles.watchRow}>
                <TouchableOpacity
                  ref={tourRefs.watchToggle}
                  style={styles.watchStatus}
                  onPress={() => setWatchActive(!isWatchActive)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.watchShield,
                      isWatchActive
                        ? (alarmLevel !== 'silent' ? styles.watchShieldAlarm : styles.watchShieldOn)
                        : styles.watchShieldOff,
                    ]}
                  >
                    {!isWatchActive ? (
                      // Watch off — red shield with a cross
                      <>
                        <Ionicons name="shield" size={26} color="#ef4444" />
                        <View style={styles.shieldMarkOverlay} pointerEvents="none">
                          <Ionicons name="close" size={13} color="#ffffff" />
                        </View>
                      </>
                    ) : alarmLevel !== 'silent' ? (
                      // Watch on but alarming
                      <Ionicons name="warning" size={22} color="#ef4444" />
                    ) : (
                      // Watch on and safe — green shield with a tick
                      <Ionicons name="shield-checkmark" size={22} color="#10b981" />
                    )}
                  </View>

                  {isWatchActive && boatPosition ? (
                    <View style={styles.watchTextBlock}>
                      <View style={styles.watchHeroRow}>
                        <Text style={styles.watchHeroNum}>{distText}</Text>
                        <Text style={styles.watchHeroBearing}>{bearingToCardinal(currentBearing)} {Math.round(currentBearing)}°</Text>
                      </View>
                      <Text style={styles.watchStatusSub}>WATCH ACTIVE · tap to disable</Text>
                    </View>
                  ) : (
                    <View style={styles.watchTextBlock}>
                      <Text style={styles.watchStatusTitle}>
                        {isWatchActive ? 'ANCHOR WATCH ACTIVE' : 'ANCHOR WATCH OFF'}
                      </Text>
                      <Text style={styles.watchStatusSub}>
                        {isWatchActive ? 'Waiting for GPS…' : 'Tap to enable alarm'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* Track record / pause toggle */}
                <TouchableOpacity
                  style={[styles.recBtn, isTrackingPaused && styles.recBtnPaused]}
                  onPress={handleTrackPause}
                  activeOpacity={0.8}
                >
                  {isTrackingPaused
                    ? <Ionicons name="play" size={15} color="#94a3b8" />
                    : <View style={styles.recDot} />}
                  <Text style={[styles.recLabel, isTrackingPaused && styles.recLabelPaused]}>
                    {isTrackingPaused ? 'PAUSED' : 'REC'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.cardDivider} />
            </>
          )}

          {/* Tool buttons */}
          <View style={styles.toolRow}>
            <TouchableOpacity
              ref={tourRefs.radius}
              style={styles.toolBtn}
              onPress={() => togglePanel('radius')}
            >
              <Ionicons
                name="radio-button-on-outline"
                size={22}
                color={activePanel === 'radius' ? '#2dd4bf' : '#64748b'}
              />
              <Text style={[styles.toolLabel, activePanel === 'radius' && styles.toolLabelActive]}>RADIUS</Text>
            </TouchableOpacity>

            <TouchableOpacity
              ref={tourRefs.history}
              style={styles.toolBtn}
              onPress={() => isPremium ? togglePanel('playback') : Alert.alert(
                'GPS Track History',
                'Replay your boat\'s position throughout the night on a colour-coded track, with a scrubber to jump to any moment.',
                [{ text: 'Not now', style: 'cancel' }, { text: 'Go Premium', onPress: () => router.push('/upgrade') }]
              )}
            >
              <Ionicons
                name={isPremium ? 'time-outline' : 'lock-closed-outline'}
                size={22}
                color={activePanel === 'playback' ? '#2dd4bf' : '#64748b'}
              />
              <Text style={[styles.toolLabel, activePanel === 'playback' && styles.toolLabelActive]}>HISTORY</Text>
            </TouchableOpacity>

            <TouchableOpacity
              ref={tourRefs.watchTab}
              style={styles.toolBtn}
              onPress={() => isPremium ? router.push('/remote') : Alert.alert(
                'Remote Watch',
                'Share a live link so someone ashore can see your anchor position and alarm status in real time.',
                [{ text: 'Not now', style: 'cancel' }, { text: 'Go Premium', onPress: () => router.push('/upgrade') }]
              )}
            >
              <Ionicons name={isPremium ? 'eye-outline' : 'lock-closed-outline'} size={22} color="#64748b" />
              <Text style={styles.toolLabel}>WATCH</Text>
            </TouchableOpacity>

            <TouchableOpacity
              ref={tourRefs.settings}
              style={styles.toolBtn}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={22} color="#64748b" />
              <Text style={styles.toolLabel}>SETTINGS</Text>
            </TouchableOpacity>
          </View>
        </View>

        {activePanel === 'radius' && (
          <>
            <RadiusControl onDrawZone={handleStartDrawing} />
            {anchorPosition && !isWatchActive && (
              <TouchableOpacity style={styles.startWatchBtn} onPress={handleConfirmAnchor}>
                <Ionicons name="shield-checkmark-outline" size={18} color="#0a1628" />
                <Text style={styles.startWatchBtnText}>START WATCH</Text>
              </TouchableOpacity>
            )}
          </>
        )}
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
        {activePanel === 'coordInput' && (
          <CoordinateInputPanel
            onDrop={(coord) => { dropAnchor(coord); setActivePanel('none'); }}
            onCancel={() => setActivePanel('none')}
          />
        )}
      </View>}

      </View>

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

      {/* Review prompt — shown after 3rd watch activation, then weekly up to 4 times */}
      <ReviewPromptModal
        visible={showPrompt}
        onYes={handleEnjoyingApp}
        onNo={handleNotEnjoyingApp}
      />
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

  // Drop anchor button — top right
  dropBtn: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: '#C9A227', borderRadius: 10,
    paddingVertical: 9, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  dropBtnText: { color: '#0a1628', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  // Lift anchor — top right, replaces drop button when anchor is placed
  liftBtn: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: '#190a0eee', borderRadius: 22,
    paddingVertical: 6, paddingLeft: 6, paddingRight: 15,
    borderWidth: 1, borderColor: '#ef444455',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
  liftBtnIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#ef4444',
    alignItems: 'center', justifyContent: 'center',
  },
  liftBtnText: { color: '#fecaca', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

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
    color: '#94a3b8', fontSize: 11, fontWeight: '700',
    letterSpacing: 2, marginBottom: 4,
  },
  dropOption: {
    backgroundColor: '#0f2040', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#1e3a6e', gap: 4,
  },
  dropOptionLast: {
    borderColor: '#C9A22744', backgroundColor: '#C9A22710',
  },
  dropOptionTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  dropOptionSub: { color: '#94a3b8', fontSize: 12 },

  // Floating bottom overlay — lets the satellite map show through behind the controls
  bottomFloat: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
  },
  // Bottom bar — transparent so the map is visible behind the rounded control card
  bottomBar: {
    paddingTop: 10, paddingBottom: 24, gap: 8,
  },
  // Unified control card grouping the watch status + tool row
  controlCard: {
    marginHorizontal: 16,
    backgroundColor: '#0a1628d9',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1c3358',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#16294a',
    marginHorizontal: 8,
  },

  // Watch status row
  watchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 },
  watchStatus: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  watchShield: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1.5, alignItems: 'center', justifyContent: 'center',
  },
  watchShieldOff: { borderColor: '#ef444466', backgroundColor: '#ef444414' },
  watchShieldOn: { borderColor: '#10b98166', backgroundColor: '#10b98114' },
  watchShieldAlarm: { borderColor: '#ef444466', backgroundColor: '#ef444414' },
  shieldMarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  watchTextBlock: { flex: 1, gap: 2 },
  watchStatusTitle: { color: '#f1f5f9', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  watchStatusSub: { color: '#94a3b8', fontSize: 13 },
  watchHeroRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },

  // REC / pause toggle
  recBtn: {
    minWidth: 58,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f2040',
    borderWidth: 1,
    borderColor: '#1e3a6e',
    gap: 3,
  },
  recBtnPaused: { borderColor: '#ef444455', backgroundColor: '#ef444411' },
  recDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#ef4444' },
  recLabel: { color: '#ef4444', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  recLabelPaused: { color: '#94a3b8' },
  startWatchBtn: {
    backgroundColor: '#C9A227',
    borderRadius: 10,
    paddingVertical: 15,
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  startWatchBtnText: {
    color: '#0a1628',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
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
    color: '#e2e8f0',
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
  drawingHint: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
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
  drawActionText: { color: '#e2e8f0', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  drawActionTextDisabled: { color: '#94a3b8' },
  drawCancelBtn: { borderColor: '#334155' },
  drawCancelText: { color: '#94a3b8' },
  drawDoneBtn: { flex: 2, backgroundColor: '#162d57', borderColor: '#3b82f6' },
  drawDoneText: { color: '#3b82f6' },

  // Tool row — borderless icon + label, evenly spaced inside the control card
  toolRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 2 },
  toolBtn: {
    flex: 1, alignItems: 'center',
    paddingVertical: 10, gap: 6,
  },
  toolLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  toolLabelActive: { color: '#2dd4bf' },

  // Hero distance/bearing display inside the watch status row
  watchHeroNum: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  watchHeroBearing: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
});
