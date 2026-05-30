import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { triggerTfiRefresh, WebhookError } from '@/services/n8n.service';
import {
  cancelSyncRun,
  forceReleaseSyncLock,
  cleanupZombieSyncs,
  releaseSyncLock,
  isActiveState,
  isProblemState,
  isCancellableState,
  formatElapsed,
  hasMissingHeartbeat,
  hasStaleHeartbeat,
} from '@/services/sync-lifecycle.service';
import { getAvailableSituations } from '@/services/tfi.service';
import { useSyncPolling } from '@/hooks/useSyncPolling';
import type { SyncStatusResult, ComputedSyncStatus } from '@/types/tfi.types';

function formatWebhookError(err: unknown): { userMessage: string } {
  if (err instanceof WebhookError) {
    if (err.status !== undefined) {
      const status = err.status;
      if (status === 404) return { userMessage: `Webhook respondió 404: endpoint no existe en N8N.` };
      if (status === 401 || status === 403) return { userMessage: `Webhook respondió ${status}: sin autorización.` };
      if (status >= 500) return { userMessage: `Webhook respondió ${status}: error interno en N8N.` };
      return { userMessage: `Webhook respondió ${status}: ${err.message}` };
    }
    return { userMessage: err.message };
  }
  if (err instanceof Error) return { userMessage: `Error inesperado: ${err.message}` };
  return { userMessage: 'Error desconocido al iniciar la sincronización.' };
}

function statusLabel(status: ComputedSyncStatus): string {
  const labels: Record<ComputedSyncStatus, string> = {
    idle: 'Listo',
    queued: 'En cola',
    starting: 'Iniciando',
    syncing: 'Sincronizando',
    finishing: 'Finalizando',
    completed: 'Completado',
    failed: 'Error',
    cancelled: 'Cancelado',
    stale: 'Atascado',
    timeout: 'Timeout',
    orphaned: 'Huérfano',
    zombie: 'Zombie',
    partial_failure: 'Parcial',
  };
  return labels[status] ?? status;
}

function statusColor(status: ComputedSyncStatus): { bg: string; text: string; border: string; badge: string } {
  switch (status) {
    case 'completed': return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' };
    case 'failed': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'bg-red-100 text-red-700' };
    case 'cancelled': return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
    case 'stale': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' };
    case 'timeout': return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' };
    case 'orphaned': return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
    case 'zombie': return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
    case 'partial_failure': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' };
    case 'syncing':
    case 'starting':
    case 'finishing': return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700' };
    case 'queued': return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700' };
    default: return { bg: 'bg-white', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
  }
}

