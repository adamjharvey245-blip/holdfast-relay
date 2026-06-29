import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAnchorStore } from '@/store/anchorStore';

const RELAY_BASE_URL = 'https://www.anchoralarm.app';

export function RemoteWatchPanel() {
  const { watchCode, remoteWatchEnabled, setRemoteWatchEnabled, generateWatchCode, relayConnected } = useAnchorStore();

  const watchUrl = watchCode
    ? `${RELAY_BASE_URL}/watch?code=${watchCode}`
    : null;

  const handleToggle = (value: boolean) => {
    setRemoteWatchEnabled(value);
  };

  const handleRevoke = () => {
    generateWatchCode(); // generates a new code, old watchers lose access
  };

  const handleShare = async () => {
    if (!watchUrl) return;
    try {
      await Share.share({
        message: `Monitor my anchor position live:\n${watchUrl}\nCode: ${watchCode}`,
        url: watchUrl,
      });
    } catch {
      // ignore
    }
  };

  return (
    <View style={styles.container}>

      <View style={styles.headerRow}>
        <Text style={styles.title}>REMOTE WATCH</Text>
        <Switch
          value={remoteWatchEnabled}
          onValueChange={handleToggle}
          trackColor={{ false: '#1e3a6e', true: '#C9A22766' }}
          thumbColor={remoteWatchEnabled ? '#C9A227' : '#334155'}
        />
      </View>

      <Text style={styles.subtitle}>
        Share a link so someone ashore can monitor your anchor position in real time.
      </Text>

      {remoteWatchEnabled && watchCode && (
        <>
          <View style={styles.headerRow}>
            <View style={[styles.liveBadge, relayConnected ? styles.liveBadgeOn : styles.liveBadgeOff]}>
              <View style={[styles.liveDot, relayConnected ? styles.liveDotOn : styles.liveDotOff]} />
              <Text style={[styles.liveText, relayConnected ? styles.liveTextOn : styles.liveTextOff]}>
                {relayConnected ? 'LIVE' : 'OFFLINE'}
              </Text>
            </View>
          </View>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>WATCH CODE</Text>
            <Text style={styles.codeDigits}>{watchCode}</Text>
            <Text style={styles.codeHint}>Give this code to your shore contact</Text>
          </View>

          <View style={styles.urlBox}>
            <Text style={styles.urlLabel}>WATCH LINK</Text>
            <Text style={styles.urlText} numberOfLines={1}>{watchUrl}</Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={16} color="#0a1628" />
              <Text style={styles.shareBtnText}>SHARE</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.revokeBtn} onPress={handleRevoke}>
              <Ionicons name="refresh-outline" size={16} color="#64748b" />
              <Text style={styles.revokeBtnText}>NEW CODE</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Generating a new code immediately revokes access for anyone using the old one.
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0f2040',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#1e3a6e',
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#C9A227',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  liveBadgeOn: { backgroundColor: '#10b98115', borderColor: '#10b98166' },
  liveBadgeOff: { backgroundColor: '#1e3a6e22', borderColor: '#1e3a6e' },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveDotOn: { backgroundColor: '#10b981' },
  liveDotOff: { backgroundColor: '#334155' },
  liveText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  liveTextOn: { color: '#10b981' },
  liveTextOff: { color: '#64748b' },

  codeBox: {
    alignItems: 'center',
    backgroundColor: '#162d57',
    borderRadius: 10,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#C9A22744',
    gap: 2,
  },
  codeLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },
  codeDigits: {
    color: '#C9A227',
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 14,
    fontFamily: 'monospace',
  },
  codeHint: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },

  urlBox: {
    backgroundColor: '#04080f',
    borderRadius: 8,
    padding: 10,
    gap: 3,
  },
  urlLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  urlText: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  shareBtn: {
    flex: 2,
    backgroundColor: '#C9A227',
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  shareBtnText: {
    color: '#0a1628',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  revokeBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  revokeBtnText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  hint: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
