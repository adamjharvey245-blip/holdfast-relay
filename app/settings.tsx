import React, { useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  PanResponder,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { TOUR_KEY } from './onboarding';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useAnchorStore } from '@/store/anchorStore';
import { ALARM_SOUNDS, getSoundSource } from '@/config/sounds';

const EMERGENCY_MIN = 105;
const EMERGENCY_MAX = 200;

const RADIUS_MIN = 5;
const RADIUS_MAX = 200;

export default function SettingsScreen() {
  const router = useRouter();
  const {
    watchRadius,
    setWatchRadius,
    positionHistory,
    alarmThresholds,
    setAlarmThresholds,
    alarmsEnabled,
    setAlarmsEnabled,
    batteryMode,
    setBatteryMode,
    ringLabelSpacingM,
    setRingLabelSpacingM,
    trackRetentionHours,
    setTrackRetentionHours,
    isPremium,
  } = useAnchorStore();

  const historyHours = positionHistory.length > 0
    ? ((Date.now() - positionHistory[0].timestamp) / 3_600_000).toFixed(1)
    : '0';

  const { gpsLostSecs, alarmCooldownSecs, emergencyThresholdPct } = alarmThresholds;

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={14} color="#94a3b8" />
        <Text style={styles.backBtnText}>BACK</Text>
      </TouchableOpacity>

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* PREMIUM BANNER */}
        {!isPremium && (
          <TouchableOpacity style={styles.premiumBanner} onPress={() => router.push('/upgrade')}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#C9A227" />
            <View style={styles.premiumBannerText}>
              <Text style={styles.premiumBannerTitle}>Unlock Premium</Text>
              <Text style={styles.premiumBannerSub}>Custom zones, alarm sounds, GPS track & remote watch</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#C9A227" />
          </TouchableOpacity>
        )}

        {/* ALARM SETTINGS */}
        <Section title="ALARM SETTINGS">
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Text style={styles.rowLabel}>Alarms enabled</Text>
              <Text style={styles.toggleSublabel}>
                {alarmsEnabled ? 'Sound and vibration active' : 'All alarms silenced'}
              </Text>
            </View>
            <Switch
              value={alarmsEnabled}
              onValueChange={setAlarmsEnabled}
              trackColor={{ false: '#1e3a6e', true: '#10b981' }}
              thumbColor="#ffffff"
            />
          </View>
          <Text style={styles.hint}>
            Configure when alarms fire and how long to silence them.
          </Text>

          <StepRow
            label="GPS lost alarm"
            value={gpsLostSecs >= 60
              ? `${Math.floor(gpsLostSecs / 60)}m${gpsLostSecs % 60 > 0 ? ` ${gpsLostSecs % 60}s` : ''} no fix`
              : `${gpsLostSecs}s no fix`}
            onMinus={() => setAlarmThresholds({ gpsLostSecs: Math.max(30, gpsLostSecs - 30) })}
            onPlus={() => setAlarmThresholds({ gpsLostSecs: Math.min(300, gpsLostSecs + 30) })}
          />
          <StepRow
            label="Alarm silence cooldown"
            value={alarmCooldownSecs >= 60
              ? `${Math.floor(alarmCooldownSecs / 60)}m ${alarmCooldownSecs % 60 > 0 ? `${alarmCooldownSecs % 60}s` : ''}`.trim()
              : `${alarmCooldownSecs}s`}
            onMinus={() => setAlarmThresholds({ alarmCooldownSecs: Math.max(30, alarmCooldownSecs - 30) })}
            onPlus={() => setAlarmThresholds({ alarmCooldownSecs: Math.min(600, alarmCooldownSecs + 30) })}
          />

          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => setAlarmThresholds({ gpsLostSecs: 60, alarmCooldownSecs: 120, emergencyThresholdPct: 120, alertSoundKey: 'alarm', emergencySoundKey: 'alarm', gpsLostSoundKey: 'alarm', alertEnabled: true, emergencyEnabled: true, gpsLostEnabled: true })}
          >
            <Text style={styles.resetBtnText}>RESET TO DEFAULTS</Text>
          </TouchableOpacity>
        </Section>

        {/* ALARM SOUNDS */}
        <Section title="ALARM SOUNDS" locked={!isPremium} onUnlock={() => router.push('/upgrade')}>
          <Text style={styles.hint}>
            Choose a distinct sound for each alarm level. Tap the play button to preview.
          </Text>
          {isPremium && (
            <>
              <SoundPicker
                label="Alert alarm"
                sublabel="Boundary reached"
                color="#f97316"
                enabled={alarmThresholds.alertEnabled ?? true}
                onToggle={(v) => setAlarmThresholds({ alertEnabled: v })}
                selectedKey={alarmThresholds.alertSoundKey ?? 'alarm'}
                onChange={(key) => setAlarmThresholds({ alertSoundKey: key })}
              />
              <SoundPicker
                label="Emergency alarm"
                sublabel="Well past boundary"
                color="#ef4444"
                enabled={alarmThresholds.emergencyEnabled ?? true}
                onToggle={(v) => setAlarmThresholds({ emergencyEnabled: v })}
                selectedKey={alarmThresholds.emergencySoundKey ?? 'alarm'}
                onChange={(key) => setAlarmThresholds({ emergencySoundKey: key })}
              />
              <SoundPicker
                label="GPS lost alarm"
                sublabel="No fix detected"
                color="#a855f7"
                enabled={alarmThresholds.gpsLostEnabled ?? true}
                onToggle={(v) => setAlarmThresholds({ gpsLostEnabled: v })}
                selectedKey={alarmThresholds.gpsLostSoundKey ?? 'alarm'}
                onChange={(key) => setAlarmThresholds({ gpsLostSoundKey: key })}
              />
            </>
          )}
        </Section>

        {/* WATCH RADIUS */}
        <Section title="WATCH RADIUS">
          <Text style={styles.hint}>
            Default radius used when you drop anchor. You can also adjust it live from the main screen.
          </Text>
          <RadiusSlider
            value={watchRadius}
            onChange={setWatchRadius}
          />
        </Section>

        {/* ALARM ESCALATION */}
        <Section title="ALARM ESCALATION">
          <Text style={styles.hint}>
            Alert fires when the boat leaves the radius. Emergency fires when it drifts further past — adjust the trigger point below.
          </Text>

          <EmergencySlider
            value={emergencyThresholdPct ?? 120}
            onChange={(v) => setAlarmThresholds({ emergencyThresholdPct: v })}
          />

          <View style={styles.escalationLegend}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#10b981' }]} />
              <Text style={styles.legendText}>Safe — inside radius</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#f97316' }]} />
              <Text style={styles.legendText}>Alert — outside radius</Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.legendText}>
                Emergency — past {emergencyThresholdPct ?? 120}% of radius
              </Text>
            </View>
          </View>
        </Section>

        {/* GPS & BATTERY */}
        <Section title="GPS & BATTERY" locked={!isPremium} onUnlock={() => router.push('/upgrade')}>
          <Text style={styles.hint}>
            Precision mode uses all available sensors for the most stable GPS lock. Standard mode uses the GPS chip only — lower power, still high accuracy. Change only if your device is struggling with battery overnight.
          </Text>
          {isPremium && (
            <>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modeBtn, batteryMode === 'precision' && styles.modeBtnActive]}
                  onPress={() => setBatteryMode('precision')}
                >
                  <Ionicons name="navigate" size={18} color={batteryMode === 'precision' ? '#0a1628' : '#475569'} />
                  <Text style={[styles.modeBtnTitle, batteryMode === 'precision' && styles.modeBtnTitleActive]}>Precision</Text>
                  <Text style={[styles.modeBtnSub, batteryMode === 'precision' && styles.modeBtnSubActive]}>GPS + sensors{'\n'}Updates every 6s / 10s</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, batteryMode === 'standard' && styles.modeBtnActive]}
                  onPress={() => setBatteryMode('standard')}
                >
                  <Ionicons name="battery-half" size={18} color={batteryMode === 'standard' ? '#0a1628' : '#475569'} />
                  <Text style={[styles.modeBtnTitle, batteryMode === 'standard' && styles.modeBtnTitleActive]}>Standard</Text>
                  <Text style={[styles.modeBtnSub, batteryMode === 'standard' && styles.modeBtnSubActive]}>GPS only{'\n'}Updates every 10s / 15s</Text>
                </TouchableOpacity>
              </View>
              {batteryMode === 'standard' && (
                <View style={styles.modeWarning}>
                  <Ionicons name="warning-outline" size={14} color="#f97316" />
                  <Text style={styles.modeWarningText}>
                    Standard mode is only suitable for open anchorages with a watch radius above 30m.
                  </Text>
                </View>
              )}
            </>
          )}
        </Section>

        {/* GPS TRACK */}
        <Section title="GPS TRACK" locked={!isPremium} onUnlock={() => router.push('/upgrade')}>
          <Text style={styles.hint}>
            {isPremium
              ? 'How long GPS history is stored. The track on the map colours by age in 4-hour bands.'
              : 'GPS track history is a premium feature. Upgrade to record your position throughout the night.'}
          </Text>
          {isPremium && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Track retention</Text>
                <Text style={styles.rowValue}>{trackRetentionHours ?? 4} hours</Text>
              </View>
              <View style={styles.presetRow}>
                {([2, 4, 12, 24] as const).map((h) => (
                  <TouchableOpacity
                    key={h}
                    style={[styles.preset, (trackRetentionHours ?? 4) === h && styles.presetActive]}
                    onPress={() => setTrackRetentionHours(h)}
                  >
                    <Text style={[styles.presetText, (trackRetentionHours ?? 4) === h && styles.presetTextActive]}>
                      {h}h
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <InfoRow label="History points" value={`${positionHistory.length} fixes`} />
              <InfoRow label="Track duration" value={`${historyHours} hours`} />
            </>
          )}
        </Section>

        {/* MAP DISPLAY */}
        <Section title="MAP DISPLAY">
          <Text style={styles.hint}>
            Fixed distance rings are always shown on the map at multiples of the spacing below, regardless of your watch radius.
          </Text>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Ring label spacing</Text>
            <Text style={styles.rowValue}>{ringLabelSpacingM ?? 10}m</Text>
          </View>
          <View style={styles.presetRow}>
            {[5, 10, 15, 20, 25, 50].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.preset, (ringLabelSpacingM ?? 10) === s && styles.presetActive]}
                onPress={() => setRingLabelSpacingM(s)}
              >
                <Text style={[styles.presetText, (ringLabelSpacingM ?? 10) === s && styles.presetTextActive]}>
                  {s}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Section>

        {/* ABOUT */}
        <Section title="ABOUT">
          <InfoRow label="App" value="HoldFast Anchor Alarm" />
          <InfoRow label="Version" value="1.0.0 (build 25)" />
          <InfoRow label="GPS formula" value="Haversine (great-circle)" />
          <InfoRow label="Background GPS" value="Expo Location task manager" />
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={async () => {
              await AsyncStorage.removeItem(TOUR_KEY);
              Alert.alert('Tour Reset', 'The guided tour will show on next app launch.');
            }}
          >
            <Text style={styles.resetBtnText}>REPLAY APP TOUR</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resetBtn}
            onPress={() => Linking.openURL('https://www.anchoralarm.app/privacy')}
          >
            <Text style={styles.resetBtnText}>PRIVACY POLICY</Text>
          </TouchableOpacity>
          {!isPremium && (
            <TouchableOpacity
              style={[styles.resetBtn, { borderColor: '#C9A22744' }]}
              onPress={() => router.push('/upgrade')}
            >
              <Text style={[styles.resetBtnText, { color: '#C9A227' }]}>UNLOCK PREMIUM</Text>
            </TouchableOpacity>
          )}
        </Section>

      </ScrollView>
    </View>
  );
}

