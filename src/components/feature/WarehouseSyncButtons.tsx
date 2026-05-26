import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { triggerTfiRefresh, WebhookError } from '@/services/n8n.service';
import {
  acquireSyncLock,
  releaseSyncLock,
  getSyncLocks,
  getRunningSyncForSession,
  getLatestSyncRun,
} from '@/services/tfi.service';
import type { TfiSyncRun } from '@/types/tfi.types';

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

type SyncStatus = 'idle' | 'starting' | 'syncing' | 'success' | 'error' | 'stale';

interface WarehouseSyncState {
  status: SyncStatus;
  syncRunId: string | null;
  startedAt: string | null;
  error: string | null;
  elapsedSeconds: number;
}

type ToastType = 'success' | 'error' | 'warning';
interface Toast {
  message: string;
  type: ToastType;
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3000;
const STALE_THRESHOLD_MINUTES = 60;
const SUCCESS_DISPLAY_MS = 4000;
const ERROR_DISPLAY_MS = 6000;

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateUUID(): string {
  return crypto.randomUUID();
}

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins > 0) return `${mins} min ${secs}s`;
  return `${secs}s`;
}

function isStale(startedAt: string | null): boolean {
  if (!startedAt) return false;
  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000 / 60;
  return elapsed >= STALE_THRESHOLD_MINUTES;
}

function calcElapsedFrom(startedAt: string | null): number {
  if (!startedAt) return 0;
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
}

