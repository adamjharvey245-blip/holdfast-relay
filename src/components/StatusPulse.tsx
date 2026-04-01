import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useAnchorStore } from '@/store/anchorStore';
import type { AlarmLevel, GpsStatus } from '@/types';

// ─── Colour config per state ──────────────────────────────────────────────────

const LEVEL_CONFIG: Record<
  AlarmLevel | 'gps_lost',
  { color: string; label: string; sublabel: string }
> = {
  silent: {
    color: '#10b981',
    label: 'HOLDING',
    sublabel: 'Anchor secure',
  },
  nudge: {
    color: '#f59e0b',
    label: 'WATCH',
    sublabel: 'Approaching limit',
  },
  alert: {
    color: '#f97316',
    label: 'DRAGGING',
    sublabel: 'Boundary reached',
  },
  emergency: {
    color: '#ef4444',
    label: 'EMERGENCY',
    sublabel: 'Take action now',
  },
  gps_lost: {
    color: '#7c3aed',
    label: 'GPS LOST',
    sublabel: 'No signal >60s',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StatusPulse() {
  const { alarmLevel, gpsStatus, currentDistance, watchRadius, isWatchActive } =
    useAnchorStore();

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const effectiveLevel: AlarmLevel | 'gps_lost' =
    gpsStatus === 'lost' ? 'gps_lost' : alarmLevel;

  const config = LEVEL_CONFIG[effectiveLevel];
  const isCritical = effectiveLevel === 'emergency' || effectiveLevel === 'gps_lost';
  const isAlert = effectiveLevel === 'alert';

  // ── Pulse animation ──────────────────────────────────────────────────────

  useEffect(() => {
    pulseLoopRef.current?.stop();

    if (!isWatchActive || effectiveLevel === 'silent') {
      pulseAnim.setValue(1);
      opacityAnim.setValue(1);
      return;
    }

    const speed = isCritical ? 400 : isAlert ? 700 : 1400;

    pulseLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.35,
            duration: speed,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.0,
            duration: speed,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoopRef.current.start();

    return () => pulseLoopRef.current?.stop();
  }, [effectiveLevel, isWatchActive]);

  if (!isWatchActive) {
    return (
      <View style={styles.inactiveContainer}>
        <Text style={styles.inactiveText}>WATCH INACTIVE</Text>
        <Text style={styles.inactiveSub}>Drop anchor to begin monitoring</Text>
      </View>
    );
  }

  const distanceText =
    currentDistance < 1000
      ? `${Math.round(currentDistance)}m`
      : `${(currentDistance / 1000).toFixed(2)}km`;

  const percentOfRadius = watchRadius > 0
    ? Math.min(999, Math.round((currentDistance / watchRadius) * 100))
    : 0;

  return (
    <View style={styles.container}>
      {/* Outer glow ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          {
            borderColor: config.color,
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
          },
        ]}
      />

      {/* Inner circle */}
      <View style={[styles.innerCircle, { backgroundColor: config.color + '22', borderColor: config.color }]}>
        <Text style={[styles.levelLabel, { color: config.color }]}>
          {config.label}
        </Text>
        <Text style={styles.distanceText}>{distanceText}</Text>
        <Text style={styles.sublabel}>{config.sublabel}</Text>
        <Text style={[styles.percentText, { color: config.color + 'cc' }]}>
          {percentOfRadius}% of {watchRadius}m
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CIRCLE_SIZE = 180;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CIRCLE_SIZE + 60,
    height: CIRCLE_SIZE + 60,
  },
  pulseRing: {
    position: 'absolute',
    width: CIRCLE_SIZE + 40,
    height: CIRCLE_SIZE + 40,
    borderRadius: (CIRCLE_SIZE + 40) / 2,
    borderWidth: 3,
  },
  innerCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  levelLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
  },
  distanceText: {
    fontSize: 36,
    fontWeight: '700',
    color: '#f1f5f9',
    letterSpacing: 1,
  },
  sublabel: {
    fontSize: 11,
    color: '#94a3b8',
    letterSpacing: 1,
  },
  percentText: {
    fontSize: 11,
    marginTop: 2,
  },
  inactiveContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: CIRCLE_SIZE + 60,
    height: CIRCLE_SIZE + 60,
    borderRadius: (CIRCLE_SIZE + 60) / 2,
    borderWidth: 1,
    borderColor: '#334155',
    borderStyle: 'dashed',
  },
  inactiveText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
  inactiveSub: {
    color: '#334155',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
