import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { RemoteWatchPanel } from '@/components/RemoteWatchPanel';

export default function RemoteScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={{ height: 16 }} />
      <RemoteWatchPanel />
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0C1B2C' },
  content: { paddingBottom: 40 },
});
