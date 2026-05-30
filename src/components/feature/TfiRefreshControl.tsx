import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import {
  forceReleaseSyncLock,
  isActiveState,
  isProblemState,
  formatElapsed,
  hasMissingHeartbeat,
  hasStaleHeartbeat,
} from '@/services/sync-lifecycle.service';
import { useSyncPolling } from '@/hooks/useSyncPolling';
import type { SyncStatusResult, ComputedSyncStatus } from '@/types/tfi.types';

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

export default function TfiRefreshControl() {
  const { selectedSession, sessions } = useSession();

  const activeSession = sessions.find((s) => s.id === selectedSession) ?? null;

  const { status: rawStatus } = useSyncPolling(activeSession?.id ?? null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [showForceModal, setShowForceModal] = useState(false);
  const [forceLoading, setForceLoading] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const showToastMsg = useCallback((message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => { if (mountedRef.current) setToast(null); }, 4000);
  }, []);

  const handleForceUnlock = useCallback(async () => {
    if (!activeSession) return;
    setForceLoading(true);
    try {
      const result = await forceReleaseSyncLock(activeSession.id, 'Force unlock via TfiRefreshControl');
      if (result.released) {
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
  }, [activeSession, showToastMsg]);

  const effectiveStatus = rawStatus?.computed_status ?? 'idle';
  const isActive = isActiveState(effectiveStatus);
  const needsUnlock = isProblemState(effectiveStatus);

  const minutesSinceStart = rawStatus?.minutes_since_start ?? 0;
  const syncRows = rawStatus?.sync_run_total_rows ?? null;
  const syncBranches = { completed: rawStatus?.branches_completed ?? 0, total: rawStatus?.branch_count ?? 0 };

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
      {/* Force unlock button only for problem states */}
      {needsUnlock && (
        <button
          onClick={() => setShowForceModal(true)}
          title="Liberar sincronización (admin)"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-colors cursor-pointer"
        >
          <i className="ri-lock-unlock-line text-sm"></i>
        </button>
      )}

      {/* Status indicator */}
      <div className="hidden lg:flex flex-col min-w-[180px]">
        {statusIndicator()}
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