import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import WarehouseSyncButtons from '@/components/feature/WarehouseSyncButtons';
import KpiCard from './components/KpiCard';
import { Link } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';
import {
  getDashboardStats,
  getAllLinesForDashboardExport,
  getAllUserPrecisionForExport,
} from '@/services/tfi.service';
import { getDashboardV2Stats, getDashboardV2Diffs } from '@/services/dashboard-v2.service';
import type { DashboardStats, DashboardV2Stats, DashboardV2Diff } from '@/types/tfi.types';
import { LoadingKpis } from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import StatusBadge from '@/pages/comparison/components/StatusBadge';
import { exportDashboardToExcel, exportDashboardV2ToExcel } from '@/utils/exportToExcel';
import { exportDashboardToCsv, exportDashboardV2ToCsv } from '@/utils/exportToCsv';

export default function HomePage() {
  const { selectedSession, sessions, refreshTrigger } = useSession();
  const [statsV1, setStatsV1] = useState<DashboardStats | null>(null);
  const [statsV2, setStatsV2] = useState<DashboardV2Stats | null>(null);
  const [diffsV2, setDiffsV2] = useState<DashboardV2Diff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSession) ?? null,
    [sessions, selectedSession]
  );

  const isV2 = useMemo(() => {
    if (!activeSession) return false;
    return activeSession.attempt_lines > 0;
  }, [activeSession]);

  const activeSessionName = useMemo(() => {
    if (!activeSession) return null;
    return activeSession.location ? `${activeSession.name} — ${activeSession.location}` : activeSession.name;
  }, [activeSession]);

  const fetchData = useCallback(() => {
    if (!selectedSession) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    if (isV2) {
      Promise.all([
        getDashboardV2Stats(selectedSession),
        getDashboardV2Diffs(selectedSession, 10),
      ])
        .then(([stats, diffs]) => {
          setStatsV2(stats);
          setDiffsV2(diffs);
        })
        .catch((err) => setError(err?.message ?? 'Error al cargar el dashboard'))
        .finally(() => setLoading(false));
    } else {
      getDashboardStats(selectedSession)
        .then((dashStats) => setStatsV1(dashStats))
        .catch((err) => setError(err?.message ?? 'Error al cargar el dashboard'))
        .finally(() => setLoading(false));
    }
  }, [selectedSession, isV2, refreshTrigger]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sessionNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sessions) {
      map[s.id] = s.location ? `${s.name} — ${s.location}` : s.name;
    }
    return map;
  }, [sessions]);

  const showExportToast = () => {
    setExportToast('No hay datos para exportar.');
    setTimeout(() => setExportToast(null), 3000);
  };

  const handleExportExcel = async () => {
    if (isV2) {
      if (!statsV2) { showExportToast(); return; }
      setExportLoading(true);
      try {
        exportDashboardV2ToExcel(statsV2, diffsV2, activeSession, sessionNameMap);
      } finally {
        setExportLoading(false);
      }
    } else {
      if (!statsV1) { showExportToast(); return; }
      setExportLoading(true);
      try {
        const [allLines, ranking] = await Promise.all([
          getAllLinesForDashboardExport(selectedSession || undefined),
          getAllUserPrecisionForExport(selectedSession || undefined),
        ]);
        if (allLines.length === 0) { showExportToast(); return; }
        exportDashboardToExcel({ session: activeSession, stats: statsV1, ranking, allLines, sessionNameMap });
      } finally {
        setExportLoading(false);
      }
    }
  };

  const handleExportCsv = () => {
    if (isV2) {
      if (!statsV2) { showExportToast(); return; }
      exportDashboardV2ToCsv(statsV2, activeSession);
    } else {
      if (!statsV1) { showExportToast(); return; }
      exportDashboardToCsv(activeSession, statsV1);
    }
  };

  const precisionBadgeColor = (val: number): 'green' | 'yellow' | 'red' => {
    if (val >= 98) return 'green';
    if (val >= 93) return 'yellow';
    return 'red';
  };

  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Dashboard Operativo
              </h1>
              {isV2 && (
                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  V2
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Resumen de métricas por sesión de inventario
              {activeSessionName && (
                <span> — <span className="font-semibold text-gray-700">{activeSessionName}</span></span>
              )}
            </p>
          </div>
          {/* Botones exportar resumen ejecutivo */}
          <div className="relative flex items-center gap-2">
            {exportToast && (
              <div className="absolute right-0 -top-10 bg-gray-800 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap shadow-sm z-50">
                {exportToast}
              </div>
            )}
            <button
              onClick={handleExportExcel}
              disabled={loading || exportLoading || (!isV2 ? !statsV1 : !statsV2)}
              title="Exportar Excel"
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                loading || exportLoading || (!isV2 ? !statsV1 : !statsV2)
                  ? 'border-gray-200 text-gray-300 bg-white cursor-not-allowed'
                  : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
              }`}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                {exportLoading
                  ? <i className="ri-loader-4-line text-sm animate-spin"></i>
                  : <i className="ri-file-excel-2-line text-sm"></i>
                }
              </div>
              Excel
            </button>
            <button
              onClick={handleExportCsv}
              disabled={loading || (!isV2 ? !statsV1 : !statsV2)}
              title="Exportar CSV"
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                loading || (!isV2 ? !statsV1 : !statsV2)
                  ? 'border-gray-200 text-gray-300 bg-white cursor-not-allowed'
                  : 'border-gray-300 text-gray-600 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-file-text-line text-sm"></i>
              </div>
              CSV
            </button>
          </div>
        </div>

        {/* Sincronización por almacén */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 flex items-center justify-center">
              <i className="ri-refresh-line text-gray-400"></i>
            </div>
            <h2 className="text-sm font-semibold text-gray-700">Sincronizar Almacenes</h2>
          </div>
          <WarehouseSyncButtons />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6">
            <ErrorState message={error} onRetry={fetchData} />
          </div>
        )}

        {/* Sin sesiones */}
        {!loading && !error && !selectedSession && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 flex items-center justify-center bg-emerald-50 rounded-2xl mb-4">
              <i className="ri-database-2-line text-3xl text-emerald-500"></i>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">No hay sesiones de inventario</h2>
            <p className="text-sm text-gray-500 max-w-sm">
              La base de datos aún no tiene sesiones cargadas.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="mb-8"><LoadingKpis /></div>
        ) : !error && isV2 && statsV2 ? (
          <DashboardV2Content
            stats={statsV2}
            diffs={diffsV2}
            activeSessionName={activeSessionName}
            precisionBadgeColor={precisionBadgeColor}
          />
        ) : !error && statsV1 ? (
          <DashboardV1Content
            stats={statsV1}
            activeSessionName={activeSessionName}
            precisionBadgeColor={precisionBadgeColor}
            sessionNameMap={sessionNameMap}
          />
        ) : null}
      </div>
    </AppLayout>
  );
}

// ─── V1 Legacy Dashboard ───────────────────────────────────────────────────

interface DashboardV1ContentProps {
  stats: DashboardStats;
  activeSessionName: string | null;
  precisionBadgeColor: (val: number) => 'green' | 'yellow' | 'red';
  sessionNameMap: Record<string, string>;
}

function DashboardV1Content({ stats, activeSessionName, precisionBadgeColor }: DashboardV1ContentProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total conteos realizados" value={stats.totalCounts.toLocaleString()} icon="ri-bar-chart-2-line" iconBg="bg-emerald-50" iconColor="text-emerald-600" badge="Conteos" badgeColor="green" trend="Conteos registrados en esta sesión" />
        <KpiCard label="Total de diferencias" value={stats.totalDiffs.toLocaleString()} icon="ri-alert-line" iconBg="bg-red-50" iconColor="text-red-500" badge={stats.totalDiffs > 0 ? 'Atención' : 'OK'} badgeColor={stats.totalDiffs > 0 ? 'red' : 'green'} trend="Líneas con diferencia vs teórico" />
        <KpiCard label="Precisión global ponderada" value={`${Number(stats.weightedPrecision).toFixed(2)}%`} icon="ri-scales-3-line" iconBg="bg-emerald-50" iconColor="text-emerald-600" badge={stats.weightedPrecision >= 98 ? 'Excelente' : stats.weightedPrecision >= 95 ? 'Buena' : 'Atención'} badgeColor={precisionBadgeColor(stats.weightedPrecision)} trend="Ponderada por volumen de artículos" />
        <KpiCard label="Precisión global promedio" value={`${Number(stats.avgPrecision).toFixed(2)}%`} icon="ri-percent-line" iconBg="bg-amber-50" iconColor="text-amber-600" badge={stats.avgPrecision >= 98 ? 'Excelente' : stats.avgPrecision >= 95 ? 'Buena' : 'Atención'} badgeColor={precisionBadgeColor(stats.avgPrecision)} trend="Promedio simple entre usuarios" />
        <KpiCard label="Artículos pendientes de reconteo" value={stats.pendingRecount} icon="ri-time-line" iconBg="bg-amber-50" iconColor="text-amber-600" badge="PEND. RECONTEO" badgeColor={stats.pendingRecount > 0 ? 'yellow' : 'green'} trend="Requieren reconteo por supervisor" />
        <KpiCard label="Artículos donde T1 y T2 coinciden" value={stats.matches} icon="ri-checkbox-circle-line" iconBg="bg-emerald-50" iconColor="text-emerald-600" badge="MATCH" badgeColor="green" trend="Ambas tomas fueron idénticas" />
        <KpiCard label="Artículos donde toma 1 fue correcta" value={stats.okUser1} icon="ri-user-star-line" iconBg="bg-sky-50" iconColor="text-sky-600" badge="TOMA 1 OK" badgeColor="gray" trend="Reconteo validó toma 1" />
        <KpiCard label="Artículos donde toma 2 fue correcta" value={stats.okUser2} icon="ri-user-follow-line" iconBg="bg-indigo-50" iconColor="text-indigo-600" badge="TOMA 2 OK" badgeColor="gray" trend="Reconteo validó toma 2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Precisión Global</h2>
            <span className="text-xs text-gray-400">Sesión activa</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">Ponderada</span>
                <span className="font-bold text-gray-900">{Number(stats.weightedPrecision).toFixed(2)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className={`h-2.5 rounded-full transition-all duration-500 ${stats.weightedPrecision >= 98 ? 'bg-emerald-500' : stats.weightedPrecision >= 95 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${Math.min(Number(stats.weightedPrecision), 100)}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">Promedio</span>
                <span className="font-bold text-gray-900">{Number(stats.avgPrecision).toFixed(2)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className={`h-2.5 rounded-full transition-all duration-500 ${stats.avgPrecision >= 98 ? 'bg-emerald-500' : stats.avgPrecision >= 95 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${Math.min(Number(stats.avgPrecision), 100)}%` }}></div>
              </div>
            </div>
          </div>
          <div className="border-t border-gray-50 pt-3 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              &ge;98% Excelente
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
              95-98% Buena
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
              &lt;95% Atención
            </span>
          </div>
        </div>

        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Distribución de Estados</h2>
            <span className="text-xs text-gray-400">{stats.totalLines} líneas</span>
          </div>
          <div className="space-y-2.5">
            {[
              { key: 'match', label: 'Coincide', count: stats.matches, color: 'bg-emerald-500' },
              { key: 'ok_user1', label: 'Toma 1 correcta', count: stats.okUser1, color: 'bg-sky-500' },
              { key: 'ok_user2', label: 'Toma 2 correcta', count: stats.okUser2, color: 'bg-indigo-500' },
              { key: 'pending_recount', label: 'Pend. reconteo', count: stats.pendingRecount, color: 'bg-amber-400' },
              { key: 'pending_t2', label: 'Pend. Toma 2', count: stats.pendingT2, color: 'bg-gray-300' },
              { key: 'pending_t1', label: 'Pend. Toma 1', count: stats.pendingT1, color: 'bg-orange-300' },
              { key: 'both_different', label: 'Ambas diferentes', count: stats.bothDifferent, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.key}>
                <div className="flex justify-between text-xs mb-1 text-gray-600">
                  <span>{item.label}</span>
                  <span className="font-semibold text-gray-800">{item.count}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`${item.color} h-1.5 rounded-full`} style={{ width: stats.totalLines > 0 ? `${(item.count / stats.totalLines) * 100}%` : '0%' }}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-700">Accesos Rápidos</h2>
          <div className="flex flex-col gap-2">
            <Link to="/comparison-v2" className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 hover:bg-emerald-50 hover:border-emerald-100 border border-transparent transition-all cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-100">
                  <i className="ri-arrow-left-right-line text-emerald-600"></i>
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">Ver Comparación</span>
              </div>
              <i className="ri-arrow-right-s-line text-gray-400 group-hover:text-emerald-600"></i>
            </Link>
            <Link to="/ranking" className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 hover:bg-emerald-50 hover:border-emerald-100 border border-transparent transition-all cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-100">
                  <i className="ri-medal-line text-amber-500"></i>
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">Ranking de Usuarios</span>
              </div>
              <i className="ri-arrow-right-s-line text-gray-400 group-hover:text-emerald-600"></i>
            </Link>
            <Link to="/pending" className="flex items-center justify-between px-4 py-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-100 transition-all cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-amber-100">
                  <i className="ri-time-line text-amber-500"></i>
                </div>
                <div>
                  <span className="text-sm font-medium text-amber-800 group-hover:text-amber-900">Pendientes de Reconteo</span>
                  {stats.pendingRecount > 0 && (
                    <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold">{stats.pendingRecount}</span>
                  )}
                </div>
              </div>
              <i className="ri-arrow-right-s-line text-amber-400 group-hover:text-amber-700"></i>
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Artículos pendientes o con diferencias</h2>
          <Link to="/comparison-v2" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer">
            Ver todos <i className="ri-arrow-right-line"></i>
          </Link>
        </div>
        {stats.recentDiffs.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            <i className="ri-checkbox-circle-line text-emerald-400 text-2xl block mb-2"></i>
            No hay diferencias ni pendientes en esta sesión
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Artículo</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario T1</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario T2</th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Diferencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {stats.recentDiffs.map((row) => (
                  <tr key={`${row.session_id}-${row.article_id}-${row.id}`} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <span className="font-mono text-sm font-semibold text-gray-800">{row.article_id}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={row.comparison_status} />
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{row.user_1 ?? '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{row.user_2 ?? '—'}</td>
                    <td className="px-6 py-3.5 text-right">
                      {row.comparison_status === 'pending_recount' && row.final_difference_vs_theoretical === null ? (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">Pend.</span>
                      ) : (
                        <span className={`text-sm font-bold ${
                          (row.final_difference_vs_theoretical ?? 0) < 0 ? 'text-red-600' : (row.final_difference_vs_theoretical ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'
                        }`}>
                          {(row.final_difference_vs_theoretical ?? 0) > 0 ? `+${row.final_difference_vs_theoretical}` : (row.final_difference_vs_theoretical ?? '—')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── V2 Dashboard ────────────────────────────────────────────────────────────

interface DashboardV2ContentProps {
  stats: DashboardV2Stats;
  diffs: DashboardV2Diff[];
  activeSessionName: string | null;
  precisionBadgeColor: (val: number) => 'green' | 'yellow' | 'red';
}

function DashboardV2Content({ stats, diffs, activeSessionName, precisionBadgeColor }: DashboardV2ContentProps) {
  const totalConteos = stats.total_conteos;

  return (
    <>
      {/* KPI Grid V2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total conteos" value={stats.total_conteos.toLocaleString()} icon="ri-bar-chart-2-line" iconBg="bg-emerald-50" iconColor="text-emerald-600" badge="Conteos" badgeColor="green" trend="Registros en tfi_count_attempts" />
        <KpiCard label="Artículos distintos" value={stats.total_articulos.toLocaleString()} icon="ri-box-3-line" iconBg="bg-sky-50" iconColor="text-sky-600" badge="Artículos" badgeColor="gray" trend="Artículos únicos contados" />
        <KpiCard label="Ubicaciones distintas" value={stats.total_ubicaciones.toLocaleString()} icon="ri-map-pin-2-line" iconBg="bg-indigo-50" iconColor="text-indigo-600" badge="Ubicaciones" badgeColor="gray" trend="Posiciones físicas contadas" />
        <KpiCard label="Usuarios participantes" value={stats.total_usuarios.toLocaleString()} icon="ri-user-3-line" iconBg="bg-amber-50" iconColor="text-amber-600" badge="Operadores" badgeColor="gray" trend="Operadores con conteos" />
        <KpiCard label="Precisión global" value={`${Number(stats.precision_global).toFixed(2)}%`} icon="ri-scales-3-line" iconBg="bg-emerald-50" iconColor="text-emerald-600" badge={stats.precision_global >= 98 ? 'Óptimo' : stats.precision_global >= 93 ? 'Bueno' : 'Por mejorar'} badgeColor={precisionBadgeColor(stats.precision_global)} trend="Exactos / total conteos * 100" />
        <KpiCard label="Conteos exactos" value={stats.conteos_exactos.toLocaleString()} icon="ri-checkbox-circle-line" iconBg="bg-emerald-50" iconColor="text-emerald-600" badge="Exactos" badgeColor="green" trend="count_qty = theoretical_qty" />
        <KpiCard label="Conteos con diferencia" value={stats.conteos_con_diferencia.toLocaleString()} icon="ri-alert-line" iconBg="bg-red-50" iconColor="text-red-500" badge={stats.conteos_con_diferencia > 0 ? 'Atención' : 'OK'} badgeColor={stats.conteos_con_diferencia > 0 ? 'red' : 'green'} trend="count_qty ≠ theoretical_qty" />
        <KpiCard label="Diferencia absoluta total" value={stats.diferencia_absoluta_total.toLocaleString()} icon="ri-funds-box-line" iconBg="bg-red-50" iconColor="text-red-500" badge="Σ |dif|" badgeColor="gray" trend="Suma de diferencias absolutas" />
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Precision gauge */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Precisión Global</h2>
            <span className="text-xs text-gray-400">{activeSessionName ?? 'Sesión activa'}</span>
          </div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="text-gray-600 font-medium">Precisión</span>
                <span className="font-bold text-gray-900">{Number(stats.precision_global).toFixed(2)}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div className={`h-2.5 rounded-full transition-all duration-500 ${stats.precision_global >= 98 ? 'bg-emerald-500' : stats.precision_global >= 93 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${Math.min(Number(stats.precision_global), 100)}%` }}></div>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Exactos: <strong className="text-gray-800">{stats.conteos_exactos.toLocaleString()}</strong></span>
              <span>Con dif.: <strong className="text-gray-800">{stats.conteos_con_diferencia.toLocaleString()}</strong></span>
            </div>
          </div>
          <div className="border-t border-gray-50 pt-3 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              &ge;98% Óptimo
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
              93-98% Bueno
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
              &lt;93% Por mejorar
            </span>
          </div>
        </div>

        {/* Distribution by take type */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Distribución por Tipo</h2>
            <span className="text-xs text-gray-400">{stats.total_tomas} tomas</span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'NORMAL', count: stats.tomas_normal, color: 'bg-emerald-500' },
              { label: 'RECONTEO', count: stats.tomas_reconteo, color: 'bg-amber-400' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1 text-gray-600">
                  <span>{item.label}</span>
                  <span className="font-semibold text-gray-800">{item.count.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`${item.color} h-1.5 rounded-full`} style={{ width: totalConteos > 0 ? `${(item.count / totalConteos) * 100}%` : '0%' }}></div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-50 pt-3 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              {((stats.tomas_normal / totalConteos) * 100).toFixed(1)}% NORMAL
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
              {((stats.tomas_reconteo / totalConteos) * 100).toFixed(1)}% RECONTEO
            </span>
          </div>
        </div>

        {/* Distribution by accuracy */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Distribución por Artículo</h2>
            <span className="text-xs text-gray-400">{stats.total_articulos} artículos</span>
          </div>
          <div className="space-y-2.5">
            {[
              { label: 'Sin diferencia', count: stats.articulos_sin_diferencia, color: 'bg-emerald-500' },
              { label: 'Con diferencia', count: stats.articulos_con_diferencia, color: 'bg-red-500' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1 text-gray-600">
                  <span>{item.label}</span>
                  <span className="font-semibold text-gray-800">{item.count.toLocaleString()}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`${item.color} h-1.5 rounded-full`} style={{ width: stats.total_articulos > 0 ? `${(item.count / stats.total_articulos) * 100}%` : '0%' }}></div>
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-50 pt-3 flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              {((stats.articulos_sin_diferencia / stats.total_articulos) * 100).toFixed(1)}% Sin dif.
            </span>
            <span className="flex items-center gap-1.5 text-gray-500">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>
              {((stats.articulos_con_diferencia / stats.total_articulos) * 100).toFixed(1)}% Con dif.
            </span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-700">Accesos Rápidos</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <Link to="/comparison-v2" className="flex-1 flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 hover:bg-emerald-50 hover:border-emerald-100 border border-transparent transition-all cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-100">
                  <i className="ri-arrow-left-right-line text-emerald-600"></i>
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">Comparación Dinámica</span>
              </div>
              <i className="ri-arrow-right-s-line text-gray-400 group-hover:text-emerald-600"></i>
            </Link>
            <Link to="/ranking" className="flex-1 flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 hover:bg-emerald-50 hover:border-emerald-100 border border-transparent transition-all cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-100">
                  <i className="ri-medal-line text-amber-500"></i>
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">Ranking de Usuarios</span>
              </div>
              <i className="ri-arrow-right-s-line text-gray-400 group-hover:text-emerald-600"></i>
            </Link>
            <Link to="/pending" className="flex-1 flex items-center justify-between px-4 py-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-100 transition-all cursor-pointer group">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-amber-100">
                  <i className="ri-time-line text-amber-500"></i>
                </div>
                <div>
                  <span className="text-sm font-medium text-amber-800 group-hover:text-amber-900">Pendientes</span>
                  {stats.articulos_con_diferencia > 0 && (
                    <span className="ml-2 text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded-full font-semibold">{stats.articulos_con_diferencia}</span>
                  )}
                </div>
              </div>
              <i className="ri-arrow-right-s-line text-amber-400 group-hover:text-amber-700"></i>
            </Link>
          </div>
        </div>
      </div>

      {/* Top artículos con diferencias */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Top artículos con mayor diferencia</h2>
          <Link to="/comparison-v2" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer">
            Ver comparación <i className="ri-arrow-right-line"></i>
          </Link>
        </div>
        {diffs.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            <i className="ri-checkbox-circle-line text-emerald-400 text-2xl block mb-2"></i>
            No hay artículos con diferencias en esta sesión
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Artículo</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Conteos</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Exactos</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Con dif.</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Ubicaciones</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Última toma</th>
                  <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario</th>
                  <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3">Máx. dif.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {diffs.map((row) => (
                  <tr key={row.article_id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-6 py-3.5">
                      <div>
                        <span className="font-mono text-sm font-semibold text-gray-800">{row.article_id}</span>
                        {row.article_description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{row.article_description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{row.total_conteos}</td>
                    <td className="px-4 py-3.5 text-sm text-emerald-600 font-medium">{row.exactos}</td>
                    <td className="px-4 py-3.5 text-sm text-red-600 font-medium">{row.con_diferencia}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{row.ubicaciones}</td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${row.last_take_type === 'RECONTEO' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {row.last_take_name}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{row.last_user ?? '—'}</td>
                    <td className="px-6 py-3.5 text-right">
                      <span className="text-sm font-bold text-red-600">
                        {row.max_difference.toLocaleString()}
                      </span>
                      <span className="text-xs text-gray-400 ml-1">(teórico: {row.theoretical_qty})</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}