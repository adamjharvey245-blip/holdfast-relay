import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAnchorStore } from '@/store/anchorStore';

const SLIDER_MIN = 5;
const SLIDER_MAX = 200;

interface RadiusControlProps {
  onDrawZone: () => void;
}

export function RadiusControl({ onDrawZone }: RadiusControlProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const twRef = useRef(0);
  const router = useRouter();

  const {
    watchRadius, setWatchRadius, customZone, setCustomZone,
    isPremium,
  } = useAnchorStore();

  const hasZone = customZone !== null && customZone.length >= 3;

  // Radius scrubber
  const pct = Math.max(0, Math.min(1, (watchRadius - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)));
  const fillW = trackWidth * pct;
  const thumbL = Math.max(0, Math.min(trackWidth - 20, fillW - 10));

  const scrubRadius = (x: number) => {
    if (twRef.current === 0) return;
    const clamped = Math.max(0, Math.min(twRef.current, x));
    const r = Math.round(SLIDER_MIN + (clamped / twRef.current) * (SLIDER_MAX - SLIDER_MIN));
    setWatchRadius(r);
  };

  const radiusPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => scrubRadius(e.nativeEvent.locationX),
    onPanResponderMove: (e) => scrubRadius(e.nativeEvent.locationX),
  })).current;

  return (
    <View style={styles.container}>

      {hasZone ? (
        /* Custom zone is active */
        <View style={styles.zoneActive}>
          <View style={styles.zoneActiveRow}>
            <View style={styles.zoneActiveDot} />
            <Text style={styles.zoneActiveLabel}>CUSTOM ZONE ACTIVE</Text>
            <Text style={styles.zonePoints}>{customZone!.length} points</Text>
          </View>
          <Text style={styles.zoneHint}>Alarm fires when boat leaves your drawn zone</Text>
          <View style={styles.zoneActions}>
            <TouchableOpacity style={styles.redrawBtn} onPress={onDrawZone}>
              <Text style={styles.redrawBtnText}>REDRAW</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.clearZoneBtn} onPress={() => setCustomZone(null)}>
              <Text style={styles.clearZoneBtnText}>CLEAR ZONE</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        /* Circle radius controls */
        <>
          <Text style={styles.label}>DRAG RADIUS</Text>

          <View style={styles.row}>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius - 10)}>
              <Text style={styles.stepBtnText}>−10</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius - 1)}>
              <Text style={styles.stepBtnText}>−1</Text>
            </TouchableOpacity>

            <View style={styles.valueBox}>
              <Text style={styles.valueText}>{watchRadius}</Text>
              <Text style={styles.unitText}>m</Text>
            </View>

            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius + 1)}>
              <Text style={styles.stepBtnText}>+1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setWatchRadius(watchRadius + 10)}>
              <Text style={styles.stepBtnText}>+10</Text>
            </TouchableOpacity>
          </View>

          {/* Radius scrubber */}
          <View
            style={styles.scrubArea}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setTrackWidth(w);
              twRef.current = w;
            }}
            {...radiusPan.panHandlers}
          >
            <View style={styles.trackBg}>
              <View style={[styles.trackFill, { width: fillW }]} />
            </View>
            {trackWidth > 0 && <View style={[styles.thumb, { left: thumbL }]} />}
          </View>
          <View style={styles.scrubLabels}>
            <Text style={styles.scrubLabel}>{SLIDER_MIN}m</Text>
            <Text style={styles.scrubLabel}>{SLIDER_MAX}m</Text>
          </View>

          <TouchableOpacity
            style={[styles.drawZoneBtn, !isPremium && styles.drawZoneBtnLocked]}
            onPress={isPremium ? onDrawZone : () => Alert.alert(
              'Custom Alarm Zone',
              'Draw your own boundary around rocks, shallows, or other hazards — not just a circle.',
              [{ text: 'Not now', style: 'cancel' }, { text: 'Go Premium', onPress: () => router.push('/upgrade') }]
            )}
          >
            {!isPremium && <Ionicons name="lock-closed" size={13} color="#C9A227" />}
            <Text style={styles.drawZoneBtnText}>DRAW CUSTOM ZONE</Text>
            <Text style={styles.drawZoneBtnSub}>
              {isPremium ? 'Tap points on map to set a custom shape' : 'Draw a boundary around rocks, shallows, or hazards'}
            </Text>
          </TouchableOpacity>

        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f2040',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    gap: 12,
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#162d57',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  stepBtnText: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 26,
  },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    minWidth: 80,
    justifyContent: 'center',
  },
  valueText: {
    color: '#C9A227',
    fontSize: 32,
    fontWeight: '700',
  },
  unitText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  scrubArea: {
    height: 40,
    justifyContent: 'center',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 17,
    height: 6,
    backgroundColor: '#1e3a6e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#C9A227',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    top: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C9A227',
    borderWidth: 2.5,
    borderColor: '#0f2040',
  },
  scrubLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  scrubLabel: {
    color: '#334155',
    fontSize: 10,
    fontFamily: 'monospace',
  },

  drawZoneBtn: {
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  drawZoneBtnLocked: {
    borderColor: '#C9A22744',
    backgroundColor: '#C9A22708',
  },
  drawZoneBtnText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  drawZoneBtnSub: {
    color: '#94a3b8',
    fontSize: 10,
  },

  zoneActive: { gap: 8 },
  zoneActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoneActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3b82f6',
  },
  zoneActiveLabel: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  zonePoints: {
    color: '#94a3b8',
    fontSize: 10,
  },
  zoneHint: {
    color: '#94a3b8',
    fontSize: 11,
  },
  zoneActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  redrawBtn: {
    flex: 1,
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
    paddingVertical: 9,
    alignItems: 'center',
  },
  redrawBtnText: {
    color: '#3b82f6',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  clearZoneBtn: {
    flex: 1,
    backgroundColor: '#162d57',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    paddingVertical: 9,
    alignItems: 'center',
  },
  clearZoneBtnText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
