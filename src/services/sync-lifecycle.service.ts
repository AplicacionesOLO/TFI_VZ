import { supabase } from '@/lib/supabase';
import type {
  SyncStatusResult,
  TfiSyncRun,
  TfiSyncLock,
  SyncCleanupResult,
  ForceReleaseResult,
  CancelSyncResult,
} from '@/types/tfi.types';

// ─── Configuración de thresholds ─────────────────────────────────────────────

export const POLL_INTERVAL_MS = 3000;
export const MAX_POLL_ATTEMPTS = 1200; // 60 minutos a 3 segundos

// ─── Status detallado del sync ───────────────────────────────────────────────

export async function getSyncStatusV2(sessionId: string): Promise<SyncStatusResult | null> {
  console.log('[SyncLifecycle] getSyncStatusV2 — sessionId:', sessionId);

  const { data, error } = await supabase
    .rpc('get_sync_status_v2_single', { p_session_id: sessionId });

  if (error) {
    console.error('[SyncLifecycle] getSyncStatusV2 error:', error.message);
    throw error;
  }

  if (!data || data.length === 0) {
    console.log('[SyncLifecycle] getSyncStatusV2 — no data returned');
    return null;
  }

  const row = data[0];
  const result: SyncStatusResult = {
    lock_is_running: row.lock_is_running ?? false,
    lock_sync_run_id: row.lock_sync_run_id,
    lock_started_at: row.lock_started_at,
    lock_finished_at: row.lock_finished_at,
    lock_updated_at: row.lock_updated_at,
    lock_error_message: row.lock_error_message,
    sync_run_id: row.sync_run_id,
    sync_run_status: row.sync_run_status,
    sync_run_started_at: row.sync_run_started_at,
    sync_run_finished_at: row.sync_run_finished_at,
    sync_run_total_rows: row.sync_run_total_rows,
    sync_run_error_message: row.sync_run_error_message,
    branch_count: row.branch_count ?? 0,
    branches_completed: row.branches_completed ?? 0,
    branches_failed: row.branches_failed ?? 0,
    branches_running: row.branches_running ?? 0,
    last_n8n_step_at: row.last_n8n_step_at,
    last_n8n_step_name: row.last_n8n_step_name,
    last_n8n_branch: row.last_n8n_branch,
    minutes_since_start: Number(row.minutes_since_start ?? 0),
    minutes_since_last_update: Number(row.minutes_since_last_update ?? 0),
    minutes_since_last_n8n_step: Number(row.minutes_since_last_n8n_step ?? 999999),
    computed_status: row.computed_status ?? 'idle',
    computed_message: row.computed_message ?? '',
  };

  console.log('[SyncLifecycle] getSyncStatusV2 result:', {
    computed_status: result.computed_status,
    computed_message: result.computed_message,
    minutes_since_start: result.minutes_since_start,
    minutes_since_last_n8n_step: result.minutes_since_last_n8n_step,
  });

  return result;
}

// ─── Cancel sync run (real STOP) ─────────────────────────────────────────────

export async function cancelSyncRun(
  syncRunId: string,
  sessionId: string
): Promise<CancelSyncResult> {
  console.log('[SyncLifecycle] cancelSyncRun — syncRunId:', syncRunId, 'sessionId:', sessionId);

  const { data, error } = await supabase
    .rpc('cancel_sync_run', { p_sync_run_id: syncRunId, p_session_id: sessionId });

  if (error) {
    console.error('[SyncLifecycle] cancelSyncRun error:', error.message);
    throw error;
  }

  if (!data || data.length === 0) {
    return { cancelled: false, previous_status: null, message: 'No response' };
  }

  const row = data[0];
  return {
    cancelled: row.cancelled ?? false,
    previous_status: row.previous_status,
    message: row.message ?? '',
  };
}

// ─── Update sync heartbeat (N8N or frontend) ───────────────────────────────────

export async function updateSyncHeartbeat(
  syncRunId: string,
  stepName?: string,
  branchName?: string
): Promise<void> {
  console.log('[SyncLifecycle] updateSyncHeartbeat — syncRunId:', syncRunId);

  const { error: syncError } = await supabase
    .from('tfi_sync_runs')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', syncRunId);

  if (syncError) {
    console.error('[SyncLifecycle] updateSyncHeartbeat sync_run error:', syncError.message);
  }

  if (stepName) {
    const { error: logError } = await supabase
      .from('tfi_n8n_step_logs')
      .insert({
        sync_run_id: syncRunId,
        step_name: stepName,
        branch_name: branchName ?? null,
      });

    if (logError) {
      console.error('[SyncLifecycle] updateSyncHeartbeat step log error:', logError.message);
    }
  }
}

// ─── Force release (admin) ───────────────────────────────────────────────────

