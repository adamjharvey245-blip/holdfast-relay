import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAnchorStore } from '@/store/anchorStore';

/**
 * Wraps a premium feature. If the user is not premium, renders a lock banner
 * instead of the children. If premium, renders children normally.
 */
export function PremiumGate({
  children,
  feature,
  description,
}: {
  children: React.ReactNode;
  feature: string;
  description: string;
}) {
  const isPremium = useAnchorStore(s => s.isPremium);
  const router = useRouter();

  if (isPremium) return <>{children}</>;

  return (
    <View style={styles.container}>
      <View style={styles.lockBanner}>
        <Ionicons name="lock-closed" size={18} color="#C9A227" />
        <View style={styles.lockText}>
          <Text style={styles.lockTitle}>{feature}</Text>
          <Text style={styles.lockSub}>{description}</Text>
        </View>
        <TouchableOpacity
          style={styles.unlockBtn}
          onPress={() => router.push('/upgrade')}
        >
          <Text style={styles.unlockBtnText}>UNLOCK</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
  },
  lockBanner: {
    backgroundColor: '#0f2040',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9A22744',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lockText: { flex: 1 },
  lockTitle: { color: '#94a3b8', fontSize: 13, fontWeight: '700' },
  lockSub: { color: '#475569', fontSize: 11, marginTop: 2 },
  unlockBtn: {
    backgroundColor: '#C9A227',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  unlockBtnText: {
    color: '#0a1628',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
