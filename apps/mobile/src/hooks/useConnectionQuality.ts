/**
 * useConnectionQuality — Task 34.4
 * Detects network latency > 500ms and tracks offline state.
 * Queues outgoing actions for retry when offline.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export type ConnectionQuality = 'good' | 'degraded' | 'offline';

export interface QueuedAction {
  id: string;
  action: () => Promise<void>;
  retries: number;
}

const LATENCY_THRESHOLD_MS = 500;
const PING_URL = 'https://api.platform.internal/health'; // replace with real endpoint

async function measureLatency(): Promise<number> {
  const start = Date.now();
  try {
    await fetch(PING_URL, { method: 'HEAD', cache: 'no-store' });
    return Date.now() - start;
  } catch {
    return Infinity;
  }
}

export function useConnectionQuality() {
  const [quality, setQuality] = useState<ConnectionQuality>('good');
  const [isOnline, setIsOnline] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number>(0);
  const actionQueue = useRef<QueuedAction[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushQueue = useCallback(async () => {
    const pending = [...actionQueue.current];
    actionQueue.current = [];
    for (const item of pending) {
      try {
        await item.action();
      } catch {
        if (item.retries < 3) {
          actionQueue.current.push({ ...item, retries: item.retries + 1 });
        }
      }
    }
  }, []);

  const enqueueAction = useCallback(
    (id: string, action: () => Promise<void>) => {
      if (isOnline && quality !== 'offline') {
        action().catch(() => {
          actionQueue.current.push({ id, action, retries: 0 });
        });
      } else {
        actionQueue.current.push({ id, action, retries: 0 });
      }
    },
    [isOnline, quality],
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(online);
      if (!online) {
        setQuality('offline');
      }
    });

    // Periodic latency check every 10 seconds
    intervalRef.current = setInterval(async () => {
      if (!isOnline) return;
      const latency = await measureLatency();
      setLatencyMs(latency);
      if (latency === Infinity) {
        setQuality('offline');
      } else if (latency > LATENCY_THRESHOLD_MS) {
        setQuality('degraded');
      } else {
        setQuality('good');
      }
    }, 10_000);

    return () => {
      unsubscribe();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isOnline]);

  // Flush queue when connection is restored
  useEffect(() => {
    if (isOnline && quality !== 'offline' && actionQueue.current.length > 0) {
      flushQueue();
    }
  }, [isOnline, quality, flushQueue]);

  return { quality, isOnline, latencyMs, enqueueAction, queueLength: actionQueue.current.length };
}