export default function TfiRefreshControl() {
  const { selectedSession, sessions, selectedSituation, setSelectedSituation, triggerRefresh } = useSession();

  const activeSession = sessions.find((s) => s.id === selectedSession) ?? null;

  // ── Centralized polling via useSyncPolling ────────────────────────────────
  const { status: rawStatus, startPolling, stopPolling } = useSyncPolling(activeSession?.id ?? null);

  // ── Local state ────────────────────────────────────────────────────────────
  const [localStarting, setLocalStarting] = useState(false);
  const syncRunIdRef = useRef<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [availableSituations, setAvailableSituations] = useState<string[]>(['TODOS']);
  const [showForceModal, setShowForceModal] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const mountedRef = useRef(true);
  const prevStatusRef = useRef<ComputedSyncStatus | null>(null);

  // Derive effective status: use localStarting before backend confirms
  const backendStatus: ComputedSyncStatus = rawStatus?.computed_status ?? 'idle';
  const effectiveStatus: ComputedSyncStatus = localStarting && backendStatus === 'idle' ? 'starting' : backendStatus;

  // ── React to status transitions ───────────────────────────────────────────
  useEffect(() => {
    const prev = prevStatusRef.current;
    const current = effectiveStatus;
    if (prev === current) return;
    prevStatusRef.current = current;
    if (!mountedRef.current) return;

    if (current === 'completed') {
      showToastMsg('Sincronización completada. Recargando datos...', 'success');
      triggerRefresh();
      setLocalStarting(false);
      syncRunIdRef.current = null;
    } else if (current === 'failed') {
      const err = rawStatus?.sync_run_error_message ?? 'Error desconocido';
      showToastMsg(`Sincronización fallida: ${err}`, 'error');
      setLocalStarting(false);
      syncRunIdRef.current = null;
    } else if (current === 'cancelled') {
      showToastMsg('Sincronización cancelada', 'warning');
      setLocalStarting(false);
      syncRunIdRef.current = null;
    } else if (['stale', 'timeout', 'zombie', 'orphaned', 'partial_failure'].includes(current)) {
      setLocalStarting(false);
    }

    // Clear localStarting once backend confirms any non-idle state
    if (current !== 'idle' && localStarting) {
      setLocalStarting(false);
    }
  }, [effectiveStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ── Load situations ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedSession) {
      setAvailableSituations(['TODOS']);
      return;
    }
    getAvailableSituations(selectedSession)
      .then((situations) => {
        setAvailableSituations(situations);
        if (!situations.includes(selectedSituation)) {
          setSelectedSituation('TODOS');
        }
      })
      .catch(() => setAvailableSituations(['TODOS']));
  }, [selectedSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToastMsg = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => { if (mountedRef.current) setToast(null); }, 4000);
  }, []);

  // ── Handle refresh ────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    if (!activeSession) {
      showToastMsg('No hay sesión seleccionada', 'error');
      return;
    }

    if (isActiveState(effectiveStatus)) {
      showToastMsg('Ya hay una sincronización en curso.', 'warning');
      return;
    }

    // If problem state, release first
    if (isProblemState(effectiveStatus)) {
      console.log('[TfiRefreshControl] Problem state before sync:', effectiveStatus, '— releasing lock first');
      await releaseSyncLock(activeSession.id, `Reintento manual: estado anterior era ${effectiveStatus}`).catch(() => {});
    }

    const tempSyncRunId = crypto.randomUUID();
    syncRunIdRef.current = tempSyncRunId;

    // Optimistic local state
    setLocalStarting(true);

    const payload = {
      session_id: activeSession.id,
      session_name: activeSession.name,
      location: activeSession.location,
      situation: selectedSituation,
      triggered_from: 'TFI_FRONTEND',
      timestamp: new Date().toISOString(),
      sync_run_id: tempSyncRunId,
    };

    try {
      const returnedSyncRunId = await triggerTfiRefresh(payload, undefined, tempSyncRunId);

      if (returnedSyncRunId) {
        showToastMsg('Sincronización iniciada. Monitoreando...', 'success');
        syncRunIdRef.current = returnedSyncRunId;
      } else {
        showToastMsg('Sincronización iniciada pero sin sync_run_id. Esperando...', 'warning');
      }

      // Start polling — this is shared with WarehouseSyncButtons via registry
      startPolling();
    } catch (err) {
      const { userMessage } = formatWebhookError(err);
      setLocalStarting(false);
      syncRunIdRef.current = null;
      showToastMsg(userMessage, 'error');
    }
  }, [activeSession, effectiveStatus, selectedSituation, showToastMsg, startPolling]);

  // ── Stop / Cancel ──────────────────────────────────────────────────────────
  const handleStop = useCallback(async () => {
    if (!activeSession) return;

    stopPolling();
    setLocalStarting(false);

    const syncRunId = syncRunIdRef.current;

    if (!syncRunId) {
      await releaseSyncLock(activeSession.id, 'Detención manual desde TfiRefreshControl').catch(() => {});
      showToastMsg('Sincronización detenida', 'warning');
      syncRunIdRef.current = null;
      return;
    }

    try {
      const result = await cancelSyncRun(syncRunId, activeSession.id);
      if (result.cancelled) {
        showToastMsg('Sincronización cancelada', 'warning');
      } else {
        showToastMsg(`No se pudo cancelar: ${result.message}`, 'error');
      }
    } catch (err) {
      console.error('[TfiRefreshControl] cancel error:', err);
      await releaseSyncLock(activeSession.id, 'Detención manual fallback').catch(() => {});
      showToastMsg('Sincronización detenida (fallback)', 'warning');
    }

    syncRunIdRef.current = null;
  }, [activeSession, showToastMsg, stopPolling]);

  // ── Force unlock ───────────────────────────────────────────────────────────
  const handleForceUnlock = useCallback(async () => {
    if (!activeSession) return;
    setForceLoading(true);
    try {
      const result = await forceReleaseSyncLock(activeSession.id, 'Force unlock via TfiRefreshControl');
      if (result.released) {
        stopPolling();
        setLocalStarting(false);
        syncRunIdRef.current = null;
        showToastMsg('Sincronización liberada. ' + result.message, 'warning');
      } else {
        showToastMsg('No se pudo liberar: ' + result.message, 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToastMsg('Error al liberar: ' + msg, 'error');
    } finally {
      setForceLoading(false);
      setShowForceModal(false);
    }
  }, [activeSession, showToastMsg, stopPolling]);

  // ── Cleanup all zombies ────────────────────────────────────────────────────
  const handleCleanupAll = useCallback(async () => {
    setForceLoading(true);
    try {
      const cleanup = await cleanupZombieSyncs(60, 5);
      const total = cleanup.cleaned_locks + cleanup.cleaned_syncs + cleanup.cleaned_branches;
      if (total > 0) {
        showToastMsg(`Limpieza: ${cleanup.cleaned_locks} locks, ${cleanup.cleaned_syncs} syncs, ${cleanup.cleaned_branches} ramas`, 'warning');
        stopPolling();
        setLocalStarting(false);
        triggerRefresh();
      } else {
        showToastMsg('No se encontraron sincronizaciones colgadas', 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToastMsg(`Error en limpieza: ${msg}`, 'error');
    } finally {
      setForceLoading(false);
    }
  }, [showToastMsg, stopPolling, triggerRefresh]);

  // ── Render helpers ─────────────────────────────────────────────────────────
  const isActive = isActiveState(effectiveStatus);
  const needsUnlock = isProblemState(effectiveStatus);
  const canCancel = isCancellableState(effectiveStatus);
  const colors = statusColor(effectiveStatus);

  // Backend data for debug panel
  const lastPollData: SyncStatusResult | null = rawStatus ?? null;
  const minutesSinceStart = rawStatus?.minutes_since_start ?? 0;
  const syncRows = rawStatus?.sync_run_total_rows ?? null;
  const syncBranches = { completed: rawStatus?.branches_completed ?? 0, total: rawStatus?.branch_count ?? 0 };

  // Visual warnings — NO status change
  const missingHeartbeat = hasMissingHeartbeat(rawStatus);
  const staleHeartbeat = hasStaleHeartbeat(rawStatus);
  const showHeartbeatWarning = (missingHeartbeat || staleHeartbeat) && isActive;

  const statusIndicator = () => {
    if (isActive) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-sky-600 flex-wrap">
          <i className="ri-loader-4-line animate-spin text-sm"></i>
          {effectiveStatus === 'starting' ? 'Iniciando...' : effectiveStatus === 'finishing' ? 'Finalizando...' : `Sincronizando... ${formatElapsed(minutesSinceStart)}`}
          {syncRows !== null && ` · ${syncRows.toLocaleString()} filas`}
          {syncBranches.total > 0 && ` · ${syncBranches.completed}/${syncBranches.total} ramas`}
          {showHeartbeatWarning && (
            <span className="text-amber-600 flex items-center gap-1">
              <i className="ri-alert-line"></i>
              {missingHeartbeat ? 'Sin heartbeat' : `N8N inactivo ${Math.floor(rawStatus?.minutes_since_last_n8n_step ?? 0)}m`}
            </span>
          )}
        </span>
      );
    }
    if (effectiveStatus === 'completed') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <i className="ri-checkbox-circle-line text-sm"></i>
          Última actualización exitosa
        </span>
      );
    }
    if (effectiveStatus === 'failed') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-red-600">
          <i className="ri-error-warning-line text-sm"></i>
          {statusLabel(effectiveStatus)}
        </span>
      );
    }
    if (effectiveStatus === 'cancelled') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <i className="ri-close-circle-line text-sm"></i>
          Cancelado
        </span>
      );
    }
    if (needsUnlock) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-orange-600">
          <i className="ri-alarm-warning-line text-sm"></i>
          {rawStatus?.computed_message || `Sync ${effectiveStatus} — requiere atención`}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="relative flex items-center gap-2">
      {/* Selector de Situación */}
      <div className="flex items-center gap-1.5">
        <i className="ri-filter-3-line text-gray-400 text-sm shrink-0"></i>
        <select
          value={selectedSituation}
          onChange={(e) => setSelectedSituation(e.target.value)}
          className="border border-gray-200 rounded-lg text-sm px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
        >
          {availableSituations.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Debug toggle */}
      <button
        onClick={() => setShowDebugPanel((p) => !p)}
        title="Debug sync"
        className="flex items-center justify-center w-7 h-7 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <i className={`ri-${showDebugPanel ? 'eye-off' : 'eye'}-line text-xs`}></i>
      </button>

      {/* Sync button + controls */}
      <div className="flex items-center gap-2">
        {canCancel && (
          <button
            onClick={handleStop}
            title="Cancelar sincronización"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
          >
            <i className="ri-stop-fill text-sm"></i>
          </button>
        )}

        {needsUnlock && (
          <button
            onClick={() => setShowForceModal(true)}
            title="Liberar sincronización (admin)"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors cursor-pointer"
          >
            <i className="ri-lock-unlock-line text-sm"></i>
          </button>
        )}

        <button
          onClick={handleRefresh}
          disabled={isActive || !activeSession}
          className={`flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
            isActive || !activeSession
              ? 'border-gray-200 text-gray-400 bg-white cursor-not-allowed'
              : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
          }`}
        >
          {isActive ? (
            <i className="ri-loader-4-line animate-spin text-sm"></i>
          ) : needsUnlock ? (
            <i className="ri-restart-line text-sm"></i>
          ) : (
            <i className="ri-refresh-line text-sm"></i>
          )}
          {needsUnlock ? 'Reintentar' : isActive ? 'Sincronizando...' : 'Sincronizar'}
        </button>
      </div>

      {/* Status indicator */}
      <div className="hidden lg:flex flex-col min-w-[180px]">
        {statusIndicator()}

        {/* Debug panel — REAL backend data only */}
        {showDebugPanel && lastPollData && (
          <div className={`mt-2 rounded-lg border p-2.5 space-y-1 text-[10px] font-mono ${colors.bg} ${colors.border}`}>
            <div className="flex items-center justify-between">
              <span className="opacity-60">Backend status:</span>
              <span className={`font-semibold ${colors.text}`}>{lastPollData.computed_status}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-60">Mensaje:</span>
              <span className="text-right max-w-[120px] truncate">{lastPollData.computed_message}</span>
            </div>
            {lastPollData.sync_run_id && (
              <div className="flex items-center justify-between">
                <span className="opacity-60">SyncRun ID:</span>
                <span>{lastPollData.sync_run_id.slice(0, 8)}...</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="opacity-60">Lock activo:</span>
              <span className={lastPollData.lock_is_running ? 'text-emerald-600' : 'text-gray-400'}>
                {lastPollData.lock_is_running ? 'Sí' : 'No'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-60">Filas:</span>
              <span>{lastPollData.sync_run_total_rows ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-60">Ramas:</span>
              <span>{lastPollData.branches_completed}/{lastPollData.branch_count}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-60">Tiempo:</span>
              <span>{lastPollData.minutes_since_start.toFixed(1)}min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-60">N8N idle:</span>
              <span>{lastPollData.minutes_since_last_n8n_step.toFixed(1)}min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="opacity-60">Últ. update:</span>
              <span>{lastPollData.minutes_since_last_update.toFixed(1)}min</span>
            </div>
            {lastPollData.sync_run_error_message && lastPollData.sync_run_error_message !== lastPollData.computed_message && (
              <div className="pt-1 border-t border-black/5">
                <span className="opacity-60">Error:</span>
                <span className="text-red-500 block">{lastPollData.sync_run_error_message.slice(0, 100)}</span>
              </div>
            )}
          </div>
        )}

        {showDebugPanel && !lastPollData && effectiveStatus === 'idle' && (
          <div className="mt-2 rounded-lg border p-2.5 text-[10px] font-mono bg-gray-50 border-gray-200 text-gray-400">
            No hay sync activo. Backend limpio.
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`absolute right-0 top-10 z-50 flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg border whitespace-nowrap ${
          toast.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : toast.type === 'error'
            ? 'bg-red-50 text-red-700 border-red-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}>
          <i className={toast.type === 'success' ? 'ri-checkbox-circle-line text-sm' : toast.type === 'error' ? 'ri-error-warning-line text-sm' : 'ri-alert-line text-sm'}></i>
          {toast.message}
        </div>
      )}

      {/* Force Unlock Modal */}
      {showForceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded-lg">
                <i className="ri-alarm-warning-line text-red-600 text-lg"></i>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Liberar sincronización</h3>
                <p className="text-xs text-gray-500">{activeSession?.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Esto forzará la liberación del bloqueo. Úsalo solo cuando el sync esté atascado.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowForceModal(false)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleForceUnlock}
                disabled={forceLoading}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {forceLoading ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <i className="ri-loader-4-line animate-spin text-sm"></i>
                    Liberando...
                  </span>
                ) : (
                  'Liberar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}