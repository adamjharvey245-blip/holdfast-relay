import { useEffect } from 'react';
import { useAnchorStore } from '@/store/anchorStore';
import { relayClient, startRelayBroadcast } from '@/services/websocketRelay';

/**
 * Manages the WebSocket relay connection lifecycle and live broadcasting.
 * - Connects when a watch code exists, disconnects when cleared.
 * - Broadcasts position/alarm state on every GPS update.
 * - Stores relay connection status in the Zustand store so any screen can read it.
 * Call once from the root layout.
 */
export function useRelayBroadcast() {
  const watchCode = useAnchorStore(s => s.watchCode);
  const boatPosition = useAnchorStore(s => s.boatPosition);
  const setRelayConnected = useAnchorStore(s => s.setRelayConnected);

  // Wire status callback once (never unmounts — lives in root layout).
  useEffect(() => {
    relayClient.onStatusChange = (connected) => {
      setRelayConnected(connected);
    };
    return () => { relayClient.onStatusChange = null; };
  }, []);

  // Connect / disconnect based on watch code.
  // Send an initial broadcast the moment the socket opens so the watch page
  // gets data immediately even if GPS already had a fix before the code was set.
  useEffect(() => {
    if (watchCode) {
      relayClient.onOpen = () => startRelayBroadcast();
      relayClient.connect(watchCode);
    } else {
      relayClient.onOpen = null;
      setRelayConnected(false);
      relayClient.disconnect();
    }
    return () => {
      relayClient.onOpen = null;
      relayClient.disconnect();
    };
  }, [watchCode]);

  // Broadcast on every position update
  useEffect(() => {
    if (!watchCode || !boatPosition) return;
    startRelayBroadcast();
  }, [boatPosition]);
}
