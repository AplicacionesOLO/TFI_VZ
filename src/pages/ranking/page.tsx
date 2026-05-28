import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import PrecisionBar from './components/PrecisionBar';
import LoadingState from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import EmptyState from '@/components/base/EmptyState';
import ExportButtons from '@/components/feature/ExportButtons';
import { useSession } from '@/context/SessionContext';
import { getRankingData } from '@/services/tfi.service';
import { getRankingV2 } from '@/services/ranking-v2.service';
import { getAvailableTakesV2 } from '@/services/comparison-v2.service';
import { exportRankingCountsToExcel, exportRankingRecountsToExcel, exportRankingGlobalToExcel, exportRankingV2ToExcel } from '@/utils/exportToExcel';
import { exportRankingCountsToCsv, exportRankingRecountsToCsv, exportRankingGlobalToCsv, exportRankingV2ToCsv } from '@/utils/exportToCsv';
import type { RankingsBundle, RankingType, UserRankingCounts, UserRankingRecounts, UserRankingGlobal, UserRankingV2, RankingV2Type } from '@/types/tfi.types';
import type { AvailableTake } from '@/types/comparison-v2.types';

const medalColors = ['text-amber-500', 'text-gray-400', 'text-amber-700'];
const medalIcons = ['ri-medal-line', 'ri-award-line', 'ri-trophy-line'];

const RANKING_TYPE_LABELS: Record<RankingType, string> = {
  counts: 'Conteos 1 y 2',
  recounts: 'Reconteos',
  global: 'Global ponderado',
};

