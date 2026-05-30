import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { triggerTfiRefresh, WebhookError } from '@/services/n8n.service';
import {
  getSyncStatusV2,
  cancelSyncRun,
  forceReleaseSyncLock,
  cleanupZombieSyncs,
  acquireSyncLock,
  releaseSyncLock,
  isActiveState,
  isProblemState,
  isTerminalState,
  isCancellableState,
  formatElapsed,
  hasMissingHeartbeat,
  hasStaleHeartbeat,
} from '@/services/sync-lifecycle.service';
import { useSyncPolling } from '@/hooks/useSyncPolling';
import type { SyncStatusResult, ComputedSyncStatus, ForceReleaseResult } from '@/types/tfi.types';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Warehouse {
  id: string;
  name: string;
  sessionId: string;
  url: string;
  icon: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  hoverBgClass: string;
}

interface WarehouseSyncState {
  status: ComputedSyncStatus;
  syncRunId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  message: string;
  totalRows: number | null;
  branchesCompleted: number;
  branchesTotal: number;
  minutesSinceStart: number;
  lastN8nStepAt: string | null;
  lastN8nStepName: string | null;
  lastPollData: SyncStatusResult | null;
}

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  message: string;
  type: ToastType;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const WAREHOUSES: Warehouse[] = [
  {
    id: 'patio-febeca',
    name: 'Patio Febeca',
    sessionId: '4e2ed739-0f8f-475e-92af-aa8333e83efa',
    url: 'https://sandboxn8n.mayoreo.biz/webhook/tfi-refresh',
    icon: 'ri-store-3-line',
    bgClass: 'bg-emerald-50',
    textClass: 'text-emerald-700',
    borderClass: 'border-emerald-200',
    hoverBgClass: 'hover:bg-emerald-100',
  },
  {
    id: 'febeca',
    name: 'Febeca',
    sessionId: 'f6318dca-faca-47e5-bc4e-483929710493',
    url: 'https://sandboxn8n.mayoreo.biz/webhook/tfi-refresh1',
    icon: 'ri-building-2-line',
    bgClass: 'bg-sky-50',
    textClass: 'text-sky-700',
    borderClass: 'border-sky-200',
    hoverBgClass: 'hover:bg-sky-100',
  },
  {
    id: 'sillaca',
    name: 'Sillaca',
    sessionId: 'ccbf13c4-c0ac-4a7e-900e-bd2965a34339',
    url: 'https://sandboxn8n.mayoreo.biz/webhook/tfi-refresh2',
    icon: 'ri-home-smile-line',
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700',
    borderClass: 'border-amber-200',
    hoverBgClass: 'hover:bg-amber-100',
  },
  {
    id: 'beval',
    name: 'Beval',
    sessionId: 'db053880-e067-4062-bd4c-c124e3ab20f0',
    url: 'https://sandboxn8n.mayoreo.biz/webhook/tfi-refresh3',
    icon: 'ri-building-4-line',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200',
    hoverBgClass: 'hover:bg-rose-100',
  },
];

const SUCCESS_DISPLAY_MS = 4000;
const ERROR_DISPLAY_MS = 6000;

// ─── Helpers visuales ─────────────────────────────────────────────────────────

