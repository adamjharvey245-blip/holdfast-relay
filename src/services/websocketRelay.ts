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

const RELAY_WS_URL = 'wss://holdfast-relay-production.up.railway.app/ws';
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;
const KEEPALIVE_INTERVAL_MS = 25000; // under Railway's 30s idle timeout

class RelayClient {
  private ws: WebSocket | null = null;
  private code: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
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
    this.clearKeepalive();
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

  onStatusChange: ((connected: boolean) => void) | null = null;
  onOpen: (() => void) | null = null;

  private notifyStatus(connected: boolean) {
    this.onStatusChange?.(connected);
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
        this.notifyStatus(true);
        this.startKeepalive();
        this.onOpen?.();
      };

      this.ws.onerror = (e) => {
        console.warn('[Relay] Error:', e);
      };

      this.ws.onclose = (e) => {
        console.warn('[Relay] Disconnected:', e.code, e.reason);
        this.clearKeepalive();
        this.notifyStatus(false);
        if (this.shouldReconnect) this.scheduleReconnect();
      };
    } catch (err) {
      console.warn('[Relay] Failed to create WebSocket:', err);
      if (this.shouldReconnect) this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    // Exponential backoff capped at MAX_RECONNECT_DELAY_MS — retries indefinitely
    const delay = Math.min(RECONNECT_DELAY_MS * Math.min(this.reconnectAttempts, 10), MAX_RECONNECT_DELAY_MS);
    console.log(`[Relay] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => this.openConnection(), delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startKeepalive() {
    this.clearKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', code: this.code ?? '', ts: Date.now() }));
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private clearKeepalive() {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
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

  console.log('[Relay] startRelayBroadcast — code:', watchCode, 'hasPosition:', !!boatPosition, 'wsReady:', (relayClient as any).ws?.readyState);

  if (!watchCode || !boatPosition) {
    console.log('[Relay] broadcast skipped — missing watchCode or boatPosition');
    return;
  }

  relayClient.sendPosition(
    boatPosition.latitude,
    boatPosition.longitude,
    currentDistance
  );

  if (anchorPosition) {
    relayClient.sendAnchor(anchorPosition.latitude, anchorPosition.longitude, watchRadius);
  }

  relayClient.sendAlarm(alarmLevel, currentDistance);
  console.log('[Relay] broadcast sent — pos:', boatPosition.latitude.toFixed(5), boatPosition.longitude.toFixed(5), 'alarm:', alarmLevel);
}
