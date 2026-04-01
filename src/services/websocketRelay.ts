/**
 * WebSocket Relay Client
 *
 * Connects to the relay server and broadcasts position/alarm updates
 * to any watchers subscribed to the same 4-digit code.
 *
 * The relay server is a simple Node.js WebSocket pub/sub broker
 * (see /server/relay.js).
 */

import { useAnchorStore } from '@/store/anchorStore';
import type { RelayMessage } from '@/types';

// Replace with your deployed relay server WebSocket URL
const RELAY_WS_URL = 'wss://your-relay.example.com/ws';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_ATTEMPTS = 10;

class RelayClient {
  private ws: WebSocket | null = null;
  private code: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  connect(code: string) {
    this.code = code;
    this.shouldReconnect = true;
    this.reconnectAttempts = 0;
    this.openConnection();
  }

  disconnect() {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    if (this.ws) {
      this.ws.close(1000, 'User disconnected');
      this.ws = null;
    }
  }

  sendPosition(lat: number, lng: number, distanceFromAnchor: number) {
    this.send({
      type: 'position',
      code: this.code ?? '',
      payload: { lat, lng, distanceFromAnchor },
      ts: Date.now(),
    });
  }

  sendAnchor(lat: number, lng: number, radius: number) {
    this.send({
      type: 'anchor',
      code: this.code ?? '',
      payload: { lat, lng, radius },
      ts: Date.now(),
    });
  }

  sendAlarm(level: string, distanceFromAnchor: number) {
    this.send({
      type: 'alarm',
      code: this.code ?? '',
      payload: { level, distanceFromAnchor } as any,
      ts: Date.now(),
    });
  }

  private send(message: RelayMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private openConnection() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(`${RELAY_WS_URL}?code=${this.code}&role=boat`);

      this.ws.onopen = () => {
        console.log('[Relay] Connected, code:', this.code);
        this.reconnectAttempts = 0;
      };

      this.ws.onerror = (e) => {
        console.warn('[Relay] Error:', e);
      };

      this.ws.onclose = (e) => {
        console.warn('[Relay] Disconnected:', e.code, e.reason);
        if (this.shouldReconnect) this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('[Relay] Failed to create WebSocket:', err);
      if (this.shouldReconnect) this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[Relay] Max reconnect attempts reached');
      return;
    }
    this.reconnectAttempts++;
    const delay = RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 5);
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => this.openConnection(), delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// Singleton instance
export const relayClient = new RelayClient();

// ─── Relay broadcasting hook integration ──────────────────────────────────────
// Call this from a useEffect in your root component to auto-broadcast state.

export function startRelayBroadcast() {
  const store = useAnchorStore.getState();
  const { watchCode, boatPosition, anchorPosition, currentDistance, alarmLevel, watchRadius } = store;

  if (!watchCode || !boatPosition) return;

  relayClient.sendPosition(
    boatPosition.latitude,
    boatPosition.longitude,
    currentDistance
  );

  if (anchorPosition) {
    relayClient.sendAnchor(anchorPosition.latitude, anchorPosition.longitude, watchRadius);
  }

  relayClient.sendAlarm(alarmLevel, currentDistance);
}
