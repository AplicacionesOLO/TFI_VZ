import { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import PrecisionBar from './components/PrecisionBar';
import LoadingState from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import EmptyState from '@/components/base/EmptyState';
import ExportButtons from '@/components/feature/ExportButtons';
import { useSession } from '@/context/SessionContext';
import { getUserPrecision, getAllUserPrecisionForExport } from '@/services/tfi.service';
import { exportRankingToExcel } from '@/utils/exportToExcel';
import { exportRankingToCsv } from '@/utils/exportToCsv';
import type { UserPrecision } from '@/types/tfi.types';

const medalColors = ['text-amber-500', 'text-gray-400', 'text-amber-700'];
const medalIcons = ['ri-medal-line', 'ri-award-line', 'ri-trophy-line'];

export default function RankingPage() {
  const { selectedSession, sessions } = useSession();
  const [ranked, setRanked] = useState<UserPrecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  const fetchData = useCallback(() => {
    if (!selectedSession) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getUserPrecision(selectedSession)
      .then(setRanked)
      .catch((err) => setError(err?.message ?? 'Error al cargar ranking'))
      .finally(() => setLoading(false));
  }, [selectedSession]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Nombre legible de la sesión activa
  const activeSessionName = useMemo(() => {
    if (!selectedSession) return null;
    const s = sessions.find((s) => s.id === selectedSession);
    if (!s) return selectedSession;
    return s.location ? `${s.name} — ${s.location}` : s.name;
  }, [selectedSession, sessions]);

  // Exporta TODOS los usuarios de la sesión (sin límite de página visible)
  const handleExport = async (format: 'excel' | 'csv') => {
    setExportLoading(true);
    try {
      const allUsers = await getAllUserPrecisionForExport(selectedSession || undefined);
      const sessionLabel = activeSessionName ?? selectedSession ?? 'todas';
      if (format === 'excel') {
        exportRankingToExcel(allUsers, sessionLabel);
      } else {
        exportRankingToCsv(allUsers, sessionLabel);
      }
    } finally {
      setExportLoading(false);
    }
  };

  const avgPrecision =
    ranked.length > 0
      ? ranked.reduce((sum, u) => sum + Number(u.precision_percentage), 0) / ranked.length
      : 0;

  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
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
            disabled={ranked.length === 0}
            loading={loading || exportLoading}
            onExcelExport={() => handleExport('excel')}
            onCsvExport={() => handleExport('csv')}
          />
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
        {!loading && !error && selectedSession && (
          <>
            {/* Summary badges */}
            {ranked.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-6">
                <div className="flex items-center gap-2 bg-gray-900 text-white text-sm px-4 py-2 rounded-full">
                  <i className="ri-star-line text-amber-400"></i>
                  <span className="font-semibold">Precisión media:</span>
                  <span className="text-amber-300 font-bold">{avgPrecision.toFixed(2)}%</span>
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 text-sm px-4 py-2 rounded-full text-gray-600">
                  <i className="ri-user-line text-emerald-600"></i>
                  <span>{ranked.length} operadores evaluados</span>
                </div>
              </div>
            )}

            {ranked.length === 0 ? (
              <EmptyState
                title="Sin datos de ranking"
                message="No hay métricas de usuarios para esta sesión."
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
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Total artículos</th>
                        <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Diferencias</th>
                        <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-6 py-3 min-w-[240px]">% Precisión</th>
                        <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Nivel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {ranked.map((user, index) => {
                        const pos = index + 1;
                        const precVal = Number(user.precision_percentage);
                        const level =
                          precVal >= 98
                            ? { label: 'Excelente', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' }
                            : precVal >= 95
                            ? { label: 'Buena', className: 'bg-amber-50 text-amber-700 border border-amber-200' }
                            : { label: 'Atención', className: 'bg-red-50 text-red-700 border border-red-200' };

                        return (
                          <tr
                            key={`${user.session_id}-${user.user_name}`}
                            className={`hover:bg-gray-50/60 transition-colors ${pos === 1 ? 'bg-amber-50/20' : ''}`}
                          >
                            <td className="px-5 py-4 text-center">
                              {pos <= 3 ? (
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
                                  {user.user_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-gray-800">{user.user_name}</div>
                                  <div className="text-xs text-gray-400">{activeSessionName ?? 'Sesión activa'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className="text-sm font-bold text-gray-800">{Number(user.total_articles).toLocaleString()}</span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className={`text-sm font-bold ${Number(user.differences) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {user.differences}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <PrecisionBar value={precVal} />
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
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span></span>
                Precisión &ge;98% — Excelente
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block"></span></span>
                Precisión &ge;95% y &lt;98% — Buena
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 flex items-center justify-center"><span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span></span>
                Precisión &lt;95% — Requiere atención
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}