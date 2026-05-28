import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { triggerTfiRefresh, WebhookError } from '@/services/n8n.service';
import {
  acquireSyncLock,
  releaseSyncLock,
  getSyncLocks,
  getRunningSyncForSession,
  getLatestSyncRun,
  getSyncLock,
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
const ORPHAN_THRESHOLD_SECONDS = 300; // 5 minutos: si n8n no creó registros en este tiempo, es huérfano
const ZOMBIE_SYNC_RUN_MINUTES = 5; // Si un sync run lleva > 5 min en 'running' sin finished_at, está muerto
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

function isLockInconsistent(lock: import('@/types/tfi.types').TfiSyncLock): boolean {
  // Lock con is_running=true pero finished_at seteado → inconsistente
  if (lock.is_running && lock.finished_at != null) return true;
  // Lock con is_running=true pero sync_run_id nulo → inconsistente
  if (lock.is_running && lock.sync_run_id == null) return true;
  return false;
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
            // Verificar si el sync run es zombie (n8n lo creó pero nunca lo actualizó)
            const runningMinutes = runningSync.started_at
              ? (Date.now() - new Date(runningSync.started_at).getTime()) / 1000 / 60
              : 0;

            if (runningMinutes >= ZOMBIE_SYNC_RUN_MINUTES) {
              // Sync run zombie detectado — n8n murió sin actualizar estado
              console.log(
                `[Poll] ${warehouseName} — sync run zombie (${Math.round(runningMinutes)}min en 'running'), liberando`
              );
              clearTimers(warehouseId);
              await releaseSyncLock(
                sessionId,
                `Sync run zombie — ${Math.round(runningMinutes)}min en 'running' sin finalizar`
              ).catch(() => {});
              if (!mountedRef.current) return;

              setSyncStates((prev) => ({
                ...prev,
                [warehouseId]: {
                  ...prev[warehouseId],
                  status: 'error',
                  error: `n8n no respondió después de ${Math.round(runningMinutes)}min — lock liberado`,
                },
              }));

              showToast(
                `Sincronización de ${warehouseName} no respondió (${Math.round(runningMinutes)}min) — lock liberado`,
                'warning'
              );

              setTimeout(() => {
                if (!mountedRef.current) return;
                setSyncStates((prev) => ({
                  ...prev,
                  [warehouseId]: { ...buildInitialState()[warehouseId] },
                }));
              }, ERROR_DISPLAY_MS);

              return;
            }

            // Aún está corriendo y no es zombie — seguimos esperando
            console.log(`[Poll] ${warehouseName} sigue running... (${Math.round(runningMinutes)}min)`);
            return;
          }

          // No hay sync running — verificar el último sync para saber si completó o falló
          const latestSync: TfiSyncRun | null = await getLatestSyncRun(sessionId);

          if (!latestSync) {
            // n8n aún no ha creado ningún registro — verificar si es lock huérfano
            const totalElapsed = calcElapsedFrom(startedAt);
            if (totalElapsed > ORPHAN_THRESHOLD_SECONDS) {
              // 5+ minutos sin que n8n cree registros → lock huérfano
              console.log(`[Poll] ${warehouseName} — lock huérfano (${totalElapsed}s sin registros), liberando`);
              clearTimers(warehouseId);
              await releaseSyncLock(
                sessionId,
                'Lock huérfano — n8n nunca creó registros de sync (5+ min)'
              ).catch(() => {});
              if (!mountedRef.current) return;

              setSyncStates((prev) => ({
                ...prev,
                [warehouseId]: {
                  ...buildInitialState()[warehouseId],
                },
              }));

              showToast(
                `Sincronización de ${warehouseName} no respondió — lock liberado`,
                'warning'
              );

              return;
            }
            // Todavía dentro del margen de espera, seguimos
            console.log(`[Poll] ${warehouseName} — aún sin registros en tfi_sync_runs (${totalElapsed}s)`);
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

        // ── PRIMERO: liberar sync runs zombies sin lock (más importante) ──
        for (const wh of WAREHOUSES) {
          const runningSync = await getRunningSyncForSession(wh.sessionId).catch(() => null);
          if (!runningSync) continue;

          const runningMinutes = runningSync.started_at
            ? (Date.now() - new Date(runningSync.started_at).getTime()) / 1000 / 60
            : 0;

          if (runningMinutes >= ZOMBIE_SYNC_RUN_MINUTES) {
            // Verificar si hay lock asociado
            const lock = locks.find((l) => l.session_id === wh.sessionId);
            if (!lock || !lock.is_running) {
              // Sync run zombie SIN lock — el peor caso. Liberar automáticamente.
              console.log(
                `[Recovery] ${wh.name} — sync run zombie SIN LOCK (${Math.round(runningMinutes)}min en 'running'), liberando automáticamente`
              );
              await releaseSyncLock(
                wh.sessionId,
                `Sync run zombie sin lock — ${Math.round(runningMinutes)}min en 'running' sin finalizar`
              ).catch(() => {});
              // Resetear estado UI
              setSyncStates((prev) => ({
                ...prev,
                [wh.id]: {
                  ...buildInitialState()[wh.id],
                },
              }));
              continue;
            }
          }
        }

        // Re-obtener locks después de posibles liberaciones
        const locksAfter = await getSyncLocks().catch(() => locks);

        for (const lock of locksAfter) {
          if (!lock.is_running) continue;

          const warehouse = WAREHOUSES.find((w) => w.sessionId === lock.session_id);
          if (!warehouse) continue;

          // ── Lock inconsistente: is_running=true pero finished_at seteado o sin sync_run_id ──
          if (isLockInconsistent(lock)) {
            console.log(
              `[Recovery] ${warehouse.name} — lock INCONSISTENTE (is_running=true pero finished_at=${lock.finished_at}, sync_run_id=${lock.sync_run_id}), liberando automáticamente`
            );
            await releaseSyncLock(
              lock.session_id,
              'Lock inconsistente — is_running=true pero finished_at seteado o sync_run_id inválido'
            ).catch((err) => console.error(`[Recovery] Error liberando lock inconsistente de ${warehouse.name}:`, err));
            // Resetear estado UI
            setSyncStates((prev) => ({
              ...prev,
              [warehouse.id]: {
                ...buildInitialState()[warehouse.id],
              },
            }));
            continue;
          }

          const stale = isStale(lock.started_at);

          // ── Stale: liberar automáticamente, no molestar al usuario ──
          if (stale) {
            console.log(
              `[Recovery] ${warehouse.name} — lock stale (${calcElapsedFrom(lock.started_at)}s), liberando automáticamente`
            );
            await releaseSyncLock(
              lock.session_id,
              'Lock huérfano — liberado automáticamente en recovery (60+ min)'
            ).catch((err) => console.error(`[Recovery] Error liberando lock stale de ${warehouse.name}:`, err));
            // No mostrar nada en UI, queda idle
            continue;
          }

          // ── Lock activo reciente: verificar si es huérfano o zombie antes de hacer polling ──
          const baseElapsed = calcElapsedFrom(lock.started_at);

          // Verificar si el sync run asociado es zombie (n8n murió)
          const runningSync = await getRunningSyncForSession(lock.session_id).catch(() => null);
          if (runningSync) {
            const runningMinutes = runningSync.started_at
              ? (Date.now() - new Date(runningSync.started_at).getTime()) / 1000 / 60
              : 0;
            if (runningMinutes >= ZOMBIE_SYNC_RUN_MINUTES) {
              console.log(
                `[Recovery] ${warehouse.name} — sync run zombie (${Math.round(runningMinutes)}min en 'running'), liberando`
              );
              await releaseSyncLock(
                lock.session_id,
                `Sync run zombie — ${Math.round(runningMinutes)}min en 'running' sin finalizar`
              ).catch((err) =>
                console.error(`[Recovery] Error liberando lock zombie de ${warehouse.name}:`, err)
              );
              continue;
            }
          }

          // Si el lock tiene más de 5 min, verificar que exista al menos un sync run
          if (baseElapsed > ORPHAN_THRESHOLD_SECONDS) {
            const latestSync = await getLatestSyncRun(lock.session_id).catch(() => null);
            if (!latestSync) {
              console.log(
                `[Recovery] ${warehouse.name} — lock huérfano (${baseElapsed}s sin registros), liberando`
              );
              await releaseSyncLock(
                lock.session_id,
                'Lock huérfano — n8n nunca creó registros de sync'
              ).catch((err) =>
                console.error(`[Recovery] Error liberando lock huérfano de ${warehouse.name}:`, err)
              );
              continue;
            }
            // Si el último sync run está completed o failed, el lock también es huérfano
            if (latestSync.status === 'completed' || latestSync.status === 'failed') {
              console.log(
                `[Recovery] ${warehouse.name} — lock huérfano (sync run ya finalizó como '${latestSync.status}'), liberando`
              );
              await releaseSyncLock(
                lock.session_id,
                `Lock huérfano — sync run ya finalizó como '${latestSync.status}'`
              ).catch((err) =>
                console.error(`[Recovery] Error liberando lock huérfano de ${warehouse.name}:`, err)
              );
              continue;
            }
          }

          console.log(
            `[Recovery] ${warehouse.name} — is_running=true, baseElapsed=${baseElapsed}s`
          );

          setSyncStates((prev) => ({
            ...prev,
            [warehouse.id]: {
              status: 'syncing',
              syncRunId: lock.sync_run_id,
              startedAt: lock.started_at,
              error: null,
              elapsedSeconds: baseElapsed,
            },
          }));

          startPolling(warehouse.id, lock.session_id, baseElapsed, lock.started_at);
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

      // ── PASO 2 — Adquirir lock (con auto-recovery si está stale) ─
      let acquired = false;
      try {
        acquired = await acquireSyncLock(warehouse.sessionId, tempSyncRunId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al adquirir bloqueo';
        showToast(`Error de bloqueo: ${msg}`, 'error');
        return;
      }

      // Si no se pudo adquirir, verificar si el lock existente es huérfano o zombie
      if (!acquired) {
        try {
          let shouldRelease = false;
          let releaseReason = '';

          const existingLock = await getSyncLock(warehouse.sessionId);

          if (existingLock && existingLock.is_running) {
            // Razón 0: Lock inconsistente (is_running=true pero finished_at seteado o sync_run_id nulo)
            if (isLockInconsistent(existingLock)) {
              shouldRelease = true;
              releaseReason = 'Lock inconsistente — is_running=true pero finished_at seteado o sync_run_id inválido';
            } else if (isStale(existingLock.started_at)) {
              // Razón 1: Lock stale por tiempo (>60 min)
              shouldRelease = true;
              releaseReason = 'Lock stale (>60 min)';
            } else {
              // Razón 2: No hay sync run activo (n8n nunca lo creó o ya terminó)
              const runningSync = await getRunningSyncForSession(warehouse.sessionId).catch(() => null);
              if (!runningSync) {
                // Verificar el último sync run — si está completed o failed, el lock es huérfano
                const latestSync = await getLatestSyncRun(warehouse.sessionId).catch(() => null);
                if (!latestSync || latestSync.status === 'completed' || latestSync.status === 'failed') {
                  shouldRelease = true;
                  releaseReason = latestSync
                    ? `Lock huérfano — sync run ya finalizó como '${latestSync.status}'`
                    : 'Lock huérfano — no existe sync run asociado';
                }
              } else {
                // Razón 3: Sync run zombie (>5 min en 'running')
                const runningMinutes = runningSync.started_at
                  ? (Date.now() - new Date(runningSync.started_at).getTime()) / 1000 / 60
                  : 0;
                if (runningMinutes >= ZOMBIE_SYNC_RUN_MINUTES) {
                  shouldRelease = true;
                  releaseReason = `Sync run zombie (${Math.round(runningMinutes)}min en 'running')`;
                }
              }
            }
          } else {
            // No hay lock, pero puede haber un sync run zombie sin lock
            const runningSync = await getRunningSyncForSession(warehouse.sessionId).catch(() => null);
            if (runningSync) {
              const runningMinutes = runningSync.started_at
                ? (Date.now() - new Date(runningSync.started_at).getTime()) / 1000 / 60
                : 0;
              if (runningMinutes >= ZOMBIE_SYNC_RUN_MINUTES) {
                shouldRelease = true;
                releaseReason = `Sync run zombie sin lock (${Math.round(runningMinutes)}min en 'running')`;
              } else {
                // Hay un sync run running reciente sin lock (<5 min) — mostrar como syncing
                // para que el botón Stop aparezca
                setSyncStates((prev) => ({
                  ...prev,
                  [warehouse.id]: {
                    status: 'syncing',
                    syncRunId: runningSync.id,
                    startedAt: runningSync.started_at,
                    error: null,
                    elapsedSeconds: Math.floor(runningMinutes * 60),
                  },
                }));
                startPolling(warehouse.id, warehouse.sessionId, Math.floor(runningMinutes * 60), runningSync.started_at);
                showToast(
                  `Sincronización en curso (${Math.round(runningMinutes)}min). Usá el botón Stop para cancelarla.`,
                  'warning'
                );
                return;
              }
            }
          }

          if (shouldRelease) {
            console.log(`[Sync] ${warehouse.name} — ${releaseReason}, liberando automáticamente`);
            await releaseSyncLock(warehouse.sessionId, releaseReason).catch(() => {});
            acquired = await acquireSyncLock(warehouse.sessionId, tempSyncRunId);
          }
        } catch (innerErr) {
          console.error(`[Sync] ${warehouse.name} — error en auto-recovery:`, innerErr);
        }

        if (!acquired) {
          // Si después de todo el recovery sigue sin poder, ahora sí mostramos el mensaje
          // Pero intentamos dar info más útil
          try {
            const runningSync = await getRunningSyncForSession(warehouse.sessionId).catch(() => null);
            if (runningSync) {
              const runningMinutes = runningSync.started_at
                ? Math.round((Date.now() - new Date(runningSync.started_at).getTime()) / 1000 / 60)
                : 0;
              showToast(
                `Sincronización en curso (${runningMinutes}min). Usá el botón Stop para cancelarla.`,
                'warning'
              );
              // Mostrar como syncing para que el botón Stop aparezca
              setSyncStates((prev) => ({
                ...prev,
                [warehouse.id]: {
                  status: 'syncing',
                  syncRunId: runningSync.id,
                  startedAt: runningSync.started_at,
                  error: null,
                  elapsedSeconds: runningMinutes * 60,
                },
              }));
              startPolling(warehouse.id, warehouse.sessionId, runningMinutes * 60, runningSync.started_at);
            } else {
              showToast('Ya existe una sincronización en curso para este almacén', 'warning');
            }
          } catch {
            showToast('Ya existe una sincronización en curso para este almacén', 'warning');
          }
          return;
        }
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

  // ── Handler: click en Stop ───────────────────────────────────────────

  const handleStop = useCallback(
    async (warehouse: Warehouse) => {
      const currentState = syncStates[warehouse.id];
      if (!currentState || (currentState.status !== 'syncing' && currentState.status !== 'stale')) {
        return;
      }

      console.log(`[Stop] ${warehouse.name} — forzando detención`);

      // Limpiar todos los timers de este warehouse
      clearTimers(warehouse.id);

      // Liberar el lock en la BD
      await releaseSyncLock(
        warehouse.sessionId,
        'Detención forzada por el usuario desde el botón Stop'
      ).catch((err) => console.error(`[Stop] Error liberando lock de ${warehouse.name}:`, err));

      if (!mountedRef.current) return;

      // Resetear estado local
      setSyncStates((prev) => ({
        ...prev,
        [warehouse.id]: {
          ...buildInitialState()[warehouse.id],
        },
      }));

      showToast(`Sincronización de ${warehouse.name} detenida`, 'warning');
    },
    [syncStates, clearTimers, showToast]
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

              {/* Botones */}
              <div className="flex items-center gap-2">
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
                  className={`flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
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

                {/* Botón Stop — solo visible cuando está syncing o stale */}
                {(state?.status === 'syncing' || state?.status === 'stale' || state?.status === 'starting') && (
                  <button
                    onClick={() => handleStop(wh)}
                    title="Forzar detención de la sincronización"
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-stop-fill text-base"></i>
                    </div>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}