export async function forceReleaseSyncLock(
  sessionId: string,
  reason: string = 'Force unlock by admin'
): Promise<ForceReleaseResult> {
  console.log('[SyncLifecycle] forceReleaseSyncLock — sessionId:', sessionId, 'reason:', reason);

  const { data, error } = await supabase
    .rpc('force_release_sync_lock_single', { p_session_id: sessionId, p_reason: reason });

  if (error) {
    console.error('[SyncLifecycle] forceReleaseSyncLock error:', error.message);
    throw error;
  }

  if (!data || data.length === 0) {
    return { released: false, previous_lock_id: null, previous_sync_run_id: null, message: 'No response' };
  }

  const row = data[0];
  return {
    released: row.released ?? false,
    previous_lock_id: row.previous_lock_id,
    previous_sync_run_id: row.previous_sync_run_id,
    message: row.message ?? '',
  };
}

// ─── Cleanup zombies automático ──────────────────────────────────────────────

export async function cleanupZombieSyncs(
  staleMinutes: number = 60,
  orphanMinutes: number = 5
): Promise<SyncCleanupResult> {
  console.log('[SyncLifecycle] cleanupZombieSyncs — staleMinutes:', staleMinutes, 'orphanMinutes:', orphanMinutes);

  const { data, error } = await supabase
    .rpc('cleanup_zombie_syncs', { p_stale_minutes: staleMinutes, p_orphan_minutes: orphanMinutes });

  if (error) {
    console.error('[SyncLifecycle] cleanupZombieSyncs error:', error.message);
    throw error;
  }

  if (!data || data.length === 0) {
    return { cleaned_locks: 0, cleaned_syncs: 0, cleaned_branches: 0, details: [] };
  }

  const row = data[0];
  return {
    cleaned_locks: row.cleaned_locks ?? 0,
    cleaned_syncs: row.cleaned_syncs ?? 0,
    cleaned_branches: row.cleaned_branches ?? 0,
    details: row.details ?? [],
  };
}

// ─── Lock Functions ──────────────────────────────────────────────────────────

export async function acquireSyncLock(sessionId: string, syncRunId: string): Promise<boolean> {
  console.log('[SyncLifecycle] acquireSyncLock — sessionId:', sessionId, 'syncRunId:', syncRunId);

  const { data, error } = await supabase.rpc('acquire_tfi_sync_lock', {
    p_session_id: sessionId,
    p_sync_run_id: syncRunId,
  });

  if (error) {
    console.error('[SyncLifecycle] acquireSyncLock error:', error.message);
    throw error;
  }

  return (data as boolean) ?? false;
}

export async function releaseSyncLock(sessionId: string, errorMsg?: string): Promise<void> {
  console.log('[SyncLifecycle] releaseSyncLock — sessionId:', sessionId, 'error:', errorMsg ?? 'none');

  const { error } = await supabase.rpc('release_tfi_sync_lock', {
    p_session_id: sessionId,
    p_error: errorMsg ?? null,
  });

  if (error) {
    console.error('[SyncLifecycle] releaseSyncLock error:', error.message);
    throw error;
  }
}

// ─── Helpers de estado ───────────────────────────────────────────────────────

export function isActiveState(status: string): boolean {
  return status === 'syncing' || status === 'starting' || status === 'queued' || status === 'finishing';
}

export function isProblemState(status: string): boolean {
  return status === 'stale' || status === 'timeout' || status === 'orphaned' || status === 'zombie' || status === 'partial_failure';
}

export function isTerminalState(status: string): boolean {
  return (
    status === 'completed' ||
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'idle' ||
    status === 'stale' ||
    status === 'timeout' ||
    status === 'orphaned' ||
    status === 'zombie' ||
    status === 'partial_failure'
  );
}

export function isCancellableState(status: string): boolean {
  return status === 'syncing' || status === 'starting' || status === 'queued' || status === 'running' || status === 'finishing';
}

export function formatElapsed(minutes: number): string {
  const mins = Math.floor(minutes);
  const secs = Math.floor((minutes - mins) * 60);
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ─── Visual warning helpers (NO overrides — solo para UI) ───────────────────

/** Detect if backend reports syncing but N8N has never sent a heartbeat.
 *  This is a VISUAL WARNING ONLY — never changes computed_status.
 */
export function hasMissingHeartbeat(status: SyncStatusResult | null): boolean {
  if (!status) return false;
  if (status.computed_status !== 'syncing' && status.computed_status !== 'starting') return false;
  return status.minutes_since_last_n8n_step >= 999999;
}

/** Detect if N8N heartbeat has been silent for a suspicious amount of time.
 *  This is a VISUAL WARNING ONLY — never changes computed_status.
 */
export function hasStaleHeartbeat(status: SyncStatusResult | null): boolean {
  if (!status) return false;
  if (status.computed_status !== 'syncing' && status.computed_status !== 'starting') return false;
  // Backend already handles stale detection in computed_status.
  // This helper is only for showing a subtle warning badge.
  return status.minutes_since_last_n8n_step > 10 && status.minutes_since_last_n8n_step < 999999;
}