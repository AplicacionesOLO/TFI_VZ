import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import PrecisionBar from './components/PrecisionBar';
import LoadingState from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import EmptyState from '@/components/base/EmptyState';
import ExportButtons from '@/components/feature/ExportButtons';
import { useSession } from '@/context/SessionContext';
import { getRankingData } from '@/services/tfi.service';
import { exportRankingCountsToExcel, exportRankingRecountsToExcel, exportRankingGlobalToExcel } from '@/utils/exportToExcel';
import { exportRankingCountsToCsv, exportRankingRecountsToCsv, exportRankingGlobalToCsv } from '@/utils/exportToCsv';
import type { RankingsBundle, RankingType, UserRankingCounts, UserRankingRecounts, UserRankingGlobal } from '@/types/tfi.types';

const medalColors = ['text-amber-500', 'text-gray-400', 'text-amber-700'];
const medalIcons = ['ri-medal-line', 'ri-award-line', 'ri-trophy-line'];

const RANKING_TYPE_LABELS: Record<RankingType, string> = {
  counts: 'Conteos 1 y 2',
  recounts: 'Reconteos',
  global: 'Global ponderado',
};

function getLevel(precision: number, hasEnoughData: boolean) {
  if (!hasEnoughData) {
    return { label: 'Muestra insuficiente', className: 'bg-gray-100 text-gray-500 border border-gray-200' };
  }
  if (precision >= 95) {
    return { label: 'Bueno', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (precision >= 85) {
    return { label: 'Regular', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  return { label: 'Malo', className: 'bg-red-50 text-red-700 border border-red-200' };
}

export default function RankingPage() {
  const { selectedSession, sessions, refreshTrigger } = useSession();
  const [rankings, setRankings] = useState<RankingsBundle | null>(null);
  const [rankingType, setRankingType] = useState<RankingType>('counts');
  const [userFilter, setUserFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const fetchData = useCallback(() => {
    if (!selectedSession) {
      setLoading(false);
      setRankings(null);
      return;
    }
    setLoading(true);
    setError(null);
    getRankingData(selectedSession)
      .then(setRankings)
      .catch((err) => setError(err?.message ?? 'Error al cargar ranking'))
      .finally(() => setLoading(false));
  }, [selectedSession, refreshTrigger]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Resetear filtro de usuario cuando cambia la sesión
  useEffect(() => {
    setUserFilter('');
  }, [selectedSession]);

  const activeSessionName = useMemo(() => {
    if (!selectedSession) return null;
    const s = sessions.find((s) => s.id === selectedSession);
    if (!s) return selectedSession;
    return s.location ? `${s.name} — ${s.location}` : s.name;
  }, [selectedSession, sessions]);

  const currentList = useMemo(() => {
    if (!rankings) return [];
    let list: (UserRankingCounts | UserRankingRecounts | UserRankingGlobal)[] = [];
    switch (rankingType) {
      case 'counts':
        list = rankings.counts;
        break;
      case 'recounts':
        list = rankings.recounts;
        break;
      case 'global':
        list = rankings.global;
        break;
    }
    if (!userFilter.trim()) return list;
    const q = userFilter.trim().toLowerCase();
    return list.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.user_name.toLowerCase().includes(q)
    );
  }, [rankings, rankingType, userFilter]);

  const enoughDataList = useMemo(
    () => currentList.filter((u) => u.hasEnoughData),
    [currentList]
  );

  const avgPrecision = useMemo(() => {
    if (enoughDataList.length === 0) return 0;
    const sum = enoughDataList.reduce((acc, u) => acc + u.precision, 0);
    return sum / enoughDataList.length;
  }, [enoughDataList]);

  const handleExport = async (format: 'excel' | 'csv') => {
    setExportLoading(true);
    try {
      const sessionLabel = activeSessionName ?? selectedSession ?? 'todas';
      const list = currentList as UserRankingCounts[] & UserRankingRecounts[] & UserRankingGlobal[];
      if (rankingType === 'counts') {
        if (format === 'excel') exportRankingCountsToExcel(list as UserRankingCounts[], sessionLabel);
        else exportRankingCountsToCsv(list as UserRankingCounts[], sessionLabel);
      } else if (rankingType === 'recounts') {
        if (format === 'excel') exportRankingRecountsToExcel(list as UserRankingRecounts[], sessionLabel);
        else exportRankingRecountsToCsv(list as UserRankingRecounts[], sessionLabel);
      } else {
        if (format === 'excel') exportRankingGlobalToExcel(list as UserRankingGlobal[], sessionLabel);
        else exportRankingGlobalToCsv(list as UserRankingGlobal[], sessionLabel);
      }
    } finally {
      setExportLoading(false);
    }
  };

  const typeIcon: Record<RankingType, string> = {
    counts: 'ri-bar-chart-2-line',
    recounts: 'ri-loop-right-line',
    global: 'ri-scales-3-line',
  };

  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Ranking de Usuarios</h1>
            <p className="text-sm text-gray-500 mt-1">
              Clasificación por precisión de conteo descendente
              {activeSessionName && (
                <span> — <span className="font-semibold text-emerald-600">{activeSessionName}</span></span>
              )}
            </p>
          </div>
          <ExportButtons
            disabled={currentList.length === 0}
            loading={loading || exportLoading}
            onExcelExport={() => handleExport('excel')}
            onCsvExport={() => handleExport('csv')}
          />
        </div>

        {/* Selector de tipo de ranking + filtro de usuario */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['counts', 'recounts', 'global'] as RankingType[]).map((t) => (
              <button
                key={t}
                onClick={() => setRankingType(t)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                  rankingType === t
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <i className={typeIcon[t]}></i>
                {RANKING_TYPE_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                placeholder="Buscar usuario..."
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="border border-gray-200 rounded-lg text-sm pl-9 pr-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 min-w-[200px]"
              />
              {userFilter && (
                <button
                  onClick={() => setUserFilter('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <i className="ri-close-line text-sm"></i>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && <ErrorState message={error} onRetry={fetchData} />}

        {/* Loading */}
        {loading && !error && <LoadingState message="Cargando ranking de usuarios..." rows={5} />}

        {/* Sin sesiones */}
        {!loading && !error && !selectedSession && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 flex items-center justify-center bg-amber-50 rounded-2xl mb-4">
              <i className="ri-medal-line text-3xl text-amber-500"></i>
            </div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">No hay sesiones de inventario</h2>
            <p className="text-sm text-gray-500 max-w-sm">
              Ejecutá el script SQL en tu proyecto Supabase para cargar sesiones y ver el ranking de usuarios.
            </p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && selectedSession && rankings && (
          <>
            {/* Summary badges */}
            {currentList.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-6">
                <div className="flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full">
                  <i className="ri-star-line text-amber-400"></i>
                  <span className="font-semibold">Precisión media (vol. suficiente):</span>
                  <span className="text-amber-300 font-bold">{avgPrecision.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 text-sm px-4 py-2 rounded-full text-gray-600">
                  <i className="ri-user-line text-emerald-600"></i>
                  <span>{currentList.length} operadores mostrados</span>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 text-sm px-4 py-2 rounded-full text-gray-600">
                  <i className="ri-shield-check-line text-emerald-600"></i>
                  <span>{enoughDataList.length} con volumen suficiente (&ge;20)</span>
                </div>
                {userFilter && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-sm px-4 py-2 rounded-full text-emerald-700">
                    <i className="ri-search-line"></i>
                    <span>Filtro: &ldquo;{userFilter}&rdquo;</span>
                  </div>
                )}
              </div>
            )}

            {currentList.length === 0 ? (
              <EmptyState
                title="Sin datos de ranking"
                message={
                  userFilter
                    ? `No se encontraron usuarios que coincidan con "${userFilter}".`
                    : `No hay métricas de usuarios para esta sesión en "${RANKING_TYPE_LABELS[rankingType]}".`
                }
                icon="ri-user-line"
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  {/* Tabla Conteos 1 y 2 */}
                  {rankingType === 'counts' && (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 w-16">Pos.</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Conteo 1</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Errores C1</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Conteo 2</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Errores C2</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Total artículos</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Total errores</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3 min-w-[220px]">% Precisión</th>
                          <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Nivel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(currentList as UserRankingCounts[]).map((user, index) => {
                          const pos = index + 1;
                          const level = getLevel(user.precision, user.hasEnoughData);
                          return (
                            <tr
                              key={`counts-${user.user_name}`}
                              className={`hover:bg-gray-50/60 transition-colors ${pos === 1 && user.hasEnoughData ? 'bg-amber-50/20' : ''}`}
                            >
                              <td className="px-5 py-4 text-center">
                                {user.hasEnoughData && pos <= 3 ? (
                                  <div className="w-8 h-8 flex items-center justify-center mx-auto">
                                    <i className={`${medalIcons[pos - 1]} text-xl ${medalColors[pos - 1]}`}></i>
                                  </div>
                                ) : (
                                  <span className="text-sm font-bold text-gray-400">#{pos}</span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 font-bold text-sm text-gray-600 shrink-0">
                                    {user.display_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-gray-800">{user.display_name}</div>
                                    <div className="text-xs text-gray-400">{user.user_name}</div>
                                    {!user.hasEnoughData && (
                                      <div className="text-xs text-gray-400">{user.total_articulos} artículos</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className="text-sm font-bold text-gray-800">{user.total_conteo_1.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.errores_conteo_1 > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {user.errores_conteo_1}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className="text-sm font-bold text-gray-800">{user.total_conteo_2.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.errores_conteo_2 > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {user.errores_conteo_2}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className="text-sm font-bold text-gray-800">{user.total_articulos.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.total_errores > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {user.total_errores}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <PrecisionBar value={user.precision} />
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${level.className}`}>
                                  {level.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* Tabla Reconteos */}
                  {rankingType === 'recounts' && (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 w-16">Pos.</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Total reconteos</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Errores reconteo</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3 min-w-[220px]">% Precisión reconteo</th>
                          <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Nivel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(currentList as UserRankingRecounts[]).map((user, index) => {
                          const pos = index + 1;
                          const level = getLevel(user.precision, user.hasEnoughData);
                          return (
                            <tr
                              key={`recounts-${user.user_name}`}
                              className={`hover:bg-gray-50/60 transition-colors ${pos === 1 && user.hasEnoughData ? 'bg-amber-50/20' : ''}`}
                            >
                              <td className="px-5 py-4 text-center">
                                {user.hasEnoughData && pos <= 3 ? (
                                  <div className="w-8 h-8 flex items-center justify-center mx-auto">
                                    <i className={`${medalIcons[pos - 1]} text-xl ${medalColors[pos - 1]}`}></i>
                                  </div>
                                ) : (
                                  <span className="text-sm font-bold text-gray-400">#{pos}</span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 font-bold text-sm text-gray-600 shrink-0">
                                    {user.display_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-gray-800">{user.display_name}</div>
                                    <div className="text-xs text-gray-400">{user.user_name}</div>
                                    {!user.hasEnoughData && (
                                      <div className="text-xs text-gray-400">{user.total_reconteos} reconteos</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className="text-sm font-bold text-gray-800">{user.total_reconteos.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.errores_reconteo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {user.errores_reconteo}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <PrecisionBar value={user.precision} />
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${level.className}`}>
                                  {level.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* Tabla Global Ponderado */}
                  {rankingType === 'global' && (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 w-16">Pos.</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Total conteos</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Errores conteos</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Total reconteos</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Errores reconteo</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">% Prec. conteos</th>
                          <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">% Prec. reconteo</th>
                          <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3 min-w-[220px]">% Precisión global</th>
                          <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Nivel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(currentList as UserRankingGlobal[]).map((user, index) => {
                          const pos = index + 1;
                          const level = getLevel(user.precision_global, user.hasEnoughData);
                          return (
                            <tr
                              key={`global-${user.user_name}`}
                              className={`hover:bg-gray-50/60 transition-colors ${pos === 1 && user.hasEnoughData ? 'bg-amber-50/20' : ''}`}
                            >
                              <td className="px-5 py-4 text-center">
                                {user.hasEnoughData && pos <= 3 ? (
                                  <div className="w-8 h-8 flex items-center justify-center mx-auto">
                                    <i className={`${medalIcons[pos - 1]} text-xl ${medalColors[pos - 1]}`}></i>
                                  </div>
                                ) : (
                                  <span className="text-sm font-bold text-gray-400">#{pos}</span>
                                )}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 font-bold text-sm text-gray-600 shrink-0">
                                    {user.display_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-sm font-semibold text-gray-800">{user.display_name}</div>
                                    <div className="text-xs text-gray-400">{user.user_name}</div>
                                    {!user.hasEnoughData && (
                                      <div className="text-xs text-gray-400">{user.total_conteos + user.total_reconteos} totales</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className="text-sm font-bold text-gray-800">{user.total_conteos.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.errores_conteos > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {user.errores_conteos}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className="text-sm font-bold text-gray-800">{user.total_reconteos.toLocaleString()}</span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.errores_reconteo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {user.errores_reconteo}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.precision_conteos >= 95 ? 'text-emerald-600' : user.precision_conteos >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {user.precision_conteos.toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-4 py-4 text-right">
                                <span className={`text-sm font-bold ${user.precision_reconteo >= 95 ? 'text-emerald-600' : user.precision_reconteo >= 85 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {user.precision_reconteo.toFixed(2)}%
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <PrecisionBar value={user.precision_global} />
                              </td>
                              <td className="px-5 py-4 text-center">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${level.className}`}>
                                  {level.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-5 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span></span>
                Precisión &ge;95% — Bueno
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span></span>
                Precisión &ge;85% y &lt;95% — Regular
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span></span>
                Precisión &lt;85% — Malo
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-gray-300 inline-block"></span></span>
                Menos de 20 artículos — Muestra insuficiente
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}