function buildInitialState(): Record<string, WarehouseSyncState> {
  const state: Record<string, WarehouseSyncState> = {};
  for (const wh of WAREHOUSES) {
    state[wh.id] = {
      status: 'idle',
      syncRunId: null,
      startedAt: null,
      error: null,
      elapsedSeconds: 0,
    };
  }
  return state;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function WarehouseSyncButtons() {
  const { selectedSituation, triggerRefresh } = useSession();

  const [syncStates, setSyncStates] = useState<Record<string, WarehouseSyncState>>(buildInitialState);
  const [toast, setToast] = useState<Toast | null>(null);

  // Refs para polling
  const pollIntervalsRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const elapsedTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const mountedRef = useRef(true);
  const recoveryDoneRef = useRef(false);

  // ── Toast ────────────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    const duration = type === 'error' ? ERROR_DISPLAY_MS : SUCCESS_DISPLAY_MS;
    setTimeout(() => {
      if (mountedRef.current) setToast(null);
    }, duration);
  }, []);

  // ── Limpiar timers de un warehouse ──────────────────────────────────────

  const clearTimers = useCallback((warehouseId: string) => {
    if (pollIntervalsRef.current[warehouseId]) {
      clearInterval(pollIntervalsRef.current[warehouseId]);
      delete pollIntervalsRef.current[warehouseId];
    }
    if (elapsedTimersRef.current[warehouseId]) {
      clearInterval(elapsedTimersRef.current[warehouseId]);
      delete elapsedTimersRef.current[warehouseId];
    }
  }, []);

  // ── Iniciar polling (basado en sessionId, no en syncRunId) ──────────────

  const startPolling = useCallback(
    (
      warehouseId: string,
      sessionId: string,
      baseElapsedSeconds: number,
      startedAt: string | null,
    ) => {
      clearTimers(warehouseId);

      const warehouseName = WAREHOUSES.find((w) => w.id === warehouseId)?.name ?? warehouseId;

      // Timer de elapsed time (cada segundo)
      elapsedTimersRef.current[warehouseId] = setInterval(() => {
        if (!mountedRef.current) return;
        setSyncStates((prev) => {
          const current = prev[warehouseId];
          if (!current || current.status !== 'syncing') return prev;
          const newElapsed = current.elapsedSeconds + 1;
          const stale = isStale(startedAt ?? current.startedAt);
          return {
            ...prev,
            [warehouseId]: {
              ...current,
              elapsedSeconds: newElapsed,
              status: stale ? 'stale' : 'syncing',
            },
          };
        });
      }, 1000);

      // Inicializar elapsed
      setSyncStates((prev) => {
        const current = prev[warehouseId];
        if (!current || current.status !== 'syncing') return prev;
        return {
          ...prev,
          [warehouseId]: {
            ...current,
            elapsedSeconds: baseElapsedSeconds,
          },
        };
      });

      // Función de polling: busca por session_id, no por sync_run_id
      const poll = async () => {
        if (!mountedRef.current) return;

        try {
          const runningSync: TfiSyncRun | null = await getRunningSyncForSession(sessionId);

          if (runningSync) {
            // Aún está corriendo — seguimos esperando
            console.log(`[Poll] ${warehouseName} sigue running...`);
            return;
          }

          // No hay sync running — verificar el último sync para saber si completó o falló
          const latestSync: TfiSyncRun | null = await getLatestSyncRun(sessionId);

          if (!latestSync) {
            // n8n aún no ha creado ningún registro — seguimos esperando
            console.log(`[Poll] ${warehouseName} — aún sin registros en tfi_sync_runs`);
            return;
          }

          // ── Completado ────────────────────────────────────────────────
          if (latestSync.status === 'completed') {
            clearTimers(warehouseId);
            await releaseSyncLock(sessionId).catch(() => {});
            if (!mountedRef.current) return;

            setSyncStates((prev) => ({
              ...prev,
              [warehouseId]: {
                ...prev[warehouseId],
                status: 'success',
                error: null,
              },
            }));

            triggerRefresh();
            showToast(`Sincronización de ${warehouseName} completada`, 'success');

            setTimeout(() => {
              if (!mountedRef.current) return;
              setSyncStates((prev) => ({
                ...prev,
                [warehouseId]: {
                  ...buildInitialState()[warehouseId],
                },
              }));
            }, SUCCESS_DISPLAY_MS);

            return;
          }

          // ── Falló ────────────────────────────────────────────────────
          if (latestSync.status === 'failed') {
            clearTimers(warehouseId);
            const errMsg = latestSync.error_message ?? 'Error desconocido en n8n';
            await releaseSyncLock(sessionId, errMsg).catch(() => {});
            if (!mountedRef.current) return;

            setSyncStates((prev) => ({
              ...prev,
              [warehouseId]: {
                ...prev[warehouseId],
                status: 'error',
                error: errMsg,
              },
            }));

            showToast(`Error en sincronización: ${errMsg}`, 'error');

            setTimeout(() => {
              if (!mountedRef.current) return;
              setSyncStates((prev) => ({
                ...prev,
                [warehouseId]: {
                  ...buildInitialState()[warehouseId],
                },
              }));
            }, ERROR_DISPLAY_MS);

            return;
          }

          // status === 'running' u otro — el timer de stale se encarga
        } catch (err) {
          console.error(`[Poll] Error consultando estado para ${warehouseName}:`, err);
          // No detener el polling por errores de red
        }
      };

      // Primera consulta inmediata
      poll();
      // Luego cada 3 segundos
      pollIntervalsRef.current[warehouseId] = setInterval(poll, POLL_INTERVAL_MS);
    },
    [clearTimers, showToast, triggerRefresh]
  );

  // ── Recovery al montar ──────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;
    recoveryDoneRef.current = false;

    const recover = async () => {
      try {
        const locks = await getSyncLocks();
        if (!mountedRef.current || recoveryDoneRef.current) return;
        recoveryDoneRef.current = true;

        for (const lock of locks) {
          if (!lock.is_running) continue;

          const warehouse = WAREHOUSES.find((w) => w.sessionId === lock.session_id);
          if (!warehouse) continue;

          const stale = isStale(lock.started_at);
          const baseElapsed = calcElapsedFrom(lock.started_at);

          console.log(
            `[Recovery] ${warehouse.name} — is_running=true, stale=${stale}, baseElapsed=${baseElapsed}s`
          );

          setSyncStates((prev) => ({
            ...prev,
            [warehouse.id]: {
              status: stale ? 'stale' : 'syncing',
              syncRunId: lock.sync_run_id,
              startedAt: lock.started_at,
              error: null,
              elapsedSeconds: baseElapsed,
            },
          }));

          // Solo reanudar polling si no está stale
          if (!stale) {
            console.log(`[Recovery] Reanudando polling para ${warehouse.name}`);
            startPolling(warehouse.id, lock.session_id, baseElapsed, lock.started_at);
          }
        }
      } catch (err) {
        console.error('[Recovery] Error recuperando locks:', err);
      }
    };

    recover();

    return () => {
      mountedRef.current = false;
      for (const wh of WAREHOUSES) {
        clearTimers(wh.id);
      }
    };
  }, [clearTimers, startPolling]);

  // ── Handler: click en Sincronizar ───────────────────────────────────────

  // Bloqueo global: si CUALQUIER almacén está en starting/syncing, NADIE puede disparar
  const hasActiveSync = Object.values(syncStates).some(
    (s) => s.status === 'starting' || s.status === 'syncing'
  );

  const handleSync = useCallback(
    async (warehouse: Warehouse) => {
      const currentState = syncStates[warehouse.id];

      // ── Bloqueo global ──────────────────────────────────────────────
      if (hasActiveSync) {
        const activeWarehouse = WAREHOUSES.find(
          (w) => {
            const s = syncStates[w.id];
            return s?.status === 'starting' || s?.status === 'syncing';
          }
        );
        const activeName = activeWarehouse?.name ?? 'otro almacén';
        showToast(`No se puede sincronizar: ${activeName} está sincronizando. Esperá a que termine.`, 'warning');
        return;
      }

      // ── Stale: liberar lock viejo antes de reintentar ──────────────
      if (currentState?.status === 'stale') {
        try {
          await releaseSyncLock(warehouse.sessionId, 'Stale lock — liberado por reintento manual');
        } catch (err) {
          console.error('[Sync] Error liberando lock stale:', err);
        }
        // Limpiar estado local
        setSyncStates((prev) => ({
          ...prev,
          [warehouse.id]: { ...buildInitialState()[warehouse.id] },
        }));
      }

      // ── PASO 1 — Generar syncRunId temporal ────────────────────────
      const tempSyncRunId = generateUUID();

      // ── PASO 2 — Adquirir lock ─────────────────────────────────────
      try {
        const locked = await acquireSyncLock(warehouse.sessionId, tempSyncRunId);
        if (!locked) {
          showToast('Ya existe una sincronización en curso para este almacén', 'warning');
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al adquirir bloqueo';
        showToast(`Error de bloqueo: ${msg}`, 'error');
        return;
      }

      // ── PASO 3 — Lock adquirido, cambiar a starting ────────────────
      const nowIso = new Date().toISOString();
      setSyncStates((prev) => ({
        ...prev,
        [warehouse.id]: {
          status: 'starting',
          syncRunId: tempSyncRunId,
          startedAt: nowIso,
          error: null,
          elapsedSeconds: 0,
        },
      }));

      // ── PASO 4 — Disparar webhook ──────────────────────────────────
      const payload = {
        session_id: warehouse.sessionId,
        session_name: warehouse.name,
        location: warehouse.name,
        situation: selectedSituation,
        triggered_from: 'TFI_FRONTEND',
        timestamp: nowIso,
        warehouse: warehouse.name,
        warehouse_id: warehouse.id,
      };

      try {
        console.log(`[WarehouseSync] ${warehouse.name} → ${warehouse.url}`, payload);
        const realSyncRunId = await triggerTfiRefresh(payload, warehouse.url);
        console.log(`[WarehouseSync] ${warehouse.name} respuesta — sync_run_id:`, realSyncRunId);

        // ── PASO 5 — Webhook OK, iniciar polling por session_id ─────
        setSyncStates((prev) => ({
          ...prev,
          [warehouse.id]: {
            ...prev[warehouse.id],
            status: 'syncing',
            syncRunId: realSyncRunId || tempSyncRunId,
          },
        }));

        // Polling basado en sessionId, no en syncRunId
        startPolling(warehouse.id, warehouse.sessionId, 0, nowIso);
      } catch (err) {
        // ── PASO 4b — Webhook falló ──────────────────────────────────
        let msg = 'Error desconocido';
        if (err instanceof WebhookError) {
          msg = err.message;
        } else if (err instanceof Error) {
          msg = err.message;
        }

        console.error(`[WarehouseSync] ${warehouse.name} error:`, msg);

        await releaseSyncLock(warehouse.sessionId, msg).catch(() => {});

        if (!mountedRef.current) return;

        setSyncStates((prev) => ({
          ...prev,
          [warehouse.id]: {
            ...prev[warehouse.id],
            status: 'error',
            error: msg,
          },
        }));

        showToast(`Error en ${warehouse.name}: ${msg}`, 'error');

        setTimeout(() => {
          if (!mountedRef.current) return;
          setSyncStates((prev) => ({
            ...prev,
            [warehouse.id]: {
              ...buildInitialState()[warehouse.id],
            },
          }));
        }, ERROR_DISPLAY_MS);
      }
    },
    [syncStates, hasActiveSync, selectedSituation, showToast, startPolling]
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="relative">
      {/* Toast flotante */}
      {toast && (
        <div
          className={`absolute right-0 -top-12 z-50 flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg border whitespace-nowrap ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : toast.type === 'error'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          <i
            className={
              toast.type === 'success'
                ? 'ri-checkbox-circle-line text-sm'
                : toast.type === 'error'
                ? 'ri-error-warning-line text-sm'
                : 'ri-alert-line text-sm'
            }
          ></i>
          {toast.message}
        </div>
      )}

      {/* Banner de bloqueo global */}
      {hasActiveSync && (
        <div className="mb-4 flex items-center gap-2 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <i className="ri-loader-4-line animate-spin text-sm"></i>
          Hay una sincronización en curso. El resto de almacenes estarán disponibles al finalizar.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {WAREHOUSES.map((wh) => {
          const state = syncStates[wh.id];
          const isBusy =
            state?.status === 'starting' ||
            state?.status === 'syncing';
          const isThisActive = isBusy;
          // Bloqueo global: deshabilitar si OTRO almacén está activo
          const lockedByOther = hasActiveSync && !isThisActive && state?.status !== 'stale';

          return (
            <div
              key={wh.id}
              className={`flex flex-col gap-3 p-4 rounded-xl border transition-colors ${wh.bgClass} ${wh.borderClass}`}
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 flex items-center justify-center rounded-lg bg-white border ${wh.borderClass}`}
                >
                  <i className={`${wh.icon} ${wh.textClass} text-lg`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-800">{wh.name}</h3>
                  <p className="text-xs text-gray-500 truncate">
                    {isBusy && (state?.elapsedSeconds ?? 0) > 0
                      ? `Sincronizando... ${formatElapsed(state!.elapsedSeconds)}`
                      : state?.status === 'success'
                      ? 'Actualizado'
                      : state?.status === 'error'
                      ? 'Falló'
                      : lockedByOther
                      ? 'En espera...'
                      : 'Sincronización desde WMS'}
                  </p>
                </div>
              </div>

              {/* Badge de estado */}
              {state?.status === 'success' && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100/70 rounded-md px-2.5 py-1">
                  <i className="ri-checkbox-circle-line text-sm"></i>
                  Actualizado
                </div>
              )}

              {state?.status === 'error' && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-100/70 rounded-md px-2.5 py-1">
                    <i className="ri-error-warning-line text-sm"></i>
                    Error
                  </div>
                  {state.error && (
                    <p className="text-xs text-red-600 leading-tight line-clamp-2">{state.error}</p>
                  )}
                </div>
              )}

              {state?.status === 'stale' && (
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100/70 rounded-md px-2.5 py-1">
                  <i className="ri-time-line text-sm"></i>
                  Sincronización atascada ({formatElapsed(state.elapsedSeconds)})
                </div>
              )}

              {/* Botón */}
              <button
                onClick={() => handleSync(wh)}
                disabled={isBusy || lockedByOther}
                title={
                  lockedByOther
                    ? 'Otro almacén está sincronizando — esperá a que termine'
                    : isBusy
                    ? 'Sincronización en curso'
                    : ''
                }
                className={`flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
                  isBusy || lockedByOther
                    ? 'border-gray-200 text-gray-400 bg-white/60 cursor-not-allowed'
                    : `border-white/80 ${wh.textClass} bg-white ${wh.hoverBgClass} shadow-sm`
                }`}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {isBusy ? (
                    <i className="ri-loader-4-line animate-spin text-sm"></i>
                  ) : lockedByOther ? (
                    <i className="ri-lock-line text-sm"></i>
                  ) : state?.status === 'success' ? (
                    <i className="ri-checkbox-circle-line text-sm text-emerald-600"></i>
                  ) : state?.status === 'error' ? (
                    <i className="ri-error-warning-line text-sm text-red-600"></i>
                  ) : state?.status === 'stale' ? (
                    <i className="ri-restart-line text-sm"></i>
                  ) : (
                    <i className="ri-refresh-line text-sm"></i>
                  )}
                </div>
                {state?.status === 'stale'
                  ? 'Reintentar'
                  : isBusy
                  ? state?.status === 'starting'
                    ? 'Iniciando...'
                    : 'Sincronizando...'
                  : lockedByOther
                  ? 'Bloqueado'
                  : state?.status === 'success'
                  ? 'Actualizado'
                  : state?.status === 'error'
                  ? 'Reintentar'
                  : 'Sincronizar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}