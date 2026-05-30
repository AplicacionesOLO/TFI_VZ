import { useEffect, useRef, useCallback, useState } from 'react';
import { getSyncStatusV2, isTerminalState, isActiveState } from '@/services/sync-lifecycle.service';
import type { SyncStatusResult } from '@/types/tfi.types';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 1200; // 60 minutos

// ─── Global registry: deduplica polling por sessionId ───────────────────────
//  Si dos componentes llaman useSyncPolling('abc'), se crea UN solo interval.
//  Ambos reciben los mismos updates.

interface PollingEntry {
  status: SyncStatusResult | null;
  isPolling: boolean;
  pollAttempts: number;
  subscribers: Set<(status: SyncStatusResult | null) => void>;
  intervalId: ReturnType<typeof setInterval> | null;
}

const registry = new Map<string, PollingEntry>();

function getOrCreate(sessionId: string): PollingEntry {
  let entry = registry.get(sessionId);
  if (!entry) {
    entry = {
      status: null,
      isPolling: false,
      pollAttempts: 0,
      subscribers: new Set(),
      intervalId: null,
    };
    registry.set(sessionId, entry);
  }
  return entry;
}

function notify(entry: PollingEntry) {
  for (const cb of entry.subscribers) {
    try { cb(entry.status); } catch { /* ignore */ }
  }
}

function stopEntry(sessionId: string, clearStatus: boolean = false) {
  const entry = registry.get(sessionId);
  if (!entry) return;
  if (entry.intervalId) {
    clearInterval(entry.intervalId);
    entry.intervalId = null;
  }
  entry.isPolling = false;
  entry.pollAttempts = 0;
  if (clearStatus) {
    entry.status = null;
    notify(entry);
  }
}

function startEntry(sessionId: string) {
  const entry = getOrCreate(sessionId);
  if (entry.isPolling) return; // Already polling — deduplicated

  entry.isPolling = true;
  entry.pollAttempts = 0;

  const tick = async () => {
    entry.pollAttempts += 1;

    if (entry.pollAttempts > MAX_POLL_ATTEMPTS) {
      console.warn(`[useSyncPolling] ${sessionId} — max attempts reached, stopping`);
      stopEntry(sessionId);
      return;
    }

    try {
      const status = await getSyncStatusV2(sessionId);
      entry.status = status;
      notify(entry);

      // Backend says terminal → stop polling immediately
      if (status && isTerminalState(status.computed_status)) {
        console.log(`[useSyncPolling] ${sessionId} — terminal: ${status.computed_status}, stopping`);
        stopEntry(sessionId);
      }
    } catch (err) {
      console.error(`[useSyncPolling] ${sessionId} — poll error:`, err);
    }
  };

  tick(); // Immediate first tick
  entry.intervalId = setInterval(tick, POLL_INTERVAL_MS);
}

// ─── Hook público ────────────────────────────────────────────────────────────

export interface UseSyncPollingReturn {
  status: SyncStatusResult | null;
  isPolling: boolean;
  startPolling: () => void;
  stopPolling: () => void;
  resetState: () => void;
}

export function useSyncPolling(sessionId: string | null | undefined): UseSyncPollingReturn {
  const [status, setStatus] = useState<SyncStatusResult | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus(null);
      setIsPolling(false);
      return;
    }

    sessionIdRef.current = sessionId;
    const entry = getOrCreate(sessionId);

    // Sync local state immediately if we have cached data
    if (entry.status) {
      setStatus(entry.status);
    }
    setIsPolling(entry.isPolling);

    // Subscribe to updates
    const callback = (newStatus: SyncStatusResult | null) => {
      setStatus(newStatus);
    };

    // Subscribe to isPolling changes via a wrapper that tracks entry state
    const pollingWatcher = setInterval(() => {
      const current = registry.get(sessionId);
      if (current) {
        setIsPolling(current.isPolling);
      }
    }, 500);

    entry.subscribers.add(callback);

    return () => {
      entry.subscribers.delete(callback);
      clearInterval(pollingWatcher);

      // Clean up registry if no subscribers and not polling
      const remaining = registry.get(sessionId);
      if (remaining && remaining.subscribers.size === 0 && !remaining.isPolling) {
        stopEntry(sessionId);
        registry.delete(sessionId);
      }
    };
  }, [sessionId]);

  const startPolling = useCallback(() => {
    if (!sessionId) return;
    startEntry(sessionId);
    setIsPolling(true);
  }, [sessionId]);

  const stopPolling = useCallback(() => {
    if (!sessionId) return;
    stopEntry(sessionId, true); // clear status + notify
    setIsPolling(false);
  }, [sessionId]);

  const resetState = useCallback(() => {
    if (!sessionId) return;
    stopEntry(sessionId);
    const entry = getOrCreate(sessionId);
    entry.status = null;
    notify(entry);
    setStatus(null);
    setIsPolling(false);
  }, [sessionId]);

  return { status, isPolling, startPolling, stopPolling, resetState };
}