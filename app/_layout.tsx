import '../global.css';
import React, { useEffect, useState } from 'react';
import { Image, View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAnchorStore } from '@/store/anchorStore';
import { useAlarmSystem } from '@/hooks/useAlarmSystem';
import { useGpsTracker } from '@/hooks/useGpsTracker';
import { ONBOARDING_KEY } from './onboarding';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[HoldFast] Uncaught error:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.title}>Something went wrong</Text>
          <Text style={errStyles.message}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: '#ef4444', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  message: { color: '#94a3b8', fontSize: 13, textAlign: 'center' },
});

function AppInit() {
  const { hydrateFromStorage } = useAnchorStore();
  const router = useRouter();

  // Initialise alarm system (registers notification channels, requests permissions)
  useAlarmSystem();

  // Start GPS tracking immediately
  useGpsTracker();

  // Hydrate persisted settings and check if onboarding is needed
  useEffect(() => {
    (async () => {
      await hydrateFromStorage();
      const done = await AsyncStorage.getItem(ONBOARDING_KEY);
      if (!done) {
        router.replace('/onboarding');
      }
    })();
  }, []);

  // Remote watch disabled — relay server not yet configured

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <AppInit />
      <StatusBar style="light" backgroundColor="#0C1B2C" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0C1B2C' },
          headerTintColor: '#f1f5f9',
          headerTitleStyle: { fontWeight: '800', letterSpacing: 3, color: '#C9A227' },
          contentStyle: { backgroundColor: '#0C1B2C' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: true,
            headerTitle: () => (
              <Image
                source={require('../assets/images/logo-landscape-long.png')}
                style={{ width: 200, height: 44 }}
                resizeMode="contain"
              />
            ),
          }}
        />
        <Stack.Screen
          name="settings"
          options={{ title: 'SETTINGS', presentation: 'modal' }}
        />
        <Stack.Screen
          name="remote"
          options={{ title: 'REMOTE WATCH' }}
        />
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false }}
        />
      </Stack>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