function getStatusLabel(status: ComputedSyncStatus): string {
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

function getStatusIcon(status: ComputedSyncStatus): string {
  const icons: Record<ComputedSyncStatus, string> = {
    idle: 'ri-refresh-line',
    queued: 'ri-hourglass-line',
    starting: 'ri-loader-4-line animate-spin',
    syncing: 'ri-loader-4-line animate-spin',
    finishing: 'ri-loader-4-line animate-spin',
    completed: 'ri-checkbox-circle-line',
    failed: 'ri-error-warning-line',
    cancelled: 'ri-close-circle-line',
    stale: 'ri-time-line',
    timeout: 'ri-alarm-warning-line',
    orphaned: 'ri-ghost-line',
    zombie: 'ri-skull-line',
    partial_failure: 'ri-alert-line',
  };
  return icons[status] ?? 'ri-question-line';
}

function getStatusColorClasses(status: ComputedSyncStatus): { bg: string; text: string; border: string; badge: string } {
  switch (status) {
    case 'completed':
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-700' };
    case 'failed':
      return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', badge: 'bg-red-100 text-red-700' };
    case 'cancelled':
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
    case 'stale':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' };
    case 'timeout':
      return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700' };
    case 'orphaned':
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
    case 'zombie':
      return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
    case 'partial_failure':
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' };
    case 'syncing':
    case 'starting':
    case 'finishing':
      return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700' };
    case 'queued':
      return { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', badge: 'bg-sky-100 text-sky-700' };
    default:
      return { bg: 'bg-white', text: 'text-gray-600', border: 'border-gray-200', badge: 'bg-gray-100 text-gray-600' };
  }
}

function buildStateFromStatus(status: SyncStatusResult | null): WarehouseSyncState {
  if (!status) {
    return {
      status: 'idle',
      syncRunId: null,
      startedAt: null,
      finishedAt: null,
      error: null,
      message: '',
      totalRows: null,
      branchesCompleted: 0,
      branchesTotal: 0,
      minutesSinceStart: 0,
      lastN8nStepAt: null,
      lastN8nStepName: null,
      lastPollData: null,
    };
  }

  // Use backend computed_status directly — NO overrides
  const computedStatus = status.computed_status;

  // Warning info for display (does NOT change status)
  const missingHeartbeat = hasMissingHeartbeat(status);
  const staleHeartbeat = hasStaleHeartbeat(status);

  let message = status.computed_message;

  // Visual-only warning messages for syncing states
  if (computedStatus === 'syncing' || computedStatus === 'starting') {
    if (missingHeartbeat) {
      message = 'Esperando actividad de N8N...';
    } else if (staleHeartbeat) {
      message = `Sin heartbeat de N8N (${Math.floor(status.minutes_since_last_n8n_step)}m)`;
    }
  }

  return {
    status: computedStatus,
    syncRunId: status.sync_run_id,
    startedAt: status.sync_run_started_at,
    finishedAt: status.sync_run_finished_at,
    error: status.sync_run_error_message,
    message,
    totalRows: status.sync_run_total_rows,
    branchesCompleted: status.branches_completed ?? 0,
    branchesTotal: status.branch_count ?? 0,
    minutesSinceStart: status.minutes_since_start,
    lastN8nStepAt: status.last_n8n_step_at,
    lastN8nStepName: status.last_n8n_step_name,
    lastPollData: status,
  };
}

// ─── Componente individual de almacén ────────────────────────────────────────

interface WarehouseCardProps {
  warehouse: Warehouse;
  selectedSituation: string;
  showDebugPanel: boolean;
  onShowForceModal: () => void;
  onSyncStart: (syncRunId: string) => void;
  onSyncStop: () => void;
  showToast: (message: string, type: ToastType) => void;
  triggerRefresh: () => void;
}

function WarehouseCard({
  warehouse,
  selectedSituation,
  showDebugPanel,
  onShowForceModal,
  onSyncStart,
  onSyncStop,
  showToast,
  triggerRefresh,
}: WarehouseCardProps) {
  const { status: rawStatus, startPolling, stopPolling } = useSyncPolling(warehouse.sessionId);

  const mountedRef = useRef(true);
  const syncRunIdRef = useRef<string | null>(null);

  // Local override for 'starting' state before first backend poll confirms it
  const [localStarting, setLocalStarting] = useState(false);
  const localStartingRef = useRef(false);

  // Track previous status to detect transitions
  const prevStatusRef = useRef<ComputedSyncStatus | null>(null);

  const state = buildStateFromStatus(rawStatus);
  const effectiveStatus: ComputedSyncStatus = localStarting && state.status === 'idle' ? 'starting' : state.status;

  // React to status changes from polling
  useEffect(() => {
    const prev = prevStatusRef.current;
    const current = effectiveStatus;

    if (prev === current) return;
    prevStatusRef.current = current;

    if (!mountedRef.current) return;

    if (current === 'completed') {
      triggerRefresh();
      showToast(`Sincronización de ${warehouse.name} completada`, 'success');
      // Clear 'starting' override once backend confirms a terminal state
      setLocalStarting(false);
      localStartingRef.current = false;
    } else if (current === 'failed') {
      const err = state.error ?? 'Error desconocido';
      showToast(`Error en ${warehouse.name}: ${err}`, 'error');
      setLocalStarting(false);
      localStartingRef.current = false;
    } else if (current === 'cancelled') {
      showToast(`Sincronización de ${warehouse.name} cancelada`, 'warning');
      setLocalStarting(false);
      localStartingRef.current = false;
    } else if (['stale', 'timeout', 'zombie', 'orphaned', 'partial_failure'].includes(current)) {
      setLocalStarting(false);
      localStartingRef.current = false;
    }

    // Stop local starting override once backend shows any non-idle state
    if (current !== 'idle' && localStartingRef.current) {
      setLocalStarting(false);
      localStartingRef.current = false;
    }
  }, [effectiveStatus, warehouse.name, state.error, showToast, triggerRefresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // On mount: check backend once. If active, start polling.
  useEffect(() => {
    const checkOnMount = async () => {
      try {
        const status = await getSyncStatusV2(warehouse.sessionId);
        if (!mountedRef.current) return;
        if (status && isActiveState(status.computed_status)) {
          startPolling();
        }
      } catch (err) {
        console.error(`[WarehouseCard] ${warehouse.name} mount check error:`, err);
      }
    };
    checkOnMount();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = useCallback(async () => {
    // Block if this warehouse is already active
    if (isActiveState(effectiveStatus)) {
      showToast(`${warehouse.name} ya está sincronizando.`, 'warning');
      return;
    }

    // If problem state, release first
    if (isProblemState(effectiveStatus)) {
      console.log(`[Sync] ${warehouse.name} — problem state, releasing lock`);
      try {
        await releaseSyncLock(warehouse.sessionId, `Reintento manual: estado anterior era ${effectiveStatus}`);
      } catch (e) {
        console.error(`[Sync] ${warehouse.name} — releaseSyncLock error:`, e);
      }
    }

    const tempSyncRunId = crypto.randomUUID();
    syncRunIdRef.current = tempSyncRunId;

    // Optimistic local state: show 'starting' before backend confirms
    setLocalStarting(true);
    localStartingRef.current = true;

    // Acquire lock
    let acquired = false;
    try {
      acquired = await acquireSyncLock(warehouse.sessionId, tempSyncRunId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al adquirir bloqueo';
      showToast(`Error de bloqueo: ${msg}`, 'error');
      setLocalStarting(false);
      localStartingRef.current = false;
      return;
    }

    if (!acquired) {
      // Try force release if problem state
      try {
        const freshStatus = await getSyncStatusV2(warehouse.sessionId);
        if (freshStatus && isProblemState(freshStatus.computed_status)) {
          await forceReleaseSyncLock(warehouse.sessionId, `Auto-release: ${freshStatus.computed_status}`).catch(() => {});
          acquired = await acquireSyncLock(warehouse.sessionId, tempSyncRunId);
        }
      } catch {
        // ignore
      }

      if (!acquired) {
        showToast('Ya existe una sincronización en curso para este almacén', 'warning');
        setLocalStarting(false);
        localStartingRef.current = false;
        return;
      }
    }

    onSyncStart(tempSyncRunId);

    const payload = {
      session_id: warehouse.sessionId,
      session_name: warehouse.name,
      location: warehouse.name,
      situation: selectedSituation,
      triggered_from: 'TFI_FRONTEND',
      timestamp: new Date().toISOString(),
      warehouse: warehouse.name,
      warehouse_id: warehouse.id,
      sync_run_id: tempSyncRunId,
    };

    try {
      console.log(`[WarehouseSync] ${warehouse.name} → ${warehouse.url}`, payload);
      const realSyncRunId = await triggerTfiRefresh(payload, warehouse.url, tempSyncRunId);
      console.log(`[WarehouseSync] ${warehouse.name} — sync_run_id:`, realSyncRunId);

      // Start centralized polling — single interval shared with TfiRefreshControl
      startPolling();
    } catch (err) {
      const msg = err instanceof WebhookError ? err.message : err instanceof Error ? err.message : 'Error desconocido';
      console.error(`[WarehouseSync] ${warehouse.name} error:`, msg);

      try {
        await releaseSyncLock(warehouse.sessionId, msg);
      } catch {
        await forceReleaseSyncLock(warehouse.sessionId, `Fallback release: ${msg}`).catch(() => {});
      }

      setLocalStarting(false);
      localStartingRef.current = false;
      showToast(`Error en ${warehouse.name}: ${msg}`, 'error');
    }
  }, [effectiveStatus, warehouse, selectedSituation, showToast, acquireSyncLock, startPolling, onSyncStart]);

  const handleStop = useCallback(async () => {
    // Use backend sync_run_id as primary source, fallback to local ref
    const syncRunId = state.syncRunId ?? syncRunIdRef.current;

    stopPolling();
    setLocalStarting(false);
    localStartingRef.current = false;

    if (syncRunId) {
      try {
        const result = await cancelSyncRun(syncRunId, warehouse.sessionId);
        if (result.cancelled) {
          showToast(`Sincronización de ${warehouse.name} cancelada`, 'warning');
        } else {
          showToast(`No se pudo cancelar: ${result.message}`, 'error');
        }
      } catch (err) {
        console.error(`[Stop] ${warehouse.name} cancel error:`, err);
        await releaseSyncLock(warehouse.sessionId, 'Detención forzada fallback').catch(() => {});
        showToast(`Sincronización de ${warehouse.name} detenida (fallback)`, 'warning');
      }
    } else {
      await releaseSyncLock(warehouse.sessionId, 'Detención forzada por el usuario').catch(() => {});
      showToast(`Sincronización de ${warehouse.name} detenida`, 'warning');
    }

    onSyncStop();
  }, [state.syncRunId, warehouse, showToast, stopPolling, onSyncStop]);

  const isThisActive = isActiveState(effectiveStatus);
  const needsUnlock = isProblemState(effectiveStatus);
  const canCancel = isCancellableState(effectiveStatus);
  const statusColor = getStatusColorClasses(effectiveStatus);
  const hasActiveSyncRun = Boolean(state.syncRunId) && isThisActive;

  // Visual warning for missing heartbeat (does NOT change status)
  const missingHeartbeat = hasMissingHeartbeat(rawStatus);
  const staleHeartbeat = hasStaleHeartbeat(rawStatus);
  const showHeartbeatWarning = (missingHeartbeat || staleHeartbeat) && isThisActive;

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-xl border transition-colors ${warehouse.bgClass} ${warehouse.borderClass}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 flex items-center justify-center rounded-lg bg-white border ${warehouse.borderClass}`}>
          <i className={`${warehouse.icon} ${warehouse.textClass} text-lg`}></i>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800">{warehouse.name}</h3>
          <p className="text-xs text-gray-500 truncate">
            {isThisActive
              ? `Sincronizando... ${formatElapsed(state.minutesSinceStart)}`
              : effectiveStatus === 'completed'
              ? 'Actualizado'
              : effectiveStatus === 'failed'
              ? 'Falló'
              : effectiveStatus === 'cancelled'
              ? 'Cancelado'
              : needsUnlock
              ? 'Requiere atención'
              : 'Sincronización desde WMS'}
          </p>
        </div>
      </div>

      {/* Status badge */}
      {effectiveStatus !== 'idle' && (
        <div className={`flex flex-col gap-1 rounded-md px-2.5 py-1.5 text-xs ${statusColor.badge}`}>
          <div className="flex items-center gap-1.5 font-medium">
            <i className={getStatusIcon(effectiveStatus)}></i>
            {getStatusLabel(effectiveStatus)}
            {state.minutesSinceStart > 0 && isThisActive && (
              <span className="text-gray-400 font-normal">({formatElapsed(state.minutesSinceStart)})</span>
            )}
          </div>

          {/* Backend computed_message — shown as-is */}
          {state.message && (
            <p className="text-xs opacity-80 leading-tight">{state.message}</p>
          )}

          {/* Visual warning about heartbeat — does NOT change status */}
          {showHeartbeatWarning && (
            <p className="text-xs text-amber-600 leading-tight flex items-center gap-1">
              <i className="ri-alert-line"></i>
              {missingHeartbeat ? 'Sin heartbeat de N8N' : `N8N inactivo ${Math.floor(rawStatus?.minutes_since_last_n8n_step ?? 0)}m`}
            </p>
          )}

          {hasActiveSyncRun && (
            <p className="text-xs opacity-70">
              {state.totalRows !== null ? `${state.totalRows.toLocaleString()} filas` : '0 filas'} — {state.branchesCompleted}/{state.branchesTotal} ramas
            </p>
          )}

          {effectiveStatus === 'failed' && state.error && state.error !== state.message && (
            <p className="text-xs text-red-600 leading-tight line-clamp-2">{state.error}</p>
          )}

          {/* Debug panel */}
          {showDebugPanel && state.lastPollData && (
            <div className="mt-1 pt-1 border-t border-black/5 space-y-0.5">
              <div className="flex justify-between text-[10px] opacity-60">
                <span>Backend status:</span>
                <span className="font-semibold">{state.lastPollData.computed_status}</span>
              </div>
              <div className="flex justify-between text-[10px] opacity-60">
                <span>Lock:</span>
                <span className={state.lastPollData.lock_is_running ? 'text-emerald-600' : 'text-gray-400'}>
                  {state.lastPollData.lock_is_running ? 'Sí' : 'No'}
                </span>
              </div>
              {state.lastPollData.sync_run_id && (
                <div className="flex justify-between text-[10px] opacity-60">
                  <span>SyncRun:</span>
                  <span>{state.lastPollData.sync_run_id.slice(0, 8)}...</span>
                </div>
              )}
              <div className="flex justify-between text-[10px] opacity-60">
                <span>N8N idle:</span>
                <span>{state.lastPollData.minutes_since_last_n8n_step.toFixed(1)}min</span>
              </div>
              <div className="flex justify-between text-[10px] opacity-60">
                <span>Filas:</span>
                <span>{state.lastPollData.sync_run_total_rows ?? '—'}</span>
              </div>
              <div className="flex justify-between text-[10px] opacity-60">
                <span>Ramas:</span>
                <span>{state.lastPollData.branches_completed}/{state.lastPollData.branch_count}</span>
              </div>
              <div className="flex justify-between text-[10px] opacity-60">
                <span>Tiempo:</span>
                <span>{state.lastPollData.minutes_since_start.toFixed(1)}min</span>
              </div>
            </div>
          )}
          {showDebugPanel && !state.lastPollData && (
            <div className="mt-1 pt-1 border-t border-black/5 text-[10px] text-gray-400">
              No hay datos de backend. Estado idle.
            </div>
          )}
        </div>
      )}

      {/* Botones */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSync}
          disabled={isThisActive}
          className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
            isThisActive
              ? 'border-gray-200 text-gray-400 bg-white/60 cursor-not-allowed'
              : `border-white/80 ${warehouse.textClass} bg-white ${warehouse.hoverBgClass} shadow-sm`
          }`}
        >
          <div className="w-4 h-4 flex items-center justify-center">
            {isThisActive ? (
              <i className="ri-loader-4-line animate-spin text-sm"></i>
            ) : needsUnlock ? (
              <i className="ri-restart-line text-sm"></i>
            ) : effectiveStatus === 'completed' ? (
              <i className="ri-checkbox-circle-line text-sm text-emerald-600"></i>
            ) : effectiveStatus === 'failed' || effectiveStatus === 'timeout' || effectiveStatus === 'cancelled' ? (
              <i className="ri-refresh-line text-sm"></i>
            ) : (
              <i className="ri-refresh-line text-sm"></i>
            )}
          </div>
          {needsUnlock
            ? 'Reintentar'
            : isThisActive
            ? effectiveStatus === 'starting'
              ? 'Iniciando...'
              : 'Sincronizando...'
            : effectiveStatus === 'completed'
            ? 'Actualizado'
            : effectiveStatus === 'failed' || effectiveStatus === 'timeout' || effectiveStatus === 'cancelled'
            ? 'Reintentar'
            : 'Sincronizar'}
        </button>

        {canCancel && (
          <button
            onClick={handleStop}
            title="Cancelar sincronización"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer flex-shrink-0"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-stop-fill text-base"></i>
            </div>
          </button>
        )}

        {needsUnlock && (
          <button
            onClick={onShowForceModal}
            title="Liberar sincronización (admin)"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors cursor-pointer flex-shrink-0"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-lock-unlock-line text-base"></i>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function WarehouseSyncButtons() {
  const { selectedSituation, triggerRefresh } = useSession();

  const [toast, setToast] = useState<Toast | null>(null);
  const [showForceModal, setShowForceModal] = useState<string | null>(null);
  const [forceLoading, setForceLoading] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    const duration = type === 'error' ? ERROR_DISPLAY_MS : SUCCESS_DISPLAY_MS;
    setTimeout(() => {
      if (mountedRef.current) setToast(null);
    }, duration);
  }, []);

  const handleForceUnlock = useCallback(async (warehouse: Warehouse) => {
    setForceLoading(true);
    try {
      const result: ForceReleaseResult = await forceReleaseSyncLock(
        warehouse.sessionId,
        'Force unlock via admin button'
      );
      if (result.released) {
        showToast(`${warehouse.name}: Sincronización liberada. ${result.message}`, 'warning');
      } else {
        showToast(`${warehouse.name}: No se pudo liberar — ${result.message}`, 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast(`Error al liberar: ${msg}`, 'error');
    } finally {
      setForceLoading(false);
      setShowForceModal(null);
    }
  }, [showToast]);

  const handleCleanupAll = useCallback(async () => {
    setForceLoading(true);
    try {
      const cleanup = await cleanupZombieSyncs(60, 5);
      const total = cleanup.cleaned_locks + cleanup.cleaned_syncs + cleanup.cleaned_branches;
      if (total > 0) {
        showToast(
          `Limpieza: ${cleanup.cleaned_locks} locks, ${cleanup.cleaned_syncs} syncs, ${cleanup.cleaned_branches} ramas`,
          'warning'
        );
        triggerRefresh();
      } else {
        showToast('No se encontraron sincronizaciones colgadas', 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      showToast(`Error en limpieza: ${msg}`, 'error');
    } finally {
      setForceLoading(false);
    }
  }, [showToast, triggerRefresh]);

  return (
    <div className="relative">
      {/* Toast flotante */}
      {toast && (
        <div
          className={`absolute right-0 -top-12 z-50 flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg border whitespace-nowrap ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          <i className={`${toast.type === 'success' ? 'ri-checkbox-circle-line' : toast.type === 'error' ? 'ri-error-warning-line' : 'ri-alert-line'} text-sm`}></i>
          {toast.message}
        </div>
      )}

      {/* Debug controls */}
      <div className="mb-4 flex items-center justify-end gap-2">
        <button
          onClick={() => setShowDebugPanel((p) => !p)}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <div className="w-3.5 h-3.5 flex items-center justify-center">
            <i className={`ri-${showDebugPanel ? 'eye-off' : 'eye'}-line text-sm`}></i>
          </div>
          Debug
        </button>
        <button
          onClick={handleCleanupAll}
          disabled={forceLoading}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-100 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          <div className="w-3.5 h-3.5 flex items-center justify-center">
            {forceLoading ? (
              <i className="ri-loader-4-line animate-spin text-sm"></i>
            ) : (
              <i className="ri-brush-line text-sm"></i>
            )}
          </div>
          Limpiar syncs colgadas
        </button>
      </div>

      {/* Modal de Force Unlock */}
      {showForceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl border border-gray-200 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 flex items-center justify-center bg-red-50 rounded-lg">
                <i className="ri-alarm-warning-line text-red-600 text-lg"></i>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Liberar sincronización</h3>
                <p className="text-xs text-gray-500">{WAREHOUSES.find((w) => w.id === showForceModal)?.name}</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Forzará la liberación del bloqueo. Úsalo solo cuando el sync esté atascado y no responda.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowForceModal(null)}
                className="flex-1 text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const wh = WAREHOUSES.find((w) => w.id === showForceModal);
                  if (wh) handleForceUnlock(wh);
                }}
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

      {/* Grid de almacenes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {WAREHOUSES.map((wh) => (
          <WarehouseCard
            key={wh.id}
            warehouse={wh}
            selectedSituation={selectedSituation}
            showDebugPanel={showDebugPanel}
            onShowForceModal={() => setShowForceModal(wh.id)}
            onSyncStart={(id) => console.log(`[WarehouseSyncButtons] ${wh.name} sync started: ${id}`)}
            onSyncStop={() => console.log(`[WarehouseSyncButtons] ${wh.name} sync stopped`)}
            showToast={showToast}
            triggerRefresh={triggerRefresh}
          />
        ))}
      </div>
    </div>
  );
}