// ─── Watch Radius Slider ──────────────────────────────────────────────────────

function RadiusSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const twRef = useRef(0);

  const pct = Math.max(0, Math.min(1, (value - RADIUS_MIN) / (RADIUS_MAX - RADIUS_MIN)));
  const fillW = trackWidth * pct;
  const thumbL = Math.max(0, Math.min(trackWidth - 24, fillW - 12));

  const scrub = (x: number) => {
    if (twRef.current === 0) return;
    const clamped = Math.max(0, Math.min(twRef.current, x));
    onChange(Math.round(RADIUS_MIN + (clamped / twRef.current) * (RADIUS_MAX - RADIUS_MIN)));
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => scrub(e.nativeEvent.locationX),
    onPanResponderMove: (e) => scrub(e.nativeEvent.locationX),
  })).current;

  return (
    <View style={sliderStyles.wrapper}>
      <View style={sliderStyles.valueRow}>
        <Text style={sliderStyles.valueText}>{value}m radius</Text>
        <Text style={sliderStyles.rangeText}>{RADIUS_MIN}m — {RADIUS_MAX}m</Text>
      </View>
      <View
        style={sliderStyles.track}
        onLayout={(e) => { twRef.current = e.nativeEvent.layout.width; setTrackWidth(e.nativeEvent.layout.width); }}
        {...pan.panHandlers}
      >
        <View style={[sliderStyles.fill, { width: fillW }]} />
        <View style={[sliderStyles.thumb, { left: thumbL }]} />
      </View>
      <View style={sliderStyles.stepRow}>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.max(RADIUS_MIN, value - 10))}>
          <Text style={sliderStyles.stepBtnText}>−10m</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.max(RADIUS_MIN, value - 1))}>
          <Text style={sliderStyles.stepBtnText}>−1m</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.min(RADIUS_MAX, value + 1))}>
          <Text style={sliderStyles.stepBtnText}>+1m</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.min(RADIUS_MAX, value + 10))}>
          <Text style={sliderStyles.stepBtnText}>+10m</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Emergency Threshold Slider ───────────────────────────────────────────────

function EmergencySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const twRef = useRef(0);

  const pct = Math.max(0, Math.min(1, (value - EMERGENCY_MIN) / (EMERGENCY_MAX - EMERGENCY_MIN)));
  const fillW = trackWidth * pct;
  const thumbL = Math.max(0, Math.min(trackWidth - 24, fillW - 12));

  const scrub = (x: number) => {
    if (twRef.current === 0) return;
    const clamped = Math.max(0, Math.min(twRef.current, x));
    onChange(Math.round(EMERGENCY_MIN + (clamped / twRef.current) * (EMERGENCY_MAX - EMERGENCY_MIN)));
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => scrub(e.nativeEvent.locationX),
    onPanResponderMove: (e) => scrub(e.nativeEvent.locationX),
  })).current;

  return (
    <View style={sliderStyles.wrapper}>
      <View style={sliderStyles.valueRow}>
        <Text style={[sliderStyles.valueText, { color: '#ef4444' }]}>
          Emergency at {value}% of radius
        </Text>
        <Text style={sliderStyles.rangeText}>{EMERGENCY_MIN}% — {EMERGENCY_MAX}%</Text>
      </View>
      <View
        style={[sliderStyles.track, sliderStyles.trackEmergency]}
        onLayout={(e) => { twRef.current = e.nativeEvent.layout.width; setTrackWidth(e.nativeEvent.layout.width); }}
        {...pan.panHandlers}
      >
        <View style={[sliderStyles.fill, sliderStyles.fillEmergency, { width: fillW }]} />
        <View style={[sliderStyles.thumb, sliderStyles.thumbEmergency, { left: thumbL }]} />
      </View>
      <View style={sliderStyles.stepRow}>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.max(EMERGENCY_MIN, value - 5))}>
          <Text style={sliderStyles.stepBtnText}>−5%</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.max(EMERGENCY_MIN, value - 1))}>
          <Text style={sliderStyles.stepBtnText}>−1%</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.min(EMERGENCY_MAX, value + 1))}>
          <Text style={sliderStyles.stepBtnText}>+1%</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sliderStyles.stepBtn} onPress={() => onChange(Math.min(EMERGENCY_MAX, value + 5))}>
          <Text style={sliderStyles.stepBtnText}>+5%</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  wrapper: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, gap: 10 },
  valueRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valueText: { color: '#C9A227', fontSize: 15, fontWeight: '700' },
  rangeText: { color: '#94a3b8', fontSize: 11 },
  track: {
    height: 8, borderRadius: 4, backgroundColor: '#162d57',
    position: 'relative', justifyContent: 'center',
  },
  trackEmergency: { backgroundColor: '#1a1010' },
  fill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: '#C9A227', borderRadius: 4,
  },
  fillEmergency: { backgroundColor: '#ef4444' },
  thumb: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#C9A227', borderWidth: 3, borderColor: '#0a1628',
    top: -8,
  },
  thumbEmergency: { backgroundColor: '#ef4444' },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#162d57', alignItems: 'center',
    borderWidth: 1, borderColor: '#1e3a6e',
  },
  stepBtnText: { color: '#e2e8f0', fontSize: 12, fontWeight: '700' },
});


