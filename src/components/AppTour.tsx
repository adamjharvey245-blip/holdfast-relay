import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SW, height: SH } = Dimensions.get('window');

interface TourStep {
  icon: any;
  iconColor: string;
  title: string;
  body: string;
  // Approximate position of the highlight spot (used to point the callout)
  position?: 'top' | 'bottom' | 'center';
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: 'anchor',
    iconColor: '#C9A227',
    title: 'Dropping the Anchor',
    body: 'There are four ways to set your anchor position:\n\n1. Press and hold the map where the anchor is lying — a confirmation prompt will appear\n\n2. Tap the anchor button (toolbar) to enter place mode, then press and hold the map at the exact spot\n\n3. Drop at GPS — places the anchor directly beneath the boat\'s current position\n\n4. Relative position — enter a distance and bearing from the boat. Tap USE COMPASS and point your phone toward the anchor to set the bearing automatically.',
    position: 'center',
  },
  {
    icon: 'radio-button-on-outline',
    iconColor: '#10b981',
    title: 'Watch Radius',
    body: 'The green ring shows your watch radius — the boundary your boat must not cross. Tap the radius button (bottom toolbar) to adjust it with a slider. Set it to reflect your chain scope plus the boat\'s swing. Typically 1.5× your chain length.',
    position: 'center',
  },
  {
    icon: 'power',
    iconColor: '#10b981',
    title: 'Activate the Watch',
    body: 'Tap the large WATCH button at the bottom of the screen to start monitoring. The button turns red when the watch is active. The ring turns orange then red as the boat approaches or crosses the boundary.',
    position: 'bottom',
  },
  {
    icon: 'lock-closed-outline',
    iconColor: '#C9A227',
    title: 'Moving the Anchor',
    body: 'The padlock icon on the left side of the map locks the anchor in place. Tap it to unlock (it turns green) — you can then drag the anchor icon to reposition it. Tap again to lock it.',
    position: 'center',
  },
  {
    icon: 'notifications',
    iconColor: '#ef4444',
    title: 'Alarms',
    body: 'When the boat crosses the boundary, an alarm fires — sound and vibration. There are three levels: Alert (boundary reached), Emergency (well past the boundary), and GPS Lost (no signal). Each can be configured in Settings.',
    position: 'center',
  },
  {
    icon: 'alert-circle-outline',
    iconColor: '#f97316',
    title: 'Silencing Alarms',
    body: 'Tap the SILENCE button when an alarm is active to mute it for the cooldown period (default 2 minutes). The alarm will re-fire after the cooldown if the boat is still outside the zone.',
    position: 'bottom',
  },
  {
    icon: 'time-outline',
    iconColor: '#C9A227',
    title: 'GPS Track History',
    body: 'HoldFast records your GPS track for up to 4 hours. Tap the track button (bottom toolbar) to open the playback slider — scrub back through time to see exactly where the boat has been.',
    position: 'bottom',
  },
  {
    icon: 'map-outline',
    iconColor: '#94a3b8',
    title: 'Map Styles',
    body: 'Tap the map style button (bottom-left of the map) to cycle between Satellite, Standard, and Nautical Chart views. The chart overlay uses OpenSeaMap data and shows depth contours, hazards, and navigational marks.',
    position: 'center',
  },
  {
    icon: 'warning-outline',
    iconColor: '#C9A227',
    title: 'Important Limitations',
    body: 'HoldFast is a supplementary tool only. GPS accuracy varies. Alarms may not fire if the device battery dies, the app is force-closed, or iOS suspends background processes. Keep the device plugged in and do not rely solely on this app for vessel safety.',
    position: 'center',
  },
  {
    icon: 'settings-outline',
    iconColor: '#94a3b8',
    title: 'Settings',
    body: 'Access Settings from the gear icon (top right) to configure alarm thresholds, sounds, the watch radius, and to replay this tour. You can also view the full Terms of Service and Privacy Policy there.',
    position: 'top',
  },
];

interface AppTourProps {
  visible: boolean;
  onDone: () => void;
}

export function AppTour({ visible, onDone }: AppTourProps) {
  const [step, setStep] = useState(0);

  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;

  const next = () => {
    if (isLast) {
      onDone();
      setStep(0);
    } else {
      setStep(s => s + 1);
    }
  };

  const skip = () => {
    onDone();
    setStep(0);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Step counter */}
          <View style={styles.stepRow}>
            <Text style={styles.stepCount}>{step + 1} / {TOUR_STEPS.length}</Text>
            <TouchableOpacity onPress={skip}>
              <Text style={styles.skipText}>SKIP TOUR</Text>
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }]} />
          </View>

          {/* Icon */}
          <View style={[styles.iconCircle, { borderColor: current.iconColor + '66', backgroundColor: current.iconColor + '15' }]}>
            <Ionicons name={current.icon} size={32} color={current.iconColor} />
          </View>

          {/* Content */}
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.body}>{current.body}</Text>

          {/* Safety notice on last step */}
          {isLast && (
            <View style={styles.safetyBox}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#C9A227" />
              <Text style={styles.safetyText}>
                You can replay this tour at any time from Settings → About → App Tour.
              </Text>
            </View>
          )}

          {/* Navigation */}
          <View style={styles.footer}>
            {step > 0 && (
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
                <Ionicons name="arrow-back" size={16} color="#64748b" />
                <Text style={styles.backBtnText}>BACK</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, step === 0 && { flex: 1 }]}
              onPress={next}
            >
              <Text style={styles.nextBtnText}>{isLast ? 'GET STARTED' : 'NEXT'}</Text>
              <Ionicons name={isLast ? 'checkmark' : 'arrow-forward'} size={16} color="#0a1628" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#0f2040',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    width: '100%',
    maxWidth: 420,
    gap: 14,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepCount: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  skipText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: '#1e3a6e',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#C9A227',
    borderRadius: 2,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 4,
  },
  title: {
    color: '#f1f5f9',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  body: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  safetyBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#C9A22715',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#C9A22730',
  },
  safetyText: {
    color: '#C9A227',
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  backBtnText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C9A227',
    borderRadius: 12,
    paddingVertical: 14,
  },
  nextBtnText: {
    color: '#0a1628',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