const V2_TAB_LABELS: Record<RankingV2Type, string> = {
  normal: 'Conteos',
  recount: 'Reconteos',
  global: 'Global',
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

// ─── Niveles TFI oficiales para Ranking V2 ──────────────────────────────
function getLevelV2(precision: number) {
  if (precision >= 98.01) {
    return {
      label: 'ÓPTIMO',
      reconocimiento: 'Oro',
      className: 'bg-amber-50 text-amber-700 border border-amber-300',
    };
  }
  if (precision >= 93) {
    return {
      label: 'BUENO',
      reconocimiento: 'Plata',
      className: 'bg-gray-100 text-gray-600 border border-gray-300',
    };
  }
  return {
    label: 'POR MEJORAR',
    reconocimiento: '-',
    className: 'bg-red-50 text-red-600 border border-red-200',
  };
}

const typeIcon: Record<RankingType, string> = {
  counts: 'ri-bar-chart-2-line',
  recounts: 'ri-loop-right-line',
  global: 'ri-scales-3-line',
};

const v2TabIcon: Record<RankingV2Type, string> = {
  normal: 'ri-bar-chart-2-line',
  recount: 'ri-loop-right-line',
  global: 'ri-scales-3-line',
};

export default function RankingPage() {
  const { selectedSession, sessions, refreshTrigger } = useSession();

  // ─── Detección V2 ──────────────────────────────────────────────────────
  const isV2 = useMemo(() => {
    if (!selectedSession) return false;
    const s = sessions.find((s) => s.id === selectedSession);
    return (s?.attempt_lines ?? 0) > 0;
  }, [selectedSession, sessions]);

  // ─── Estado común ──────────────────────────────────────────────────────
  const [userFilter, setUserFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // ─── Estado V1 ─────────────────────────────────────────────────────────
  const [rankings, setRankings] = useState<RankingsBundle | null>(null);
  const [rankingType, setRankingType] = useState<RankingType>('counts');

  // ─── Estado V2 ─────────────────────────────────────────────────────────
  const [v2Tab, setV2Tab] = useState<RankingV2Type>('normal');
  const [v2Ranking, setV2Ranking] = useState<UserRankingV2[]>([]);
  const [availableTakes, setAvailableTakes] = useState<AvailableTake[]>([]);
  const [selectedTakeNames, setSelectedTakeNames] = useState<string[]>([]);
  const [takeDropdownOpen, setTakeDropdownOpen] = useState(false);
  const takeDropdownRef = useRef<HTMLDivElement>(null);

  // ─── Cerrar dropdown al hacer clic afuera ──────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (takeDropdownRef.current && !takeDropdownRef.current.contains(e.target as Node)) {
        setTakeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Fetch V1 ──────────────────────────────────────────────────────────
  const fetchV1 = useCallback(() => {
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

  // ─── Fetch V2 ──────────────────────────────────────────────────────────
  const fetchV2 = useCallback(async () => {
    if (!selectedSession) {
      setLoading(false);
      setV2Ranking([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const takeType = v2Tab === 'global' ? undefined : v2Tab === 'normal' ? 'NORMAL' : 'RECONTEO';
      const data = await getRankingV2({
        session_id: selectedSession,
        take_names: selectedTakeNames.length > 0 ? selectedTakeNames : undefined,
        take_type: takeType,
        user_search: userFilter.trim() || undefined,
      });
      setV2Ranking(data);
      
      // Cargar tomas disponibles si no están cargadas
      if (availableTakes.length === 0) {
        const takes = await getAvailableTakesV2(selectedSession);
        setAvailableTakes(takes);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error al cargar ranking V2');
    } finally {
      setLoading(false);
    }
  }, [selectedSession, refreshTrigger, v2Tab, selectedTakeNames, userFilter]);

  // ─── Efecto principal: elegir entre V1 y V2 ───────────────────────────
  useEffect(() => {
    if (isV2) {
      fetchV2();
    } else {
      fetchV1();
    }
  }, [isV2, fetchV1, fetchV2]);

  // ─── Resetear filtro de usuario al cambiar sesión ─────────────────────
  useEffect(() => {
    setUserFilter('');
    setSelectedTakeNames([]);
    setAvailableTakes([]);
  }, [selectedSession]);

  const activeSessionName = useMemo(() => {
    if (!selectedSession) return null;
    const s = sessions.find((s) => s.id === selectedSession);
    if (!s) return selectedSession;
    return s.location ? `${s.name} — ${s.location}` : s.name;
  }, [selectedSession, sessions]);

  // ─── V1: listas filtradas ──────────────────────────────────────────────
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

  // ─── V2: métricas ──────────────────────────────────────────────────────
  const v2EnoughData = useMemo(
    () => v2Ranking.filter((u) => u.total_conteos >= 20),
    [v2Ranking]
  );

  const v2AvgPrecision = useMemo(() => {
    if (v2EnoughData.length === 0) return 0;
    const sum = v2EnoughData.reduce((acc, u) => acc + Number(u.precision_porcentaje), 0);
    return sum / v2EnoughData.length;
  }, [v2EnoughData]);

  // ─── V2: tomas filtradas por tab ──────────────────────────────────────
  const filteredTakes = useMemo(() => {
    if (v2Tab === 'global') return availableTakes;
    const targetType = v2Tab === 'normal' ? 'NORMAL' : 'RECONTEO';
    return availableTakes.filter((t) => t.take_type === targetType);
  }, [availableTakes, v2Tab]);

  const toggleTake = (takeName: string) => {
    setSelectedTakeNames((prev) =>
      prev.includes(takeName)
        ? prev.filter((n) => n !== takeName)
        : [...prev, takeName]
    );
  };

  const clearTakes = () => setSelectedTakeNames([]);
  const selectAllFiltered = () => setSelectedTakeNames(filteredTakes.map((t) => t.take_name));

  // ─── Handlers de exportación ───────────────────────────────────────────
  const handleExport = async (format: 'excel' | 'csv') => {
    setExportLoading(true);
    try {
      const sessionLabel = activeSessionName ?? selectedSession ?? 'todas';

      if (isV2) {
        const tabLabel = V2_TAB_LABELS[v2Tab];
        if (format === 'excel') {
          exportRankingV2ToExcel(v2Ranking, sessionLabel, tabLabel);
        } else {
          exportRankingV2ToCsv(v2Ranking, sessionLabel, tabLabel);
        }
      } else {
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
      }
    } finally {
      setExportLoading(false);
    }
  };

  // ─── RENDER ────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              Ranking de Usuarios
              {isV2 && <span className="ml-2 text-sm font-normal text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full align-middle">V2</span>}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Clasificación por precisión de conteo descendente
              {activeSessionName && (
                <span> — <span className="font-semibold text-emerald-600">{activeSessionName}</span></span>
              )}
              {isV2 && (
                <span className="ml-2 text-xs text-gray-400">
                  ({v2Ranking.length} operadores)
                </span>
              )}
            </p>
          </div>
          <ExportButtons
            disabled={(isV2 ? v2Ranking.length : currentList.length) === 0}
            loading={loading || exportLoading}
            onExcelExport={() => handleExport('excel')}
            onCsvExport={() => handleExport('csv')}
          />
        </div>

        {/* Error */}
        {error && <ErrorState message={error} onRetry={isV2 ? fetchV2 : fetchV1} />}

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
              Seleccioná una sesión con datos para ver el ranking de usuarios.
            </p>
          </div>
        )}

        {/* ─── V1 CONTENT ─────────────────────────────────────────────── */}
        {!loading && !error && selectedSession && !isV2 && rankings && (
          <>
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
                Menos de 20 conteos — Muestra insuficiente
              </div>
            </div>
          </>
        )}

        {/* ─── V2 CONTENT ─────────────────────────────────────────────── */}
        {!loading && !error && selectedSession && isV2 && (
          <>
            {/* Filtros V2: Tabs + búsqueda de usuario */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {(['normal', 'recount', 'global'] as RankingV2Type[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setV2Tab(t)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer ${
                      v2Tab === t
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <i className={v2TabIcon[t]}></i>
                    {V2_TAB_LABELS[t]}
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

            {/* Selector múltiple de tomas físicas */}
            <div className="mb-6" ref={takeDropdownRef}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tomas:</span>
                <div className="relative">
                  <button
                    onClick={() => setTakeDropdownOpen(!takeDropdownOpen)}
                    className="flex items-center gap-2 border border-gray-200 rounded-lg text-sm px-3 py-2 text-gray-700 hover:border-gray-300 transition-colors bg-white cursor-pointer min-w-[240px]"
                  >
                    <i className="ri-stack-line text-gray-400"></i>
                    <span className="flex-1 text-left">
                      {selectedTakeNames.length === 0
                        ? 'Todas las tomas'
                        : `${selectedTakeNames.length} toma(s) seleccionada(s)`}
                    </span>
                    <i className={`${takeDropdownOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} text-gray-400 text-xs`}></i>
                  </button>

                  {takeDropdownOpen && (
                    <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-72 overflow-y-auto min-w-[320px]">
                      <div className="p-2 border-b border-gray-100 flex gap-2">
                        <button
                          onClick={selectAllFiltered}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer px-2 py-1 rounded hover:bg-emerald-50 whitespace-nowrap"
                        >
                          Seleccionar todas
                        </button>
                        <button
                          onClick={clearTakes}
                          className="text-xs text-gray-400 hover:text-gray-600 cursor-pointer px-2 py-1 rounded hover:bg-gray-50 whitespace-nowrap"
                        >
                          Limpiar
                        </button>
                      </div>
                      {filteredTakes.length === 0 ? (
                        <div className="p-4 text-sm text-gray-400 text-center">No hay tomas disponibles</div>
                      ) : (
                        filteredTakes.map((take) => {
                          const isSelected = selectedTakeNames.includes(take.take_name);
                          return (
                            <label
                              key={take.take_name}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
                                isSelected ? 'bg-emerald-50/30' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTake(take.take_name)}
                                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              />
                              <span className="flex-1 text-sm text-gray-700">{take.take_name}</span>
                              <span className="text-xs text-gray-400">{take.article_count.toLocaleString()} arts.</span>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                take.take_type === 'NORMAL'
                                  ? 'bg-blue-50 text-blue-600'
                                  : 'bg-amber-50 text-amber-600'
                              }`}>
                                {take.take_type === 'NORMAL' ? 'N' : 'R'}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {selectedTakeNames.length > 0 && (
                  <span className="text-xs text-gray-400">
                    {selectedTakeNames.length} de {availableTakes.length} tomas
                  </span>
                )}
              </div>
            </div>

            {/* Summary badges V2 */}
            {v2Ranking.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-6">
                <div className="flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full">
                  <i className="ri-star-line text-amber-400"></i>
                  <span className="font-semibold">Precisión media (vol. &ge;20):</span>
                  <span className="text-amber-300 font-bold">{v2AvgPrecision.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 text-sm px-4 py-2 rounded-full text-gray-600">
                  <i className="ri-user-line text-emerald-600"></i>
                  <span>{v2Ranking.length} operadores</span>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 text-sm px-4 py-2 rounded-full text-gray-600">
                  <i className="ri-shield-check-line text-emerald-600"></i>
                  <span>{v2EnoughData.length} con volumen suficiente (&ge;20)</span>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 text-sm px-4 py-2 rounded-full text-gray-600">
                  <i className="ri-file-list-3-line text-emerald-600"></i>
                  <span>{v2Ranking.reduce((s, u) => s + u.total_conteos, 0).toLocaleString()} conteos totales</span>
                </div>
                {userFilter && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-sm px-4 py-2 rounded-full text-emerald-700">
                    <i className="ri-search-line"></i>
                    <span>Filtro: &ldquo;{userFilter}&rdquo;</span>
                  </div>
                )}
              </div>
            )}

            {v2Ranking.length === 0 ? (
              <EmptyState
                title="Sin datos de ranking V2"
                message={
                  userFilter
                    ? `No se encontraron usuarios que coincidan con "${userFilter}".`
                    : `No hay datos de ranking para esta configuración en "${V2_TAB_LABELS[v2Tab]}".`
                }
                icon="ri-user-line"
              />
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/60">
                        <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3 w-16">Pos.</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Artículos</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Ubicaciones</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Total conteos</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Exactos</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Con dif.</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Dif. absoluta</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3 min-w-[220px]">% Precisión</th>
                        <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Nivel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {v2Ranking.map((user, index) => {
                        const pos = index + 1;
                        const hasEnough = user.total_conteos >= 20;
                        const precision = Number(user.precision_porcentaje);
                        const level = getLevelV2(precision);
                        const initials = user.user_id.slice(0, 2).toUpperCase();
                        return (
                          <tr
                            key={`v2-${user.user_id}`}
                            className={`hover:bg-gray-50/60 transition-colors ${pos === 1 && hasEnough ? 'bg-amber-50/20' : ''}`}
                          >
                            <td className="px-5 py-4 text-center">
                              {hasEnough && pos <= 3 ? (
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
                                  {initials}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-gray-800">{user.user_id}</div>
                                  {!hasEnough && (
                                    <div className="text-xs text-gray-400">{user.total_conteos} conteos</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-sm font-bold text-gray-800">{user.total_articulos_contados.toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-sm font-bold text-gray-800">{user.total_ubicaciones.toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-sm font-bold text-gray-800">{user.total_conteos.toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-sm font-bold text-emerald-600">{user.conteos_exactos.toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className={`text-sm font-bold ${user.conteos_con_diferencia > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {user.conteos_con_diferencia.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className={`text-sm font-bold ${Number(user.diferencia_absoluta_total) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {Number(user.diferencia_absoluta_total).toLocaleString()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <PrecisionBar value={precision} />
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
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-5 text-xs text-gray-500">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span></span>
                Óptimo: 98.01% – 100% — Oro
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-gray-400 inline-block"></span></span>
                Bueno: 93% – 98% — Plata
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-red-400 inline-block"></span></span>
                Por mejorar: &lt;93%
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}