// ─── Sound Picker ─────────────────────────────────────────────────────────────

function SoundPicker({
  label, sublabel, color, enabled, onToggle, selectedKey, onChange,
}: {
  label: string;
  sublabel: string;
  color: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  selectedKey: string;
  onChange: (key: string) => void;
}) {
  const [previewing, setPreviewing] = useState(false);
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  const currentIndex = ALARM_SOUNDS.findIndex(s => s.key === selectedKey);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const current = ALARM_SOUNDS[safeIndex];

  const prev = () => onChange(ALARM_SOUNDS[(safeIndex - 1 + ALARM_SOUNDS.length) % ALARM_SOUNDS.length].key);
  const next = () => onChange(ALARM_SOUNDS[(safeIndex + 1) % ALARM_SOUNDS.length].key);

  const preview = async () => {
    if (previewing) return;
    setPreviewing(true);
    try {
      await previewSoundRef.current?.unloadAsync().catch(() => {});
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
      const { sound } = await Audio.Sound.createAsync(
        getSoundSource(selectedKey),
        { isLooping: false, volume: 1.0 }
      );
      previewSoundRef.current = sound;
      await sound.playAsync();
      // Auto-stop after 3 seconds
      setTimeout(async () => {
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
        previewSoundRef.current = null;
        setPreviewing(false);
      }, 3000);
    } catch (e) {
      console.warn('[SoundPicker] preview failed:', e);
      setPreviewing(false);
    }
  };

  return (
    <View style={soundStyles.outerRow}>
      {/* Top row: label + toggle */}
      <View style={soundStyles.topRow}>
        <View style={soundStyles.labelCol}>
          <Text style={[soundStyles.label, !enabled && soundStyles.labelDisabled]}>{label}</Text>
          <Text style={soundStyles.sublabel}>{sublabel}</Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: '#1e3a6e', true: color + 'aa' }}
          thumbColor={enabled ? color : '#475569'}
        />
      </View>
      {/* Sound picker row — dimmed when disabled */}
      {enabled && (
        <View style={soundStyles.controls}>
          <TouchableOpacity style={soundStyles.arrowBtn} onPress={prev}>
            <Ionicons name="chevron-back" size={18} color="#94a3b8" />
          </TouchableOpacity>
          <Text style={[soundStyles.soundName, { color }]}>{current.label}</Text>
          <TouchableOpacity style={soundStyles.arrowBtn} onPress={next}>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[soundStyles.previewBtn, previewing && soundStyles.previewBtnActive]}
            onPress={preview}
            disabled={previewing}
          >
            <Ionicons
              name={previewing ? 'volume-high' : 'play-circle-outline'}
              size={22}
              color={previewing ? color : '#64748b'}
            />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const soundStyles = StyleSheet.create({
  outerRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#162d57',
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  labelCol: { flex: 1 },
  label: { color: '#e2e8f0', fontSize: 13 },
  labelDisabled: { color: '#334155' },
  sublabel: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 2,
  },
  arrowBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#162d57',
    alignItems: 'center', justifyContent: 'center',
  },
  soundName: {
    fontSize: 13, fontWeight: '700', minWidth: 64,
    textAlign: 'center',
  },
  previewBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  previewBtnActive: {
    backgroundColor: '#1e3a6e',
  },
});

