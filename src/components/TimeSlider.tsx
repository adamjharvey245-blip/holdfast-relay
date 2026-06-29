import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAnchorStore } from '@/store/anchorStore';

// Colours matching the 4-hour segments in RadarMap
const SEGMENT_COLORS = ['#00d4ff', '#10b981', '#C9A227', '#f97316', '#a855f7', '#3b82f6'];
const NUM_SEGMENTS = 6;
const THUMB = 24;

export function TimeSlider() {
  const {
    positionHistory,
    selectedHistoryIndex,
    setSelectedHistoryIndex,
    trackRetentionHours,
    clearTrack,
  } = useAnchorStore();

  const count = positionHistory.length;
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);

  // Animated values drive the thumb + fill directly from the gesture so we never
  // trigger a React re-render mid-drag — that was the source of the old jank.
  const thumbX = useRef(new Animated.Value(0)).current;

  // Refs so the PanResponder closure always sees the latest values
  const countRef = useRef(0);
  const twRef = useRef(0);
  const lastIdxRef = useRef<number | null>(null);
  const scrubbingRef = useRef(false);
  const setIdxRef = useRef(setSelectedHistoryIndex);
  countRef.current = count;
  setIdxRef.current = setSelectedHistoryIndex;

  // Convert a touch X into a clamped pixel position + (only on change) commit the index
  const scrub = (x: number) => {
    const tw = twRef.current;
    if (tw <= 0 || countRef.current < 2) return;
    const clamped = Math.max(0, Math.min(tw, x));
    thumbX.setValue(clamped);
    const idx = Math.round((clamped / tw) * (countRef.current - 1));
    if (idx !== lastIdxRef.current) {
      lastIdxRef.current = idx;
      setIdxRef.current(idx);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Claim the gesture so the parent panel can't steal it mid-scrub
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        scrubbingRef.current = true;
        setScrubbing(true);
        scrub(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => scrub(e.nativeEvent.locationX),
      onPanResponderRelease: () => {
        scrubbingRef.current = false;
        setScrubbing(false);
      },
      onPanResponderTerminate: () => {
        scrubbingRef.current = false;
        setScrubbing(false);
      },
    })
  ).current;

  const handleErase = () => {
    Alert.alert(
      'Erase Track?',
      'This will clear all GPS history. The track will rebuild from this point.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: clearTrack },
      ]
    );
  };

  // Work out which colour segment the currently selected point falls in
  const idx = selectedHistoryIndex ?? (count > 0 ? count - 1 : 0);
  const point = count > 0 ? positionHistory[idx] : null;
  const segmentIdx = point
    ? Math.min(NUM_SEGMENTS - 1, Math.floor((Date.now() - point.timestamp) / (4 * 3_600_000)))
    : 0;
  const segColor = SEGMENT_COLORS[segmentIdx];

  const pct = count > 1 ? idx / (count - 1) : 1;

  // Keep the thumb in sync with the store whenever we're NOT actively dragging
  // (e.g. first open, store reset, or the index changed elsewhere).
  useEffect(() => {
    if (!scrubbingRef.current && trackWidth > 0) {
      lastIdxRef.current = idx;
      thumbX.setValue(pct * trackWidth);
    }
  }, [pct, trackWidth, idx]);

  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <View style={styles.container}>

      {/* Header row: legend + erase */}
      <View style={styles.headerRow}>
        <View style={styles.legendRow}>
          {SEGMENT_COLORS.slice(0, Math.ceil((trackRetentionHours ?? 4) / 4)).map((c, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: c }]} />
              <Text style={styles.legendText}>{i * 4}–{(i + 1) * 4}h</Text>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.eraseBtn} onPress={handleErase}>
          <Ionicons name="trash-outline" size={14} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {count < 2 ? (
        <Text style={styles.emptyText}>
          Not enough GPS history yet.{'\n'}GPS track builds over time.
        </Text>
      ) : (
        <>
          {/* Info row */}
          <View style={styles.infoRow}>
            <Text style={[styles.time, { color: segColor }]}>
              {fmt(point!.timestamp)}
            </Text>
            <Text style={styles.sep}>·</Text>
            <Text style={styles.ago}>
              {Math.round((Date.now() - point!.timestamp) / 60_000) === 0
                ? 'just now'
                : `${Math.round((Date.now() - point!.timestamp) / 60_000)} min ago`}
            </Text>
            <Text style={styles.count}>{idx + 1} / {count}</Text>
          </View>

          {/* Scrubber — full-height touch target for easy grabbing */}
          <View
            style={styles.scrubArea}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              setTrackWidth(w);
              twRef.current = w;
            }}
            {...panResponder.panHandlers}
          >
            <View style={styles.trackBg}>
              <Animated.View style={[styles.trackFill, { width: thumbX, backgroundColor: segColor }]} />
            </View>
            {trackWidth > 0 && (
              <Animated.View
                style={[
                  styles.thumb,
                  scrubbing && styles.thumbActive,
                  {
                    backgroundColor: segColor,
                    transform: [{ translateX: Animated.subtract(thumbX, THUMB / 2) }],
                  },
                ]}
              >
                {scrubbing && <View style={[styles.thumbHalo, { borderColor: segColor }]} />}
              </Animated.View>
            )}
          </View>

          {/* Time axis labels */}
          <View style={styles.labelRow}>
            <Text style={styles.labelText}>{fmt(positionHistory[0].timestamp)}</Text>
            <Text style={styles.labelText}>NOW</Text>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f2040',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    gap: 10,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eraseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ef444415',
    borderWidth: 1,
    borderColor: '#ef444440',
    alignItems: 'center',
    justifyContent: 'center',
  },

  legendRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  time: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  sep: { color: '#334155', fontSize: 12 },
  ago: { color: '#e2e8f0', fontSize: 12 },
  count: {
    color: '#94a3b8',
    fontSize: 12,
    marginLeft: 'auto',
  },

  scrubArea: {
    height: 48,
    justifyContent: 'center',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 21,
    height: 6,
    backgroundColor: '#1e3a6e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    borderRadius: 3,
  },
  thumb: {
    position: 'absolute',
    top: 12,
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    borderColor: '#0f2040',
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle lift so the thumb reads as grabbable
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  thumbActive: {
    borderColor: '#0a1628',
  },
  thumbHalo: {
    position: 'absolute',
    width: THUMB + 14,
    height: THUMB + 14,
    borderRadius: (THUMB + 14) / 2,
    borderWidth: 2,
    opacity: 0.4,
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  labelText: {
    color: '#94a3b8',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
