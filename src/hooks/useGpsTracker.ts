import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useAnchorStore } from '@/store/anchorStore';
import { useAnchorLogic } from './useAnchorLogic';
import type { TimestampedCoordinate } from '@/types';

export const BACKGROUND_LOCATION_TASK = 'HOLDFAST_BG_LOCATION';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, ({ data, error }) => {
  if (error) { console.warn('[BG Location]', error.message); return; }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    const latest = locations[locations.length - 1];
    if (!latest) return;
    useAnchorStore.getState().updateBoatPosition({
      latitude: latest.coords.latitude,
      longitude: latest.coords.longitude,
      timestamp: latest.timestamp,
      accuracy: latest.coords.accuracy ?? undefined,
      speed: latest.coords.speed ?? undefined,
    });
  }
});

export function useGpsTracker() {
  const { updateBoatPosition, setGpsStatus } = useAnchorStore();
  const { processNewPosition } = useAnchorLogic();
  const fgSubscriptionRef = useRef<Location.LocationSubscription | null>(null);

  const startTracking = async () => {
    // Step 1: foreground permission
    let fgStatus: string;
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      fgStatus = result.status;
    } catch (err) {
      console.warn('[GPS] Permission request failed:', err);
      setGpsStatus('lost');
      return;
    }

    if (fgStatus !== 'granted') {
      setGpsStatus('lost');
      return;
    }

    // Step 2: warm up the GPS chip with a one-shot fix first.
    // Without this, watchPositionAsync can silently fail on cold start.
    try {
      await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
    } catch {
      // Chip not ready yet — continue anyway, watchPositionAsync will retry
    }

    // Step 3: continuous foreground watch
    try {
      fgSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 0,
        },
        (location) => {
          const coord: TimestampedCoordinate = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
            accuracy: location.coords.accuracy ?? undefined,
            speed: location.coords.speed ?? undefined,
          };
          updateBoatPosition(coord);
          processNewPosition(coord);
        }
      );
    } catch (err) {
      console.warn('[GPS] watchPositionAsync failed:', err);
      setGpsStatus('lost');
      return;
    }

    // Step 4: background task — optional, skipped gracefully in Expo Go
    try {
      const { status: bg } = await Location.requestBackgroundPermissionsAsync();
      if (bg === 'granted') {
        const isRunning = await Location.hasStartedLocationUpdatesAsync(
          BACKGROUND_LOCATION_TASK
        ).catch(() => false);
        if (!isRunning) {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 10_000,
            distanceInterval: 5,
            foregroundService: {
              notificationTitle: 'HoldFast is watching',
              notificationBody: 'Monitoring your anchor position',
              notificationColor: '#C9A227',
            },
            showsBackgroundLocationIndicator: true,
            pausesUpdatesAutomatically: false,
            activityType: Location.ActivityType.OtherNavigation,
          });
        }
      }
    } catch (bgErr) {
      console.warn('[GPS] Background unavailable (Expo Go?):', bgErr);
    }
  };

  const stopTracking = async () => {
    fgSubscriptionRef.current?.remove();
    fgSubscriptionRef.current = null;
    try {
      const isRunning = await Location.hasStartedLocationUpdatesAsync(
        BACKGROUND_LOCATION_TASK
      ).catch(() => false);
      if (isRunning) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    } catch {}
  };

  useEffect(() => {
    startTracking();
    return () => { stopTracking(); };
  }, []);

  return { startTracking, stopTracking };
}
