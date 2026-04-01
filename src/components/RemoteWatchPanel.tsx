import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Share, Platform } from 'react-native';
import { useAnchorStore } from '@/store/anchorStore';

// Replace with your deployed relay server URL
const RELAY_BASE_URL = 'https://your-relay.example.com';

export function RemoteWatchPanel() {
  const { watchCode, generateWatchCode } = useAnchorStore();
  const [copied, setCopied] = useState(false);

  const watchUrl = watchCode
    ? `${RELAY_BASE_URL}/watch?code=${watchCode}`
    : null;

  const handleGenerate = () => {
    generateWatchCode();
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
      <View style={styles.header}>
        <Text style={styles.title}>REMOTE WATCH</Text>
        <Text style={styles.subtitle}>
          Share a link to monitor your anchor position
        </Text>
      </View>

      {!watchCode ? (
        <TouchableOpacity style={styles.generateBtn} onPress={handleGenerate}>
          <Text style={styles.generateBtnText}>GENERATE WATCH CODE</Text>
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>YOUR CODE</Text>
            <Text style={styles.codeDigits}>{watchCode}</Text>
          </View>

          <View style={styles.urlBox}>
            <Text style={styles.urlText} numberOfLines={2}>
              {watchUrl}
            </Text>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShare}
            >
              <Text style={styles.shareBtnText}>SHARE LINK</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.regenerateBtn}
              onPress={handleGenerate}
            >
              <Text style={styles.regenerateBtnText}>NEW CODE</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>
            Anyone with this code can view your live position.{'\n'}
            Generate a new code to revoke access.
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
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  generateBtn: {
    backgroundColor: '#162d57',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e3a6e',
  },
  generateBtnText: {
    color: '#f59e0b',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  codeBox: {
    alignItems: 'center',
    backgroundColor: '#162d57',
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f59e0b44',
  },
  codeLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 4,
  },
  codeDigits: {
    color: '#f59e0b',
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 12,
    fontFamily: 'monospace',
  },
  urlBox: {
    backgroundColor: '#04080f',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  urlText: {
    color: '#475569',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  shareBtn: {
    flex: 2,
    backgroundColor: '#f59e0b',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#0a1628',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  regenerateBtn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  regenerateBtnText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  hint: {
    color: '#334155',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
  },
});
