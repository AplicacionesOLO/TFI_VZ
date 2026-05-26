import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import WarehouseSyncButtons from '@/components/feature/WarehouseSyncButtons';
import KpiCard from './components/KpiCard';
import { Link } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';
import { getDashboardStats, getAllLinesForDashboardExport, getAllUserPrecisionForExport } from '@/services/tfi.service';
import type { DashboardStats } from '@/types/tfi.types';
import { LoadingKpis } from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import StatusBadge from '@/pages/comparison/components/StatusBadge';
import { exportDashboardToExcel } from '@/utils/exportToExcel';
import { exportDashboardToCsv } from '@/utils/exportToCsv';

export default function HomePage() {
  const { selectedSession, sessions, refreshTrigger } = useSession();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const fetchStats = useCallback(() => {
    if (!selectedSession) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getDashboardStats(selectedSession)
      .then((dashStats) => setStats(dashStats))
      .catch((err) => setError(err?.message ?? 'Error al cargar el dashboard'))
      .finally(() => setLoading(false));
  }, [selectedSession, refreshTrigger]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Mapa id → nombre legible para el export
  const sessionNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sessions) {
      map[s.id] = s.location ? `${s.name} — ${s.location}` : s.name;
    }
    return map;
  }, [sessions]);

  // Nombre legible de la sesión activa
  const activeSessionName = useMemo(() => {
    if (!selectedSession) return null;
    const s = sessions.find((s) => s.id === selectedSession);
    if (!s) return null;
    return s.location ? `${s.name} — ${s.location}` : s.name;
  }, [selectedSession, sessions]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSession) ?? null,
    [sessions, selectedSession]
  );

  const showExportToast = () => {
    setExportToast('No hay datos para exportar.');
    setTimeout(() => setExportToast(null), 3000);
  };

  // El export trae todos los datos desde Supabase (sin límite de paginación visual)
  const handleExportExcel = async () => {
    if (!stats) { showExportToast(); return; }
    setExportLoading(true);
    try {
      const [allLines, ranking] = await Promise.all([
        getAllLinesForDashboardExport(selectedSession || undefined),
        getAllUserPrecisionForExport(selectedSession || undefined),
      ]);
      if (allLines.length === 0) { showExportToast(); return; }
      exportDashboardToExcel({ session: activeSession, stats, ranking, allLines, sessionNameMap });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!stats) { showExportToast(); return; }
    exportDashboardToCsv(activeSession, stats);
  };

  const precisionBadgeColor = (val: number): 'green' | 'yellow' | 'red' => {
    if (val >= 98) return 'green';
    if (val >= 95) return 'yellow';
    return 'red';
  };

  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Dashboard Operativo
            </h1>
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
              disabled={loading || exportLoading || !stats}
              title="Exportar Excel (5 hojas)"
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                loading || exportLoading || !stats
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
              disabled={loading || !stats}
              title="Exportar CSV (resumen)"
              className={`flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                loading || !stats
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
            <ErrorState message={error} onRetry={fetchStats} />
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
              La base de datos aún no tiene sesiones cargadas. Ejecutá el script SQL en tu proyecto Supabase para agregar datos.
            </p>
          </div>
        )}

        {/* KPI Grid */}
        {loading ? (
          <div className="mb-8"><LoadingKpis /></div>
        ) : !error && stats ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <KpiCard
                label="Total conteos realizados"
                value={stats.totalCounts.toLocaleString()}
                icon="ri-bar-chart-2-line"
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                badge="Conteos"
                badgeColor="green"
                trend="Conteos registrados en esta sesión"
              />
              <KpiCard
                label="Total de diferencias"
                value={stats.totalDiffs.toLocaleString()}
                icon="ri-alert-line"
                iconBg="bg-red-50"
                iconColor="text-red-500"
                badge={stats.totalDiffs > 0 ? 'Atención' : 'OK'}
                badgeColor={stats.totalDiffs > 0 ? 'red' : 'green'}
                trend="Líneas con diferencia vs teórico"
              />
              <KpiCard
                label="Precisión global ponderada"
                value={`${Number(stats.weightedPrecision).toFixed(2)}%`}
                icon="ri-scales-3-line"
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                badge={stats.weightedPrecision >= 98 ? 'Excelente' : stats.weightedPrecision >= 95 ? 'Buena' : 'Atención'}
                badgeColor={precisionBadgeColor(stats.weightedPrecision)}
                trend="Ponderada por volumen de artículos"
              />
              <KpiCard
                label="Precisión global promedio"
                value={`${Number(stats.avgPrecision).toFixed(2)}%`}
                icon="ri-percent-line"
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
                badge={stats.avgPrecision >= 98 ? 'Excelente' : stats.avgPrecision >= 95 ? 'Buena' : 'Atención'}
                badgeColor={precisionBadgeColor(stats.avgPrecision)}
                trend="Promedio simple entre usuarios"
              />
              <KpiCard
                label="Artículos pendientes de reconteo"
                value={stats.pendingRecount}
                icon="ri-time-line"
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
                badge="PEND. RECONTEO"
                badgeColor={stats.pendingRecount > 0 ? 'yellow' : 'green'}
                trend="Requieren reconteo por supervisor"
              />
              <KpiCard
                label="Artículos donde T1 y T2 coinciden"
                value={stats.matches}
                icon="ri-checkbox-circle-line"
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                badge="MATCH"
                badgeColor="green"
                trend="Ambas tomas fueron idénticas"
              />
              <KpiCard
                label="Artículos donde toma 1 fue correcta"
                value={stats.okUser1}
                icon="ri-user-star-line"
                iconBg="bg-sky-50"
                iconColor="text-sky-600"
                badge="TOMA 1 OK"
                badgeColor="gray"
                trend="Reconteo validó toma 1"
              />
              <KpiCard
                label="Artículos donde toma 2 fue correcta"
                value={stats.okUser2}
                icon="ri-user-follow-line"
                iconBg="bg-indigo-50"
                iconColor="text-indigo-600"
                badge="TOMA 2 OK"
                badgeColor="gray"
                trend="Reconteo validó toma 2"
              />
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Precision gauge */}
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
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${stats.weightedPrecision >= 98 ? 'bg-emerald-500' : stats.weightedPrecision >= 95 ? 'bg-amber-400' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(Number(stats.weightedPrecision), 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-gray-600 font-medium">Promedio</span>
                      <span className="font-bold text-gray-900">{Number(stats.avgPrecision).toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full transition-all duration-500 ${stats.avgPrecision >= 98 ? 'bg-emerald-500' : stats.avgPrecision >= 95 ? 'bg-amber-400' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(Number(stats.avgPrecision), 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-50 pt-3 flex flex-wrap gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <span className="w-2.5 h-2.5 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span></span>
                    &ge;98% Excelente
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <span className="w-2.5 h-2.5 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span></span>
                    95-98% Buena
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-500">
                    <span className="w-2.5 h-2.5 flex items-center justify-center"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span></span>
                    &lt;95% Atención
                  </span>
                </div>
              </div>

              {/* Distribution */}
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
                        <div
                          className={`${item.color} h-1.5 rounded-full`}
                          style={{ width: stats.totalLines > 0 ? `${(item.count / stats.totalLines) * 100}%` : '0%' }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick actions */}
              <div className="lg:col-span-1 bg-white rounded-xl border border-gray-100 p-6 flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-gray-700">Accesos Rápidos</h2>
                <div className="flex flex-col gap-2">
                  <Link to="/comparison" className="flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 hover:bg-emerald-50 hover:border-emerald-100 border border-transparent transition-all cursor-pointer group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-gray-100">
                        <i className="ri-file-list-3-line text-emerald-600"></i>
                      </div>
                      <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">Ver Comparación T1 vs T2</span>
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

            {/* Artículos pendientes o con diferencias */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-700">Artículos pendientes o con diferencias</h2>
                <Link to="/comparison" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 cursor-pointer">
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
                                (row.final_difference_vs_theoretical ?? 0) < 0
                                  ? 'text-red-600'
                                  : (row.final_difference_vs_theoretical ?? 0) > 0
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                              }`}>
                                {(row.final_difference_vs_theoretical ?? 0) > 0
                                  ? `+${row.final_difference_vs_theoretical}`
                                  : (row.final_difference_vs_theoretical ?? '—')}
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
        ) : null}
      </div>
    </AppLayout>
  );
}