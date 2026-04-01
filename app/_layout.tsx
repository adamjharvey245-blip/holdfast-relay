import '../global.css';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAnchorStore } from '@/store/anchorStore';
import { useAlarmSystem } from '@/hooks/useAlarmSystem';
import { useGpsTracker } from '@/hooks/useGpsTracker';
import { relayClient, startRelayBroadcast } from '@/services/websocketRelay';
import { ONBOARDING_KEY } from './onboarding';

function AppInit() {
  const { hydrateFromStorage, watchCode, boatPosition } = useAnchorStore();
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

  // Connect WebSocket relay when we have a code
  useEffect(() => {
    if (watchCode) {
      relayClient.connect(watchCode);
    } else {
      relayClient.disconnect();
    }
    return () => relayClient.disconnect();
  }, [watchCode]);

  // Broadcast position/alarm updates to relay watchers every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      if (watchCode && boatPosition) {
        startRelayBroadcast();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [watchCode, boatPosition]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
