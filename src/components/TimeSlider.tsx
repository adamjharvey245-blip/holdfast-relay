import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, PanResponder } from 'react-native';
import { useAnchorStore } from '@/store/anchorStore';

export function TimeSlider() {
  const {
    positionHistory,
    selectedHistoryIndex,
    setSelectedHistoryIndex,
  } = useAnchorStore();

  const count = positionHistory.length;
  const [trackWidth, setTrackWidth] = useState(0);

  // Refs so PanResponder closure always sees latest values
  const countRef = useRef(0);
  const twRef = useRef(0);
  const setIdxRef = useRef(setSelectedHistoryIndex);
  countRef.current = count;
  setIdxRef.current = setSelectedHistoryIndex;

  const scrub = (x: number) => {
    if (twRef.current === 0 || countRef.current < 2) return;
    const clamped = Math.max(0, Math.min(twRef.current, x));
    const idx = Math.round((clamped / twRef.current) * (countRef.current - 1));
    setIdxRef.current(idx);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => scrub(e.nativeEvent.locationX),
      onPanResponderMove: (e) => scrub(e.nativeEvent.locationX),
    })
  ).current;

  if (count < 2) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>
          Not enough GPS history yet.{'\n'}GPS track builds over time.
        </Text>
      </View>
    );
  }

  const idx = selectedHistoryIndex ?? count - 1;
  const point = positionHistory[idx];
  const minAgo = Math.round((Date.now() - point.timestamp) / 60_000);
  const fmt = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const pct = count > 1 ? idx / (count - 1) : 1;
  const fillW = trackWidth * pct;
  const thumbL = Math.max(0, Math.min(trackWidth - 16, fillW - 8));

  return (
    <View style={styles.container}>
      {/* Info row */}
      <View style={styles.infoRow}>
        <Text style={styles.time}>{fmt(point.timestamp)}</Text>
        <Text style={styles.sep}>·</Text>
        <Text style={styles.ago}>{minAgo === 0 ? 'just now' : `${minAgo} min ago`}</Text>
        <Text style={styles.count}>{idx + 1} / {count}</Text>
      </View>

      {/* Scrubber — full-width touch target */}
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
          <View style={[styles.trackFill, { width: fillW }]} />
        </View>
        {trackWidth > 0 && <View style={[styles.thumb, { left: thumbL }]} />}
      </View>

      {/* Time axis labels */}
      <View style={styles.labelRow}>
        <Text style={styles.labelText}>{fmt(positionHistory[0].timestamp)}</Text>
        <Text style={styles.labelText}>NOW</Text>
      </View>

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
    gap: 10,
  },
  emptyText: {
    color: '#475569',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  time: {
    color: '#C9A227',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  sep: { color: '#334155', fontSize: 12 },
  ago: { color: '#94a3b8', fontSize: 12 },
  count: {
    color: '#475569',
    fontSize: 12,
    marginLeft: 'auto',
  },

  // Scrubber
  scrubArea: {
    height: 44,
    justifyContent: 'center',
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 19, // (44 - 6) / 2
    height: 6,
    backgroundColor: '#1e3a6e',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: '100%',
    backgroundColor: '#C9A227',
  },
  thumb: {
    position: 'absolute',
    top: 14, // (44 - 16) / 2
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#C9A227',
    borderWidth: 2,
    borderColor: '#0f2040',
  },

  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  labelText: {
    color: '#475569',
    fontSize: 10,
    fontFamily: 'monospace',
  },

});
