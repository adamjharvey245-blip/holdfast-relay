import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  Animated,
  findNodeHandle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tourRefs, TourTargetKey } from './tourTargets';

const { width: SW, height: SH } = Dimensions.get('window');

const CARD_W = Math.min(320, SW - 32);
const RING_PAD = 10;
const POINTER = 9;

interface TourStep {
  icon?: any;         // Ionicons name (omitted when `image` is set)
  image?: boolean;    // render the brand anchor mark instead of an Ionicon
  iconColor: string;
  title: string;
  body: string;
  // The on-screen control this step points at (omit for an informational card)
  target?: TourTargetKey;
  // True when the target is overlaid on the native map view. On iOS such a
  // target can measure relative to the map's frame (omitting the status-bar +
  // header offset above it); AppTour corrects this against the map container.
  overMap?: boolean;
}

const TOUR_STEPS: TourStep[] = [
  {
    image: true,
    iconColor: '#C9A227',
    title: 'Drop the Anchor',
    body: 'Tap DROP ANCHOR to set your position — by GPS, a bearing & distance, coordinates, or by pressing the map. This is your first step every time you anchor.',
    target: 'drop',
    overMap: true,
  },
  {
    icon: 'radio-button-on-outline',
    iconColor: '#10b981',
    title: 'Watch Radius',
    body: 'Tap RADIUS to size the ring your boat must stay inside — typically about 1.5× your chain scope to allow for swing.',
    target: 'radius',
  },
  {
    icon: 'power',
    iconColor: '#10b981',
    title: 'Activate the Watch',
    body: 'Once your anchor is dropped, tap this WATCH button to start monitoring — the ring turns orange then red if you approach or cross the boundary.',
    target: 'watchToggle',
  },
  {
    icon: 'lock-open-outline',
    iconColor: '#C9A227',
    title: 'Move the Anchor',
    body: 'This padlock locks the anchor in place. Tap to unlock, then drag the anchor or the ring to fine-tune its position. Tap again to lock.',
    target: 'lock',
  },
  {
    icon: 'notifications',
    iconColor: '#ef4444',
    title: 'Alarms',
    body: 'Cross the boundary and the alarm fires with sound and vibration: Alert at the line, Emergency well past it, and GPS Lost on signal loss. Tune each in Settings.',
  },
  {
    icon: 'volume-mute',
    iconColor: '#f97316',
    title: 'Silencing Alarms',
    body: 'Tap SILENCE on an active alarm to mute it for the cooldown (default 2 min). It re-fires if you’re still outside the zone.',
  },
  {
    icon: 'time-outline',
    iconColor: '#C9A227',
    title: 'Track History',
    body: 'Tap HISTORY to scrub back through your GPS track and see exactly where the boat has drifted through the night.',
    target: 'history',
  },
  {
    icon: 'map-outline',
    iconColor: '#94a3b8',
    title: 'Map Styles',
    body: 'This button cycles Satellite, Standard, and Nautical Chart — the chart shows depth contours, hazards and marks from OpenSeaMap.',
    target: 'mapStyle',
  },
  {
    icon: 'warning-outline',
    iconColor: '#C9A227',
    title: 'Important Limitations',
    body: 'HoldFast is a supplementary aid only. GPS varies and alarms can fail if the battery dies or the OS suspends the app. Keep the phone powered — never rely solely on this app.',
  },
  {
    icon: 'settings-outline',
    iconColor: '#94a3b8',
    title: 'Settings',
    body: 'Tap SETTINGS for alarm thresholds, sounds, the watch radius, Terms & Privacy — and to replay this tour any time.',
    target: 'settings',
  },
];

interface AppTourProps {
  visible: boolean;
  onDone: () => void;
}

type Rect = { x: number; y: number; w: number; h: number };

// TEMP: on-screen diagnostic for the drop-anchor highlight offset. Remove once fixed.
const TOUR_DEBUG = true;

