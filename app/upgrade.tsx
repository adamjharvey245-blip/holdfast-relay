import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Purchases, { PurchasesPackage } from 'react-native-purchases';
import { purchasePremium, restorePurchases } from '@/hooks/usePremium';
import { useAnchorStore } from '@/store/anchorStore';

const FEATURES = [
  {
    icon: 'pencil' as const,
    color: '#C9A227',
    title: 'Custom Alarm Zones',
    desc: 'Draw your own zone around rocks, shallows, or hazards — not just a circle',
  },
  {
    icon: 'radio' as const,
    color: '#239cef',
    title: 'Remote Watch',
    desc: 'Share a live link so someone ashore can monitor your anchor position',
  },
  {
    icon: 'map' as const,
    color: '#10b981',
    title: 'GPS Track History',
    desc: 'See exactly where your boat has been throughout the night',
  },
  {
    icon: 'notifications' as const,
    color: '#ef4444',
    title: 'Custom Alarm Sounds',
    desc: 'Choose the alarm that will wake you from the deepest sleep',
  },
];

type PlanKey = 'annual' | 'lifetime';

export default function UpgradeScreen() {
  const router = useRouter();
  const isPremium = useAnchorStore(s => s.isPremium);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('annual');
  const [annualPkg, setAnnualPkg] = useState<PurchasesPackage | null>(null);
  const [lifetimePkg, setLifetimePkg] = useState<PurchasesPackage | null>(null);

  useEffect(() => {
    Purchases.getOfferings().then((offerings) => {
      const current = offerings.current;
      if (current?.annual) setAnnualPkg(current.annual);
      if (current?.lifetime) setLifetimePkg(current.lifetime);
    }).catch(() => {});
  }, []);

  const selectedPkg = selectedPlan === 'annual' ? annualPkg : lifetimePkg;

  const handlePurchase = async () => {
    if (!selectedPkg) {
      Alert.alert('Not available', 'This option is not available right now. Please try again later.');
      return;
    }
    setLoading(true);
    const result = await purchasePremium(selectedPkg);
    setLoading(false);
    if (result.success) {
      Alert.alert(
        'Welcome to Premium!',
        'All premium features are now unlocked. Thank you for supporting HoldFast.',
        [{ text: 'Get Started', onPress: () => router.back() }]
      );
    } else if (result.error) {
      Alert.alert('Purchase Failed', result.error);
    }
  };

  const handleRedeemCode = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert(
        'Redeem on Google Play',
        'To use your code, open the Google Play Store, tap your profile, choose "Payments & subscriptions" → "Redeem code".'
      );
      return;
    }
    try {
      await Purchases.presentCodeRedemptionSheet();
    } catch {
      Alert.alert('Unable to open', 'Could not open the redemption sheet. Please try again.');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    const result = await restorePurchases();
    setRestoring(false);
    if (result.success) {
      Alert.alert(
        'Purchase Restored',
        'Premium access restored. All features are unlocked.',
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } else {
      Alert.alert(
        'No Purchase Found',
        result.error ?? 'No previous purchase found for this Apple ID.'
      );
    }
  };

  if (isPremium) {
    return (
      <View style={styles.screen}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={14} color="#94a3b8" />
          <Text style={styles.backBtnText}>BACK</Text>
        </TouchableOpacity>
        <View style={styles.alreadyPremium}>
          <Ionicons name="shield-checkmark" size={64} color="#C9A227" />
          <Text style={styles.alreadyTitle}>You have Premium</Text>
          <Text style={styles.alreadyDesc}>All features are unlocked. Thank you for supporting HoldFast.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={14} color="#94a3b8" />
        <Text style={styles.backBtnText}>BACK</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.content}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.crownWrap}>
            <Ionicons name="shield-checkmark" size={48} color="#C9A227" />
          </View>
          <Text style={styles.headline}>Upgrade to{'\n'}<Text style={styles.headlineGold}>Premium</Text></Text>
          <Text style={styles.subline}>Everything you need to sleep soundly at anchor. One payment. Yours forever.</Text>
        </View>

        {/* Features */}
        <View style={styles.features}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: f.color + '20', borderColor: f.color + '44' }]}>
                <Ionicons name={f.icon} size={22} color={f.color} />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
              <Ionicons name="lock-closed" size={14} color="#334155" />
            </View>
          ))}
        </View>

        {/* Plan selector */}
        <View style={styles.planRow}>

          {/* Annual */}
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'annual' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.85}
          >
            <View style={styles.planLeft}>
              <View style={styles.planBadge}>
                <Text style={styles.planBadgeText}>BEST VALUE</Text>
              </View>
              <Text style={[styles.planTitle, selectedPlan === 'annual' && styles.planTitleSelected]}>Annual subscription</Text>
              <Text style={styles.planNote}>Billed once a year · cancel anytime</Text>
            </View>
            <View style={styles.planRight}>
              <Text style={[styles.planPrice, selectedPlan === 'annual' && styles.planPriceSelected]}>
                {annualPkg ? annualPkg.product.priceString : '—'}
              </Text>
              <Text style={[styles.planSub, selectedPlan === 'annual' && styles.planSubSelected]}>per year</Text>
            </View>
          </TouchableOpacity>

          {/* Lifetime */}
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'lifetime' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('lifetime')}
            activeOpacity={0.85}
          >
            <View style={styles.planLeft}>
              <View style={[styles.planBadge, styles.planBadgeLifetime]}>
                <Text style={styles.planBadgeText}>ONE-TIME</Text>
              </View>
              <Text style={[styles.planTitle, selectedPlan === 'lifetime' && styles.planTitleSelected]}>Lifetime access</Text>
              <Text style={styles.planNote}>Pay once · yours forever</Text>
            </View>
            <View style={styles.planRight}>
              <Text style={[styles.planPrice, selectedPlan === 'lifetime' && styles.planPriceSelected]}>
                {lifetimePkg ? lifetimePkg.product.priceString : '—'}
              </Text>
              <Text style={[styles.planSub, selectedPlan === 'lifetime' && styles.planSubSelected]}>one-time</Text>
            </View>
          </TouchableOpacity>

        </View>

        {selectedPlan === 'annual' && (
          <Text style={styles.billingNote}>
            Billed annually. Cancel anytime through your {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} account settings.
          </Text>
        )}

        {/* Buy button */}
        <TouchableOpacity
          style={[styles.buyBtn, (loading || !selectedPkg) && styles.buyBtnDisabled]}
          onPress={handlePurchase}
          disabled={loading || restoring || !selectedPkg}
        >
          {loading
            ? <ActivityIndicator color="#0a1628" />
            : <Text style={styles.buyBtnText}>
                {selectedPlan === 'annual' ? 'SUBSCRIBE ANNUALLY' : 'BUY LIFETIME ACCESS'}
              </Text>
          }
        </TouchableOpacity>

        {/* Restore */}
        <TouchableOpacity
          style={styles.restoreBtn}
          onPress={handleRestore}
          disabled={loading || restoring}
        >
          {restoring
            ? <ActivityIndicator color="#475569" size="small" />
            : <Text style={styles.restoreText}>Restore previous purchase</Text>
          }
        </TouchableOpacity>

        {/* Redeem offer code */}
        <TouchableOpacity
          style={styles.redeemBtn}
          onPress={handleRedeemCode}
          disabled={loading || restoring}
        >
          <Ionicons name="pricetag-outline" size={14} color="#94a3b8" />
          <Text style={styles.redeemText}>Have a code?</Text>
        </TouchableOpacity>

        {/* Guarantee */}
        <View style={styles.guarantee}>
          <Ionicons name="shield-outline" size={20} color="#10b981" />
          <Text style={styles.guaranteeText}>
            {Platform.OS === 'android'
              ? 'Backed by Google Play\'s refund policy. Request a refund through Google Play within 48 hours if needed.'
              : 'Backed by Apple\'s refund policy. Request a refund through Apple within 14 days if needed.'}
          </Text>
        </View>

        {/* Legal links — required by Apple for subscriptions */}
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.anchoralarm.app/privacy')}>
            <Text style={styles.privacyText}>Privacy Policy</Text>
          </TouchableOpacity>
          <Text style={styles.legalSep}>·</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}>
            <Text style={styles.privacyText}>Terms of Use</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0a1628' },

  backBtn: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1e3a6e',
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  backBtnText: { color: '#94a3b8', fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  content: { padding: 20, gap: 16, paddingBottom: 40 },

  header: { alignItems: 'center', gap: 12, paddingVertical: 8 },
  crownWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#C9A22715', borderWidth: 1, borderColor: '#C9A22733',
    alignItems: 'center', justifyContent: 'center',
  },
  headline: {
    fontSize: 32, fontWeight: '900', color: '#ffffff',
    textAlign: 'center', lineHeight: 38,
  },
  headlineGold: { color: '#C9A227' },
  subline: {
    fontSize: 14, color: '#94a3b8', textAlign: 'center',
    lineHeight: 20, maxWidth: 300,
  },

  features: {
    backgroundColor: '#0f2040', borderRadius: 12,
    borderWidth: 1, borderColor: '#1e3a6e', overflow: 'hidden',
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#162d57',
  },
  featureIcon: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, flexShrink: 0,
  },
  featureText: { flex: 1 },
  featureTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700', marginBottom: 3 },
  featureDesc: { color: '#94a3b8', fontSize: 12, lineHeight: 16 },

  planRow: { flexDirection: 'column', gap: 10 },
  planCard: {
    backgroundColor: '#0f2040', borderRadius: 12,
    borderWidth: 1, borderColor: '#1e3a6e',
    padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16,
  },
  planCardSelected: { borderColor: '#C9A227', backgroundColor: '#C9A22710' },
  planBadge: {
    backgroundColor: '#C9A227', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 4,
  },
  planBadgeLifetime: { backgroundColor: '#1e3a6e' },
  planBadgeText: { color: '#0a1628', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  planLeft: { flex: 1 },
  planTitle: { color: '#94a3b8', fontSize: 15, fontWeight: '700' },
  planTitleSelected: { color: '#ffffff' },
  planNote: { color: '#475569', fontSize: 12, marginTop: 2 },
  planRight: { alignItems: 'flex-end' },
  planPrice: { color: '#475569', fontSize: 32, fontWeight: '900' },
  planPriceSelected: { color: '#C9A227' },
  planSub: { color: '#475569', fontSize: 12 },
  planSubSelected: { color: '#94a3b8' },
  billingNote: {
    color: '#475569', fontSize: 11, textAlign: 'center', lineHeight: 16,
  },

  buyBtn: {
    backgroundColor: '#C9A227', borderRadius: 12,
    paddingVertical: 18, alignItems: 'center',
  },
  buyBtnDisabled: { opacity: 0.6 },
  buyBtnText: { color: '#0a1628', fontSize: 16, fontWeight: '900', letterSpacing: 1.5 },

  restoreBtn: { alignItems: 'center', paddingVertical: 8 },
  restoreText: { color: '#334155', fontSize: 13, textDecorationLine: 'underline' },

  redeemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10,
  },
  redeemText: { color: '#94a3b8', fontSize: 13, fontWeight: '600' },

  guarantee: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start',
    backgroundColor: '#10b98110', borderRadius: 10,
    borderWidth: 1, borderColor: '#10b98130',
    padding: 14,
  },
  guaranteeText: { color: '#94a3b8', fontSize: 12, lineHeight: 17, flex: 1 },

  legalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  legalSep: { color: '#334155', fontSize: 12 },
  privacyText: { color: '#334155', fontSize: 12, textDecorationLine: 'underline' },

  alreadyPremium: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32,
  },
  alreadyTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800' },
  alreadyDesc: { color: '#94a3b8', fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
