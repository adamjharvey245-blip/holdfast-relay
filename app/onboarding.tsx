import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_KEY = 'holdfast_onboarding_done';
export const TOUR_KEY = 'holdfast_tour_done';

type Step = 0 | 1 | 2 | 3 | 4;
const STEPS: Step[] = [0, 1, 2, 3, 4];

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [tosScrolled, setTosScrolled] = useState(false);
  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [notifGranted, setNotifGranted] = useState<boolean | null>(null);

  const handleRequestLocation = async () => {
    try {
      const fg = await Location.requestForegroundPermissionsAsync();
      if (fg.status === 'granted') {
        const bg = await Location.requestBackgroundPermissionsAsync();
        setLocationGranted(bg.status === 'granted');
      } else {
        setLocationGranted(false);
      }
    } catch {
      setLocationGranted(false);
    }
  };

  const handleRequestNotifications = async () => {
    try {
      const result = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
      setNotifGranted(result.status === 'granted');
    } catch {
      setNotifGranted(false);
    }
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    router.replace('/');
  };

  const canAdvance = () => {
    if (step === 1) return tosAccepted;
    if (step === 2) return locationGranted !== null;
    if (step === 3) return notifGranted !== null;
    return true;
  };

  const advance = () => {
    if (step < 4) setStep((step + 1) as Step);
    else handleFinish();
  };

  return (
    <View style={styles.screen}>
      {/* Progress dots */}
      <View style={styles.progress}>
        {STEPS.map((s) => (
          <View
            key={s}
            style={[styles.dot, s === step && styles.dotActive, s < step && styles.dotDone]}
          />
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 && <StepWelcome />}
        {step === 1 && (
          <StepToS
            accepted={tosAccepted}
            scrolled={tosScrolled}
            onScrolled={() => setTosScrolled(true)}
            onAccept={() => setTosAccepted(true)}
          />
        )}
        {step === 2 && (
          <StepLocation granted={locationGranted} onRequest={handleRequestLocation} />
        )}
        {step === 3 && (
          <StepNotifications granted={notifGranted} onRequest={handleRequestNotifications} />
        )}
        {step === 4 && <StepReady />}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
          onPress={advance}
          disabled={!canAdvance()}
        >
          <Text style={styles.nextBtnText}>
            {step === 4 ? 'START WATCHING' : 'CONTINUE'}
          </Text>
          <Ionicons name="arrow-forward" size={16} color="#0a1628" />
        </TouchableOpacity>

        {step < 4 && step > 1 && (
          <TouchableOpacity style={styles.skipBtn} onPress={advance}>
            <Text style={styles.skipBtnText}>SKIP FOR NOW</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Step 0: Welcome ──────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <View style={styles.stepContent}>
      <Image
        source={require('../assets/images/logo-landscape-long.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.appName}>HOLDFAST</Text>
      <Text style={styles.tagline}>Anchor Alarm</Text>

      <View style={styles.divider} />

      <Text style={styles.intro}>
        HoldFast monitors your anchor position and wakes you the moment your boat starts to drag.
      </Text>

      <View style={styles.featureList}>
        <Feature icon="anchor" text="Drop anchor and set a watch radius" />
        <Feature icon="notifications" text="Loud alarm when you leave the zone" />
        <Feature icon="time-outline" text="GPS history so you can replay drift" />
        <Feature icon="navigate-outline" text="Nautical chart overlay" />
        <Feature icon="wifi-outline" text="Remote watch for crew ashore" />
      </View>

      <View style={styles.warningCard}>
        <Ionicons name="warning-outline" size={16} color="#C9A227" />
        <Text style={styles.warningText}>
          HoldFast is a supplementary safety tool only. Never rely solely on any app for vessel safety.
        </Text>
      </View>
    </View>
  );
}

// ─── Step 1: Terms of Service ─────────────────────────────────────────────────

function StepToS({
  accepted,
  scrolled,
  onScrolled,
  onAccept,
}: {
  accepted: boolean;
  scrolled: boolean;
  onScrolled: () => void;
  onAccept: () => void;
}) {
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - 40) {
      onScrolled();
    }
  };

  return (
    <View style={styles.stepContent}>
      <View style={styles.iconCircle}>
        <Ionicons name="document-text-outline" size={36} color="#C9A227" />
      </View>

      <Text style={styles.stepTitle}>Terms of Service</Text>
      <Text style={styles.stepBody}>
        Please read the following carefully before using HoldFast. You must scroll to the bottom and accept to continue.
      </Text>

      <ScrollView
        style={tosStyles.scroll}
        onScroll={handleScroll}
        scrollEventThrottle={100}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        <Text style={tosStyles.sectionHead}>1. Supplementary Tool Only</Text>
        <Text style={tosStyles.body}>
          HoldFast is designed as a supplementary aid to seamanship. It does not replace proper anchor watches, professional navigation equipment, or the judgement of a competent mariner. You must maintain an appropriate anchor watch by all available means at all times.
        </Text>

        <Text style={tosStyles.sectionHead}>2. No Warranty</Text>
        <Text style={tosStyles.body}>
          HoldFast is provided "as is" without any warranty of accuracy, reliability, or fitness for a particular purpose. GPS accuracy can vary significantly depending on device hardware, satellite availability, atmospheric conditions, and local obstructions. Device sleep states, background app restrictions, low battery, and loss of connectivity can all prevent or delay alarms. You must not rely solely on HoldFast for vessel safety.
        </Text>

        <Text style={tosStyles.sectionHead}>3. Assumption of Risk</Text>
        <Text style={tosStyles.body}>
          By using HoldFast you acknowledge and accept that all digital alarm systems can fail. You assume full responsibility for your vessel's safety and accept all risks associated with anchoring, including but not limited to anchor drag, collision, grounding, and property damage or personal injury arising therefrom.
        </Text>

        <Text style={tosStyles.sectionHead}>4. Limitation of Liability</Text>
        <Text style={tosStyles.body}>
          To the maximum extent permitted by applicable law, the developer of HoldFast shall not be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising from your use of the app, including any loss or damage to your vessel, property, or injury to persons. Where liability cannot be excluded by law, it is limited to the amount you paid for the application (which may be zero).
        </Text>

        <Text style={tosStyles.sectionHead}>5. Indemnification</Text>
        <Text style={tosStyles.body}>
          You agree to indemnify, defend, and hold harmless the developer of HoldFast and any associated parties from and against any claims, losses, damages, liabilities, costs, and expenses (including legal fees) arising from your use of the app or any breach of these terms.
        </Text>

        <Text style={tosStyles.sectionHead}>6. Known Failure Conditions</Text>
        <Text style={tosStyles.body}>
          You acknowledge that the following conditions may prevent alarms from firing:{'\n\n'}
          • Device battery depletion{'\n'}
          • iOS or Android background app suspension{'\n'}
          • Loss of GPS signal (tunnels, below deck, urban canyons){'\n'}
          • Device in low-power or aeroplane mode{'\n'}
          • Do Not Disturb or Focus mode active{'\n'}
          • App force-closed by the user or operating system{'\n\n'}
          You are responsible for ensuring your device remains powered, connected, and configured to allow HoldFast to operate.
        </Text>

        <Text style={tosStyles.sectionHead}>7. Privacy</Text>
        <Text style={tosStyles.body}>
          HoldFast collects GPS location data solely on your device to calculate anchor position and distance. No location data is transmitted to any server unless you explicitly enable the Remote Watch feature, in which case your position is relayed temporarily to a server for the purpose of sharing with authorised watchers. No location data is stored by the developer, sold, or shared with third parties. You may view the full Privacy Policy in Settings.
        </Text>

        <Text style={tosStyles.sectionHead}>8. Governing Law</Text>
        <Text style={tosStyles.body}>
          These terms are governed by and construed in accordance with the laws of New South Wales, Australia. Any dispute arising under these terms shall be subject to the exclusive jurisdiction of the courts of New South Wales.
        </Text>

        <Text style={tosStyles.sectionHead}>9. Changes to These Terms</Text>
        <Text style={tosStyles.body}>
          These terms may be updated from time to time. Continued use of HoldFast after any update constitutes acceptance of the revised terms.
        </Text>

        <View style={tosStyles.endSpacer} />
      </ScrollView>

      {scrolled && !accepted && (
        <TouchableOpacity style={tosStyles.acceptBtn} onPress={onAccept}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#0a1628" />
          <Text style={tosStyles.acceptBtnText}>I HAVE READ AND AGREE TO THE TERMS</Text>
        </TouchableOpacity>
      )}

      {accepted && (
        <View style={styles.grantedBadge}>
          <Ionicons name="checkmark-circle" size={18} color="#10b981" />
          <Text style={styles.grantedText}>Terms accepted</Text>
        </View>
      )}

      {!scrolled && (
        <View style={tosStyles.scrollHint}>
          <Ionicons name="arrow-down-outline" size={14} color="#475569" />
          <Text style={tosStyles.scrollHintText}>Scroll to read all terms before accepting</Text>
        </View>
      )}
    </View>
  );
}

// ─── Step 2: Location ─────────────────────────────────────────────────────────

function StepLocation({ granted, onRequest }: { granted: boolean | null; onRequest: () => void }) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.iconCircle}>
        <Ionicons name="location" size={36} color="#C9A227" />
      </View>

      <Text style={styles.stepTitle}>Always-On Location</Text>
      <Text style={styles.stepBody}>
        HoldFast needs your location <Text style={styles.bold}>even when the screen is off</Text>.
        This is how the alarm fires at 3am when you're asleep below deck.
      </Text>

      <View style={styles.permBox}>
        <Text style={styles.permBoxTitle}>WHAT TO EXPECT</Text>
        <View style={styles.permItem}>
          <Ionicons name="checkmark-circle" size={16} color="#10b981" />
          <Text style={styles.permItemText}>iOS: tap "Allow While Using App", then "Change to Always Allow"</Text>
        </View>
        <View style={styles.permItem}>
          <Ionicons name="checkmark-circle" size={16} color="#10b981" />
          <Text style={styles.permItemText}>Android: choose "Allow all the time" (not just "while using")</Text>
        </View>
        <View style={styles.permItem}>
          <Ionicons name="information-circle-outline" size={16} color="#C9A227" />
          <Text style={styles.permItemText}>A blue bar will appear in iOS when HoldFast is tracking in the background — this is expected</Text>
        </View>
      </View>

      {granted === null && (
        <TouchableOpacity style={styles.permBtn} onPress={onRequest}>
          <Ionicons name="location-outline" size={18} color="#0a1628" />
          <Text style={styles.permBtnText}>GRANT LOCATION ACCESS</Text>
        </TouchableOpacity>
      )}

      {granted === true && (
        <View style={styles.grantedBadge}>
          <Ionicons name="checkmark-circle" size={18} color="#10b981" />
          <Text style={styles.grantedText}>Location access granted</Text>
        </View>
      )}

      {granted === false && (
        <View style={styles.deniedCard}>
          <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
          <Text style={styles.deniedText}>
            Location denied. Open Settings → Privacy → Location Services → HoldFast and set to "Always".
            The alarm will not fire in the background without this.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Step 3: Notifications ────────────────────────────────────────────────────

function StepNotifications({ granted, onRequest }: { granted: boolean | null; onRequest: () => void }) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.iconCircle}>
        <Ionicons name="notifications" size={36} color="#C9A227" />
      </View>

      <Text style={styles.stepTitle}>Alarm Notifications</Text>
      <Text style={styles.stepBody}>
        HoldFast uses <Text style={styles.bold}>Critical Alerts</Text> on iOS — these bypass Silent Mode and Do Not Disturb entirely, playing at full volume even when your phone is muted.
      </Text>

      <View style={styles.permBox}>
        <Text style={styles.permBoxTitle}>ALARM LEVELS</Text>
        <View style={styles.permItem}>
          <View style={[styles.levelDot, { backgroundColor: '#f97316' }]} />
          <Text style={styles.permItemText}>Alert — boat has reached the boundary</Text>
        </View>
        <View style={styles.permItem}>
          <View style={[styles.levelDot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.permItemText}>Emergency — boat is well past the boundary or GPS lost</Text>
        </View>
      </View>

      {granted === null && (
        <TouchableOpacity style={styles.permBtn} onPress={onRequest}>
          <Ionicons name="notifications-outline" size={18} color="#0a1628" />
          <Text style={styles.permBtnText}>ENABLE ALARM NOTIFICATIONS</Text>
        </TouchableOpacity>
      )}

      {granted === true && (
        <View style={styles.grantedBadge}>
          <Ionicons name="checkmark-circle" size={18} color="#10b981" />
          <Text style={styles.grantedText}>Notifications enabled</Text>
        </View>
      )}

      {granted === false && (
        <View style={styles.deniedCard}>
          <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
          <Text style={styles.deniedText}>
            Notifications denied. Open Settings → Notifications → HoldFast and enable them.
            You will not receive alarm alerts without this.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Step 4: Ready ────────────────────────────────────────────────────────────

function StepReady() {
  return (
    <View style={styles.stepContent}>
      <View style={[styles.iconCircle, styles.iconCircleGreen]}>
        <Ionicons name="anchor" size={36} color="#10b981" />
      </View>

      <Text style={styles.stepTitle}>You're Ready</Text>
      <Text style={styles.stepBody}>
        Three things to remember before your first night at anchor:
      </Text>

      <View style={styles.tipList}>
        <Tip
          number="1"
          title="Keep the phone plugged in"
          body="Overnight GPS monitoring is power-hungry. Connect to a power bank or the ship's 12V USB supply."
        />
        <Tip
          number="2"
          title="Set the radius after you've swung"
          body="Drop anchor, let the chain out, then set your watch radius. It should reflect how far the boat can swing — typically 1.5× your chain scope."
        />
        <Tip
          number="3"
          title="Disable battery optimisation"
          body={Platform.OS === 'android'
            ? 'Android may suspend the app in the background. Go to Settings → Battery → HoldFast and set to "Unrestricted".'
            : 'iOS handles background location automatically once "Always" permission is granted.'}
        />
        <Tip
          number="4"
          title="Keep the phone cool"
          body="Running GPS at high precision generates heat. If the phone overheats, iOS will throttle or disable the GPS chip. Do not leave the phone in direct sunlight, sealed in a bag, or under a pillow while charging. A shaded, ventilated spot is best."
        />
      </View>

      <View style={styles.warningCard}>
        <Ionicons name="warning-outline" size={16} color="#C9A227" />
        <Text style={styles.warningText}>
          A guided tour of the app will launch automatically on first open. You can replay it from Settings at any time.
        </Text>
      </View>
    </View>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function Feature({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons name={icon} size={18} color="#C9A227" />
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

function Tip({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.tip}>
      <View style={styles.tipNum}>
        <Text style={styles.tipNumText}>{number}</Text>
      </View>
      <View style={styles.tipBody}>
        <Text style={styles.tipTitle}>{title}</Text>
        <Text style={styles.tipText}>{body}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const tosStyles = StyleSheet.create({
  scroll: {
    maxHeight: 320,
    backgroundColor: '#04080f',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    padding: 14,
  },
  sectionHead: {
    color: '#C9A227',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  body: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 18,
  },
  endSpacer: { height: 20 },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C9A227',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
  },
  acceptBtnText: {
    color: '#0a1628',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  scrollHintText: {
    color: '#475569',
    fontSize: 11,
  },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a1628' },

  progress: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingTop: 60,
    paddingBottom: 8,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: '#1e3a6e',
  },
  dotActive: { backgroundColor: '#C9A227', width: 24 },
  dotDone: { backgroundColor: '#C9A22788' },

  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 16 },

  stepContent: { gap: 20 },

  // Welcome step
  logo: { width: 280, height: 80, alignSelf: 'center', marginTop: 8 },
  appName: {
    color: '#C9A227', fontSize: 28, fontWeight: '800',
    letterSpacing: 6, textAlign: 'center',
  },
  tagline: {
    color: '#64748b', fontSize: 13, fontWeight: '600',
    letterSpacing: 3, textAlign: 'center', marginTop: -12,
  },
  divider: {
    height: 1, backgroundColor: '#1e3a6e', marginVertical: 4,
  },
  intro: {
    color: '#94a3b8', fontSize: 15, lineHeight: 24, textAlign: 'center',
  },
  featureList: { gap: 12 },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#0f2040', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#1e3a6e',
  },
  featureText: { color: '#f1f5f9', fontSize: 14, flex: 1 },
  warningCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#C9A22715', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#C9A22740',
  },
  warningText: { color: '#C9A227', fontSize: 12, lineHeight: 18, flex: 1 },

  // Permission steps
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#C9A22720', borderWidth: 2, borderColor: '#C9A227',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginTop: 8,
  },
  iconCircleGreen: {
    backgroundColor: '#10b98120', borderColor: '#10b981',
  },
  stepTitle: {
    color: '#f1f5f9', fontSize: 22, fontWeight: '800',
    textAlign: 'center', letterSpacing: 0.5,
  },
  stepBody: {
    color: '#94a3b8', fontSize: 14, lineHeight: 22, textAlign: 'center',
  },
  bold: { color: '#f1f5f9', fontWeight: '700' },
  permBox: {
    backgroundColor: '#0f2040', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#1e3a6e', gap: 10,
  },
  permBoxTitle: {
    color: '#475569', fontSize: 10, fontWeight: '800', letterSpacing: 2,
    marginBottom: 2,
  },
  permItem: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  permItemText: { color: '#94a3b8', fontSize: 13, lineHeight: 19, flex: 1 },
  levelDot: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  permBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#C9A227', borderRadius: 12,
    paddingVertical: 16, gap: 10,
  },
  permBtnText: {
    color: '#0a1628', fontSize: 14, fontWeight: '800', letterSpacing: 1,
  },
  grantedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#10b98120', borderRadius: 12,
    paddingVertical: 14, borderWidth: 1, borderColor: '#10b98140',
  },
  grantedText: { color: '#10b981', fontSize: 14, fontWeight: '700' },
  deniedCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#ef444415', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#ef444430',
  },
  deniedText: { color: '#ef4444', fontSize: 12, lineHeight: 18, flex: 1 },

  // Ready step
  tipList: { gap: 12 },
  tip: {
    flexDirection: 'row', gap: 14, alignItems: 'flex-start',
    backgroundColor: '#0f2040', borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: '#1e3a6e',
  },
  tipNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#C9A22720', borderWidth: 1, borderColor: '#C9A227',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  tipNumText: { color: '#C9A227', fontSize: 13, fontWeight: '800' },
  tipBody: { flex: 1, gap: 4 },
  tipTitle: { color: '#f1f5f9', fontSize: 14, fontWeight: '700' },
  tipText: { color: '#64748b', fontSize: 12, lineHeight: 18 },

  // Footer
  footer: {
    padding: 20,
    paddingBottom: 40,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1a2d4a',
  },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#C9A227', borderRadius: 14,
    paddingVertical: 18, gap: 10,
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: {
    color: '#0a1628', fontSize: 14, fontWeight: '800', letterSpacing: 1.5,
  },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipBtnText: {
    color: '#334155', fontSize: 11, fontWeight: '700', letterSpacing: 1,
  },
});