export function AppTour({ visible, onDone }: AppTourProps) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dbg, setDbg] = useState<string>('');
  const fade = useRef(new Animated.Value(0)).current;

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  // Measure this step's target (if any) so the coachmark can point at it.
  const measure = useCallback(() => {
    const key = current.target;
    const node = key ? tourRefs[key]?.current : null;
    if (!node || typeof node.measureInWindow !== 'function') {
      setRect(null);
      return;
    }
    // A control overlaid on the native map (the drop button) can have its
    // measureInWindow reported relative to the map's frame on iOS, dropping the
    // status-bar + header offset above it (the highlight then lands up in the
    // status bar). Reconstruct the true window rect from the target's layout
    // offset *inside* the map container (from React's layout tree, reliable)
    // plus the container's own window position.
    const mapNode = current.overMap ? tourRefs.mapRoot?.current : null;
    const mapHandle = mapNode ? findNodeHandle(mapNode) : null;
    if (mapNode && mapHandle != null && typeof node.measureLayout === 'function') {
      node.measureLayout(
        mapHandle,
        (lx: number, ly: number, lw: number, lh: number) => {
          mapNode.measureInWindow((mx: number, my: number) => {
            if (!lw && !lh) { setRect(null); return; }
            if (TOUR_DEBUG) setDbg(`lay x${lx | 0} y${ly | 0} w${lw | 0} h${lh | 0} | map x${mx | 0} y${my | 0} | scr ${SW | 0}x${SH | 0}`);
            setRect({ x: mx + lx, y: my + ly, w: lw, h: lh });
          });
        },
        () => {
          // Fallback to raw window measurement if measureLayout fails.
          node.measureInWindow((x: number, y: number, w: number, h: number) => {
            if (TOUR_DEBUG) setDbg(`layout FAILED — raw tgt x${x | 0} y${y | 0} | scr ${SW | 0}x${SH | 0}`);
            if (!w && !h) setRect(null);
            else setRect({ x, y, w, h });
          });
        },
      );
      return;
    }

    node.measureInWindow((x: number, y: number, w: number, h: number) => {
      if (!w && !h) setRect(null);
      else setRect({ x, y, w, h });
    });
  }, [current]);

  useEffect(() => {
    if (!visible) return;
    setRect(null);
    fade.setValue(0);
    const t = setTimeout(() => {
      measure();
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    }, 60);
    return () => clearTimeout(t);
  }, [visible, step, measure]);

  const next = () => {
    if (isLast) { onDone(); setStep(0); }
    else setStep(s => s + 1);
  };
  const back = () => setStep(s => Math.max(0, s - 1));
  const skip = () => { onDone(); setStep(0); };

  // ── Layout maths ──────────────────────────────────────────────────────────
  // Place the card below the target when it sits in the top half of the screen,
  // otherwise above it. Without a target, centre the card.
  let cardStyle: any;
  let pointer: { left: number; up: boolean } | null = null;

  if (rect) {
    const targetCx = rect.x + rect.w / 2;
    const placeBelow = rect.y + rect.h / 2 < SH * 0.46;
    const left = Math.min(Math.max(targetCx - CARD_W / 2, 16), SW - 16 - CARD_W);
    cardStyle = placeBelow
      ? { top: rect.y + rect.h + RING_PAD + POINTER + 2, left }
      : { bottom: SH - (rect.y - RING_PAD - POINTER - 2), left };
    pointer = {
      left: Math.min(Math.max(targetCx - left, 20), CARD_W - 20),
      up: placeBelow,
    };
  } else {
    cardStyle = { top: SH / 2 - 150, left: (SW - CARD_W) / 2 };
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={skip}>
      <View style={styles.dim} pointerEvents="box-none">

        {/* Highlight ring around the target */}
        {rect && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              {
                left: rect.x - RING_PAD,
                top: rect.y - RING_PAD,
                width: rect.w + RING_PAD * 2,
                height: rect.h + RING_PAD * 2,
                borderColor: current.iconColor,
                opacity: fade,
              },
            ]}
          />
        )}

        {/* Coachmark card */}
        <Animated.View style={[styles.card, cardStyle, { opacity: fade }]}>

          {/* Pointer triangle toward the target */}
          {pointer && (
            <View
              style={[
                pointer.up ? styles.pointerUp : styles.pointerDown,
                { left: pointer.left - POINTER },
              ]}
            />
          )}

          {/* Header: icon chip + step counter + skip */}
          <View style={styles.headRow}>
            <View style={[styles.iconChip, { borderColor: current.iconColor + '55', backgroundColor: current.iconColor + '1f' }]}>
              {current.image ? (
                <Image
                  source={require('../../assets/images/anchor-icon.png')}
                  style={{ width: 18, height: 18, tintColor: current.iconColor }}
                  resizeMode="contain"
                />
              ) : (
                <Ionicons name={current.icon} size={18} color={current.iconColor} />
              )}
            </View>
            <Text style={styles.stepCount}>{step + 1} / {TOUR_STEPS.length}</Text>
            <TouchableOpacity onPress={skip} hitSlop={8}>
              <Text style={styles.skipText}>SKIP</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>
          {TOUR_DEBUG && current.overMap && !!dbg && (
            <Text style={{ color: '#fbbf24', fontSize: 11, fontFamily: 'monospace' }}>{dbg}</Text>
          )}

          {/* Progress dots */}
          <View style={styles.dotsRow}>
            {TOUR_STEPS.map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>

          {/* Navigation */}
          <View style={styles.footer}>
            {step > 0 ? (
              <TouchableOpacity style={styles.backBtn} onPress={back}>
                <Ionicons name="arrow-back" size={15} color="#94a3b8" />
                <Text style={styles.backBtnText}>BACK</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <TouchableOpacity style={styles.nextBtn} onPress={next}>
              <Text style={styles.nextBtnText}>{isLast ? 'GET STARTED' : 'NEXT'}</Text>
              <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={15} color="#0a1628" />
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: 'rgba(2,6,15,0.74)',
  },
  ring: {
    position: 'absolute',
    borderRadius: 16,
    borderWidth: 2.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#fff',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  card: {
    position: 'absolute',
    width: CARD_W,
    backgroundColor: '#0f2040',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#274a86',
    gap: 9,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 12,
  },
  pointerUp: {
    position: 'absolute',
    top: -POINTER,
    width: 0,
    height: 0,
    borderLeftWidth: POINTER,
    borderRightWidth: POINTER,
    borderBottomWidth: POINTER,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#0f2040',
  },
  pointerDown: {
    position: 'absolute',
    bottom: -POINTER,
    width: 0,
    height: 0,
    borderLeftWidth: POINTER,
    borderRightWidth: POINTER,
    borderTopWidth: POINTER,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0f2040',
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCount: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  skipText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#f1f5f9',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  body: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 19,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    marginTop: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#1e3a6e',
  },
  dotActive: {
    backgroundColor: '#C9A227',
    width: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 3,
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  backBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#C9A227',
    borderRadius: 11,
    paddingVertical: 12,
  },
  nextBtnText: {
    color: '#0a1628',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
