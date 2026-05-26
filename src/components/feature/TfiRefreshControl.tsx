import { useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from '@/context/SessionContext';
import { triggerTfiRefresh, WebhookError } from '@/services/n8n.service';
import { getSyncRunById, getRunningSyncForSession, getLatestSyncRun, getAvailableSituations } from '@/services/tfi.service';
import type { TfiSyncRun } from '@/types/tfi.types';

type SyncState = 'idle' | 'starting' | 'syncing' | 'success' | 'error';

const POLL_INTERVAL_MS = 3000;
const SYNC_TIMEOUT_MINUTES = 60;
const MAX_SYNC_DURATION_MS = SYNC_TIMEOUT_MINUTES * 60 * 1000;
const SLOW_SYNC_WARNING_MS = 10 * 60 * 1000;
const FALLBACK_MAX_MS = 15 * 1000;
const STALE_RUNNING_MINUTES = 60;

const LS_KEY_SYNC_RUN_ID = 'tfi_active_sync_run_id';
const LS_KEY_SYNC_SESSION_ID = 'tfi_active_sync_session_id';
const LS_KEY_SYNC_STARTED_AT = 'tfi_active_sync_started_at';

function clearLocalStorageSync() {
  localStorage.removeItem(LS_KEY_SYNC_RUN_ID);
  localStorage.removeItem(LS_KEY_SYNC_SESSION_ID);
  localStorage.removeItem(LS_KEY_SYNC_STARTED_AT);
  console.log('[TFI] limpiando sync local');
}

function saveLocalStorageSync(syncRunId: string, sessionId: string, startedAt: string) {
  localStorage.setItem(LS_KEY_SYNC_RUN_ID, syncRunId);
  localStorage.setItem(LS_KEY_SYNC_SESSION_ID, sessionId);
  localStorage.setItem(LS_KEY_SYNC_STARTED_AT, startedAt);
  console.log('[TFI] sync_run_id guardado en localStorage:', syncRunId);
}

function loadLocalStorageSync(): { syncRunId: string | null; sessionId: string | null; startedAt: string | null } {
  return {
    syncRunId: localStorage.getItem(LS_KEY_SYNC_RUN_ID),
    sessionId: localStorage.getItem(LS_KEY_SYNC_SESSION_ID),
    startedAt: localStorage.getItem(LS_KEY_SYNC_STARTED_AT),
  };
}

function isRunningStale(syncRun: TfiSyncRun): boolean {
  const started = new Date(syncRun.started_at).getTime();
  const elapsedMinutes = (Date.now() - started) / (1000 * 60);
  return elapsedMinutes > STALE_RUNNING_MINUTES;
}

function formatWebhookError(err: unknown): { userMessage: string; logDetails: string } {
  if (err instanceof WebhookError) {
    if (err.status !== undefined) {
      const status = err.status;
      const bodyPreview = err.responseBody?.slice(0, 200) ?? 'sin body';
      const logDetails = `HTTP ${status} — body: ${bodyPreview}`;

      if (status === 404) {
        return {
          userMessage: `Webhook respondió 404: el endpoint no existe en N8N. Revisá la URL del webhook.`,
          logDetails,
        };
      }
      if (status === 401 || status === 403) {
        return {
          userMessage: `Webhook respondió ${status}: sin autorización. Revisá las credenciales o tokens del webhook.`,
          logDetails,
        };
      }
      if (status >= 500) {
        return {
          userMessage: `Webhook respondió ${status}: error interno en N8N. Revisá el workflow en el editor de N8N.`,
          logDetails,
        };
      }
      return {
        userMessage: `Webhook respondió ${status}: ${err.message}`,
        logDetails,
      };
    }

    return {
      userMessage: err.message,
      logDetails: err.message,
    };
  }

  if (err instanceof Error) {
    return {
      userMessage: `Error inesperado: ${err.message}`,
      logDetails: err.message,
    };
  }

  return {
    userMessage: 'Error desconocido al iniciar la sincronización.',
    logDetails: String(err),
  };
}

function formatSupabaseError(err: unknown): { userMessage: string; logDetails: string } {
  if (err instanceof Error) {
    return {
      userMessage: 'Error al consultar el estado de sincronización en Supabase.',
      logDetails: err.message,
    };
  }
  return {
    userMessage: 'Error desconocido al consultar Supabase.',
    logDetails: String(err),
  };
}

export default function TfiRefreshControl() {
  const { selectedSession, sessions, selectedSituation, setSelectedSituation, triggerRefresh } = useSession();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [availableSituations, setAvailableSituations] = useState<string[]>(['TODOS']);
  const [externalRunningNotice, setExternalRunningNotice] = useState<string | null>(null);

  const isStartingRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentSyncRunIdRef = useRef<string | null>(null);
  const fallbackUntilRef = useRef<number>(0);
  const fallbackSessionIdRef = useRef<string | null>(null);
  const fallbackSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [slowSyncWarning, setSlowSyncWarning] = useState(false);
  const slowSyncWarnedRef = useRef(false);

  const activeSession = sessions.find((s) => s.id === selectedSession) ?? null;

  // Cargar situaciones disponibles dinámicamente según la sesión activa
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
      .catch((err) => {
        console.error('[TFI] Error cargando situaciones disponibles:', err);
        setAvailableSituations(['TODOS']);
      });
  }, [selectedSession]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const clearTimers = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (fallbackSafetyTimerRef.current) {
      clearTimeout(fallbackSafetyTimerRef.current);
      fallbackSafetyTimerRef.current = null;
    }
  }, []);

  const stopPolling = useCallback(() => {
    clearTimers();
    currentSyncRunIdRef.current = null;
    fallbackUntilRef.current = 0;
    fallbackSessionIdRef.current = null;
    slowSyncWarnedRef.current = false;
    setSlowSyncWarning(false);
    setExternalRunningNotice(null);
  }, [clearTimers]);

  const evaluateSyncRun = useCallback((syncRun: TfiSyncRun | null): 'keep-polling' | 'completed' | 'failed' => {
    if (!syncRun) return 'failed';
    if (syncRun.status === 'running') return 'keep-polling';
    if (syncRun.status === 'completed') return 'completed';
    if (syncRun.status === 'failed') return 'failed';
    return 'failed';
  }, []);

  const processPollingResult = useCallback(
    (result: 'keep-polling' | 'completed' | 'failed', syncRun: TfiSyncRun | null) => {
      if (result === 'keep-polling') {
        setSyncState('syncing');
        return;
      }

      stopPolling();

      if (result === 'completed') {
        clearLocalStorageSync();
        setSyncState('success');
        showToast('Sincronización completada. Recargando datos...', 'success');
        triggerRefresh();
        setTimeout(() => setSyncState('idle'), 3000);
        return;
      }

      clearLocalStorageSync();
      setSyncState('error');
      const errorMsg = syncRun?.error_message?.trim();
      if (errorMsg) {
        showToast(`Sincronización fallida en N8N: ${errorMsg.slice(0, 120)}`, 'error');
      } else {
        showToast('La sincronización en N8N falló sin mensaje de error.', 'error');
      }
      setTimeout(() => setSyncState('idle'), 4000);
    },
    [stopPolling, showToast, triggerRefresh]
  );

  const checkSyncStatusById = useCallback(async () => {
    const syncRunId = currentSyncRunIdRef.current;
    if (!syncRunId) {
      console.warn('[TFI] checkSyncStatusById llamado sin syncRunId en ref');
      return;
    }

    try {
      console.log('[TFI] Sync status by ID:', syncRunId);
      const syncRun = await getSyncRunById(syncRunId);
      console.log('[TFI] Sync status result:', syncRun?.status ?? 'null');

      if (syncRun && syncRun.status === 'running') {
        const elapsed = Date.now() - new Date(syncRun.started_at).getTime();
        if (elapsed > SLOW_SYNC_WARNING_MS && !slowSyncWarnedRef.current) {
          slowSyncWarnedRef.current = true;
          setSlowSyncWarning(true);
        }
      }

      const result = evaluateSyncRun(syncRun);
      processPollingResult(result, syncRun);
    } catch (err) {
      clearTimers();
      const { userMessage, logDetails } = formatSupabaseError(err);
      console.error('[TFI] Error en polling por ID:', logDetails);
      clearLocalStorageSync();
      setSyncState('error');
      showToast(userMessage, 'error');
      setTimeout(() => setSyncState('idle'), 4000);
    }
  }, [evaluateSyncRun, processPollingResult, clearTimers, showToast]);

  const checkSyncStatusBySession = useCallback(
    async (sessionId: string) => {
      try {
        console.log('[TFI] Fallback: consultando running por sesión:', sessionId);
        const running = await getRunningSyncForSession(sessionId);

        if (running) {
          console.log('[TFI] Fallback encontró running con id:', running.id);

          if (isRunningStale(running)) {
            console.warn(
              `[TFI] Fallback running es stale (${STALE_RUNNING_MINUTES}min+), deteniendo polling:`
            );
            stopPolling();
            setSyncState('idle');
            showToast(
              'Había una sincronización anterior incompleta. Podés iniciar una nueva.',
              'error'
            );
            return;
          }

          currentSyncRunIdRef.current = running.id;
          fallbackUntilRef.current = 0;
          fallbackSessionIdRef.current = null;
          if (fallbackSafetyTimerRef.current) {
            clearTimeout(fallbackSafetyTimerRef.current);
            fallbackSafetyTimerRef.current = null;
          }
          const result = evaluateSyncRun(running);
          processPollingResult(result, running);
          return;
        }

        if (fallbackUntilRef.current > 0 && Date.now() < fallbackUntilRef.current) {
          console.log('[TFI] Fallback: aún esperando running...');
          return;
        }

        const latest = await getLatestSyncRun(sessionId);
        const result = evaluateSyncRun(latest);
        processPollingResult(result, latest);
      } catch (err) {
        stopPolling();
        const { userMessage, logDetails } = formatSupabaseError(err);
        console.error('[TFI] Error en polling de sync status por sesión:', logDetails);
        setSyncState('error');
        showToast(userMessage, 'error');
        setTimeout(() => setSyncState('idle'), 4000);
      }
    },
    [evaluateSyncRun, processPollingResult, stopPolling, showToast]
  );

  const startPollingById = useCallback(
    (syncRunId: string) => {
      clearTimers();
      slowSyncWarnedRef.current = false;
      setSlowSyncWarning(false);
      currentSyncRunIdRef.current = syncRunId;
      setSyncState('syncing');
      console.log('[TFI] startPollingById:', syncRunId);
      checkSyncStatusById();
      pollIntervalRef.current = setInterval(() => {
        checkSyncStatusById();
      }, POLL_INTERVAL_MS);
    },
    [clearTimers, checkSyncStatusById]
  );

  const startPollingBySession = useCallback(
    (sessionId: string) => {
      clearTimers();
      console.log('[TFI] startPollingBySession (fallback):', sessionId);
      checkSyncStatusBySession(sessionId);
      pollIntervalRef.current = setInterval(() => {
        checkSyncStatusBySession(sessionId);
      }, POLL_INTERVAL_MS);
    },
    [clearTimers, checkSyncStatusBySession]
  );

  // Al montar o cambiar de sesión: reanudar polling SOLO si hay un sync_run_id
  // guardado en localStorage por este mismo frontend. NUNCA engancharse a un
  // running externo solo porque comparte session_id.
  useEffect(() => {
    if (!activeSession?.id) return;

    const resumeLocalSync = async () => {
      if (isStartingRef.current) return;

      const local = loadLocalStorageSync();
      if (!local.syncRunId) {
        console.log('[TFI] no hay sync local activo, no se monitorea running externo');
        return;
      }

      // Validar que el sync guardado pertenezca a la sesión actual
      if (local.sessionId && local.sessionId !== activeSession.id) {
        console.log('[TFI] sync local pertenece a otra sesión, ignorando:', local.syncRunId);
        clearLocalStorageSync();
        return;
      }

      try {
        console.log('[TFI] reanudando polling desde localStorage:', local.syncRunId);
        const syncRun = await getSyncRunById(local.syncRunId);

        if (!syncRun) {
          console.warn('[TFI] sync_run_id en localStorage no existe en DB, limpiando:', local.syncRunId);
          clearLocalStorageSync();
          return;
        }

        if (syncRun.status === 'running') {
          if (isRunningStale(syncRun)) {
            console.warn('[TFI] sync local stale detectado, limpiando:', local.syncRunId);
            clearLocalStorageSync();
            showToast('Había una sincronización anterior incompleta. Podés iniciar una nueva.', 'error');
            return;
          }
          setSyncState('syncing');
          startPollingById(local.syncRunId);
        } else if (syncRun.status === 'completed' || syncRun.status === 'failed') {
          console.log('[TFI] sync local ya finalizó, limpiando:', local.syncRunId);
          clearLocalStorageSync();
          // No iniciar polling, dejar botón libre
        } else {
          console.warn('[TFI] sync local con estado desconocido, limpiando:', syncRun.status);
          clearLocalStorageSync();
        }
      } catch (err) {
        const { logDetails } = formatSupabaseError(err);
        console.error('[TFI] Error al reanudar sync desde localStorage:', logDetails);
        clearLocalStorageSync();
      }
    };

    resumeLocalSync();

    return () => {
      stopPolling();
    };
  }, [activeSession?.id, startPollingById, stopPolling]);

  const handleSituationChange = (value: string) => {
    setSelectedSituation(value);
  };

  const handleRefresh = async () => {
    if (!activeSession) {
      showToast('No hay sesión seleccionada', 'error');
      return;
    }

    if (isStartingRef.current) {
      showToast('Ya se está procesando una solicitud. Por favor espera.', 'error');
      return;
    }

    if (syncState === 'syncing' || syncState === 'starting') {
      showToast('Ya hay una sincronización en curso. Por favor espera.', 'error');
      return;
    }

    isStartingRef.current = true;
    setSyncState('starting');
    setExternalRunningNotice(null);
    stopPolling();

    try {
      // Verificar si hay un running externo SOLO para informar, nunca secuestrar
      try {
        const externalRunning = await getRunningSyncForSession(activeSession.id);
        if (externalRunning) {
          // Solo si NO es el que tenemos guardado en localStorage
          const local = loadLocalStorageSync();
          if (local.syncRunId !== externalRunning.id) {
            const msg = 'Hay una sincronización externa en curso, pero podés iniciar una nueva si es necesario.';
            console.log('[TFI]', msg, 'ID externo:', externalRunning.id);
            setExternalRunningNotice(msg);
          }
        }
      } catch (e) {
        // Ignorar error en la consulta informativa
      }

      const payload = {
        session_id: activeSession.id,
        session_name: activeSession.name,
        location: activeSession.location,
        situation: selectedSituation,
        triggered_from: 'TFI_FRONTEND',
        timestamp: new Date().toISOString(),
      };

      console.log('[TFI Refresh] Payload enviado a N8N:', payload);

      const returnedSyncRunId = await triggerTfiRefresh(payload);

      if (returnedSyncRunId) {
        const startedAt = new Date().toISOString();
        saveLocalStorageSync(returnedSyncRunId, activeSession.id, startedAt);
        showToast('Sincronización iniciada. Monitoreando progreso...', 'success');
        startPollingById(returnedSyncRunId);
      } else {
        console.warn('[TFI] Webhook no devolvió sync_run_id válido. Iniciando fallback por sesión (15s max).');
        fallbackUntilRef.current = Date.now() + FALLBACK_MAX_MS;
        fallbackSessionIdRef.current = activeSession.id;
        showToast('Sincronización iniciada (modo compatibilidad). Monitoreando...', 'success');
        startPollingBySession(activeSession.id);

        fallbackSafetyTimerRef.current = setTimeout(() => {
          if (!currentSyncRunIdRef.current) {
            clearTimers();
            setSyncState('error');
            showToast(
              'N8N respondió, pero no devolvió un sync_run_id válido ni se encontró una sincronización activa.',
              'error'
            );
            setTimeout(() => setSyncState('idle'), 4000);
            fallbackUntilRef.current = 0;
            fallbackSessionIdRef.current = null;
          }
        }, FALLBACK_MAX_MS);
      }
    } catch (err) {
      const { userMessage, logDetails } = formatWebhookError(err);
      console.error('[TFI] Error en handleRefresh:', logDetails);
      setSyncState('error');
      showToast(userMessage, 'error');
      setTimeout(() => setSyncState('idle'), 4000);
    } finally {
      isStartingRef.current = false;
    }
  };

  const disabled = isStartingRef.current || syncState === 'starting' || syncState === 'syncing' || !activeSession;

  const statusIndicator = () => {
    if (syncState === 'starting' || syncState === 'syncing') {
      if (slowSyncWarning) {
        return (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
            <i className="ri-time-line text-sm"></i>
            La sincronización está tardando más de lo normal
          </span>
        );
      }
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-sky-600">
          <i className="ri-loader-4-line animate-spin text-sm"></i>
          Sincronizando...
        </span>
      );
    }
    if (syncState === 'success') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
          <i className="ri-checkbox-circle-line text-sm"></i>
          Última actualización exitosa
        </span>
      );
    }
    if (syncState === 'error') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-red-600">
          <i className="ri-error-warning-line text-sm"></i>
          Error al sincronizar
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
          onChange={(e) => handleSituationChange(e.target.value)}
          className="border border-gray-200 rounded-lg text-sm px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
          title="Situación"
        >
          {availableSituations.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Indicador de estado */}
      <div className="hidden lg:flex flex-col min-w-[140px]">
        {statusIndicator()}
        {externalRunningNotice && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-amber-600 mt-0.5">
            <i className="ri-information-line text-sm"></i>
            {externalRunningNotice}
          </span>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`absolute right-0 top-10 z-50 flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg border whitespace-nowrap ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          <i
            className={
              toast.type === 'success'
                ? 'ri-checkbox-circle-line text-sm'
                : 'ri-error-warning-line text-sm'
            }
          ></i>
          {toast.message}
        </div>
      )}
    </div>
  );
}