import { useState, useCallback, useRef } from 'react';
import { useSession } from '@/context/SessionContext';
import { triggerTfiRefresh, WebhookError } from '@/services/n8n.service';

interface Warehouse {
  id: string;
  name: string;
  url: string;
  icon: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
  hoverBgClass: string;
}

const WAREHOUSES: Warehouse[] = [
  {
    id: 'patio-febeca',
    name: 'Patio Febeca',
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
    url: 'https://sandboxn8n.mayoreo.biz/webhook/tfi-refresh3',
    icon: 'ri-building-4-line',
    bgClass: 'bg-rose-50',
    textClass: 'text-rose-700',
    borderClass: 'border-rose-200',
    hoverBgClass: 'hover:bg-rose-100',
  },
];

type ToastType = 'success' | 'error';
interface Toast {
  message: string;
  type: ToastType;
}

export default function WarehouseSyncButtons() {
  const { selectedSession, sessions, selectedSituation, triggerRefresh } = useSession();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<string, 'idle' | 'success' | 'error'>>({});
  const [toast, setToast] = useState<Toast | null>(null);
  const isStartingRef = useRef(false);

  const activeSession = sessions.find((s) => s.id === selectedSession) ?? null;

  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleSync = useCallback(
    async (warehouse: Warehouse) => {
      if (!activeSession) {
        showToast('No hay sesión seleccionada', 'error');
        return;
      }
      if (isStartingRef.current || syncingId) {
        showToast('Ya hay una sincronización en curso. Por favor espera.', 'error');
        return;
      }

      isStartingRef.current = true;
      setSyncingId(warehouse.id);
      setStatusById((prev) => ({ ...prev, [warehouse.id]: 'idle' }));

      try {
        const payload = {
          session_id: activeSession.id,
          session_name: activeSession.name,
          location: activeSession.location,
          situation: selectedSituation,
          triggered_from: 'TFI_FRONTEND',
          timestamp: new Date().toISOString(),
          warehouse: warehouse.name,
          warehouse_id: warehouse.id,
        };

        console.log(`[WarehouseSync] ${warehouse.name} → ${warehouse.url}`, payload);

        const returnedSyncRunId = await triggerTfiRefresh(payload, warehouse.url);

        console.log(`[WarehouseSync] ${warehouse.name} respuesta — sync_run_id:`, returnedSyncRunId);

        setStatusById((prev) => ({ ...prev, [warehouse.id]: 'success' }));
        showToast(`Sincronización de ${warehouse.name} iniciada correctamente`, 'success');

        // Recargar datos del dashboard
        triggerRefresh();
      } catch (err) {
        let msg = 'Error desconocido';
        if (err instanceof WebhookError) {
          msg = err.message;
        } else if (err instanceof Error) {
          msg = err.message;
        }
        console.error(`[WarehouseSync] ${warehouse.name} error:`, msg);
        setStatusById((prev) => ({ ...prev, [warehouse.id]: 'error' }));
        showToast(`Error en ${warehouse.name}: ${msg}`, 'error');
      } finally {
        setSyncingId(null);
        isStartingRef.current = false;
        // Limpiar el estado de éxito/error después de unos segundos
        setTimeout(() => {
          setStatusById((prev) => {
            const next = { ...prev };
            delete next[warehouse.id];
            return next;
          });
        }, 5000);
      }
    },
    [activeSession, selectedSituation, syncingId, showToast, triggerRefresh]
  );

  const anySyncing = syncingId !== null;

  return (
    <div className="relative">
      {/* Toast flotante */}
      {toast && (
        <div
          className={`absolute right-0 -top-12 z-50 flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg shadow-lg border whitespace-nowrap ${
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {WAREHOUSES.map((wh) => {
          const isThisSyncing = syncingId === wh.id;
          const isDisabled = anySyncing && !isThisSyncing;
          const thisStatus = statusById[wh.id];

          return (
            <div
              key={wh.id}
              className={`flex flex-col gap-3 p-4 rounded-xl border transition-colors ${wh.bgClass} ${wh.borderClass}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 flex items-center justify-center rounded-lg bg-white border ${wh.borderClass}`}>
                  <i className={`${wh.icon} ${wh.textClass} text-lg`}></i>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{wh.name}</h3>
                  <p className="text-xs text-gray-500">Sincronización desde WMS</p>
                </div>
              </div>

              <button
                onClick={() => handleSync(wh)}
                disabled={isDisabled || isThisSyncing || !activeSession}
                className={`flex items-center justify-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg border transition-all whitespace-nowrap cursor-pointer ${
                  isDisabled || isThisSyncing || !activeSession
                    ? 'border-gray-200 text-gray-400 bg-white/60 cursor-not-allowed'
                    : `border-white/80 ${wh.textClass} bg-white ${wh.hoverBgClass} shadow-sm`
                }`}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  {isThisSyncing ? (
                    <i className="ri-loader-4-line animate-spin text-sm"></i>
                  ) : thisStatus === 'success' ? (
                    <i className="ri-checkbox-circle-line text-sm text-emerald-600"></i>
                  ) : thisStatus === 'error' ? (
                    <i className="ri-error-warning-line text-sm text-red-600"></i>
                  ) : (
                    <i className="ri-refresh-line text-sm"></i>
                  )}
                </div>
                {isThisSyncing
                  ? 'Sincronizando...'
                  : thisStatus === 'success'
                  ? 'Enviado'
                  : thisStatus === 'error'
                  ? 'Falló'
                  : 'Sincronizar'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}