// ─── Reusable components ──────────────────────────────────────────────────────

function Section({ title, children, locked, onUnlock }: {
  title: string;
  children: React.ReactNode;
  locked?: boolean;
  onUnlock?: () => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {locked && (
          <View style={styles.sectionLockBadge}>
            <Ionicons name="lock-closed" size={11} color="#C9A227" />
            <Text style={styles.sectionLockText}>PREMIUM</Text>
          </View>
        )}
      </View>
      <View style={styles.sectionBody}>{children}</View>
      {locked && (
        <TouchableOpacity style={styles.sectionUnlockBtn} onPress={onUnlock}>
          <Ionicons name="lock-open-outline" size={14} color="#0a1628" />
          <Text style={styles.sectionUnlockBtnText}>UNLOCK THIS FEATURE</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function StepRow({
  label, value, onMinus, onPlus,
}: {
  label: string; value: string; onMinus: () => void; onPlus: () => void;
}) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepRowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value}</Text>
      </View>
      <View style={styles.stepBtns}>
        <TouchableOpacity style={styles.stepBtn} onPress={onMinus}>
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.stepBtn} onPress={onPlus}>
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a1628' },
  backBtn: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1e3a6e',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  backBtnText: {
    color: '#e2e8f0', fontSize: 12, fontWeight: '700', letterSpacing: 1,
  },
  container: { flex: 1, backgroundColor: '#0a1628' },
  content: { padding: 16, gap: 16, paddingBottom: 40 },

  section: {
    backgroundColor: '#0f2040', borderRadius: 12,
    overflow: 'hidden', borderWidth: 1, borderColor: '#1e3a6e',
  },
  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#1e3a6e',
  },
  sectionTitle: {
    color: '#94a3b8', fontSize: 10, fontWeight: '800', letterSpacing: 2,
  },
  sectionLockBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#C9A22715', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#C9A22733',
  },
  sectionLockText: { color: '#C9A227', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  sectionUnlockBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    margin: 12, marginTop: 4, paddingVertical: 13, borderRadius: 10,
    backgroundColor: '#C9A227',
  },
  sectionUnlockBtnText: { color: '#0a1628', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  sectionBody: { padding: 4 },
  premiumBanner: {
    backgroundColor: '#0f2040', borderRadius: 12,
    borderWidth: 1, borderColor: '#C9A22744',
    padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  premiumBannerText: { flex: 1 },
  premiumBannerTitle: { color: '#C9A227', fontSize: 13, fontWeight: '800' },
  premiumBannerSub: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  hint: {
    color: '#94a3b8', fontSize: 11, lineHeight: 16,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#162d57',
  },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#162d57',
  },
  rowLabel: { color: '#e2e8f0', fontSize: 13 },
  rowValue: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  stepRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#162d57',
  },
  stepRowLeft: { flex: 1 },
  stepBtns: { flexDirection: 'row', gap: 6 },
  stepBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#162d57', borderWidth: 1, borderColor: '#1e3a6e',
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { color: '#ffffff', fontSize: 18, lineHeight: 22 },

  modeRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#162d57',
  },
  modeBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    backgroundColor: '#162d57',
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: '#C9A227',
    borderColor: '#C9A227',
  },
  modeBtnTitle: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modeBtnTitleActive: { color: '#0a1628' },
  modeBtnSub: {
    color: '#94a3b8',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 14,
  },
  modeBtnSubActive: { color: '#0a1628aa' },
  modeWarning: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    margin: 12,
    marginTop: 0,
    backgroundColor: '#f9731615',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f9731630',
  },
  modeWarningText: {
    color: '#f97316',
    fontSize: 12,
    lineHeight: 17,
    flex: 1,
  },

  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#162d57',
  },
  toggleLeft: { flex: 1 },
  toggleSublabel: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  resetBtn: {
    margin: 12, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#334155', alignItems: 'center',
  },
  resetBtnText: { color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  preset: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#162d57', borderWidth: 1, borderColor: '#1e3a6e',
  },
  presetActive: { backgroundColor: '#C9A22722', borderColor: '#C9A227' },
  presetText: { color: '#94a3b8', fontSize: 13 },
  presetTextActive: { color: '#C9A227', fontWeight: '700' },

  escalationLegend: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: '#94a3b8', fontSize: 12 },
});
