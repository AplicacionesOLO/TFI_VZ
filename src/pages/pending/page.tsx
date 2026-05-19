import { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import StatusBadge from '@/pages/comparison/components/StatusBadge';
import LoadingState from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import ExportButtons from '@/components/feature/ExportButtons';
import { Link } from 'react-router-dom';
import { useSession } from '@/context/SessionContext';
import { getComparisonLines, getAllPendingRecountForExport } from '@/services/tfi.service';
import { exportPendingToExcel } from '@/utils/exportToExcel';
import { exportPendingToCsv } from '@/utils/exportToCsv';
import type { ComparisonLine } from '@/types/tfi.types';

export default function PendingPage() {
  const { selectedSession, sessions } = useSession();
  const [articleFilter, setArticleFilter] = useState('');
  const [lines, setLines] = useState<ComparisonLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // La sesión siempre viene del contexto global — no hay selector local de sesión
  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    getComparisonLines({
      session_id: selectedSession || undefined,
      pendingOnly: true,
    })
      .then(setLines)
      .catch((err) => setError(err?.message ?? 'Error al cargar pendientes'))
      .finally(() => setLoading(false));
  }, [selectedSession]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Resetear búsqueda cuando cambia la sesión global
  useEffect(() => {
    setArticleFilter('');
  }, [selectedSession]);

  const pendingLines = useMemo(() => {
    if (!articleFilter) return lines;
    return lines.filter((l) =>
      l.article_id.toLowerCase().includes(articleFilter.toLowerCase()) ||
      (l.article_description ?? '').toLowerCase().includes(articleFilter.toLowerCase())
    );
  }, [lines, articleFilter]);

  // Mapa id → nombre legible para el export
  const sessionNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sessions) {
      map[s.id] = s.location ? `${s.name} — ${s.location}` : s.name;
    }
    return map;
  }, [sessions]);

  // Nombre de la sesión activa para mostrarlo en la UI
  const activeSessionName = useMemo(() => {
    if (!selectedSession) return null;
    const s = sessions.find((s) => s.id === selectedSession);
    return s ? (s.location ? `${s.name} — ${s.location}` : s.name) : selectedSession;
  }, [selectedSession, sessions]);

  // Exporta TODOS los pending_recount de la sesión, ignorando el filtro visual de artículo.
  // La paginación es solo visual — el export descarga todos los registros.
  const handleExport = async (format: 'excel' | 'csv') => {
    setExportLoading(true);
    try {
      const allPending = await getAllPendingRecountForExport(selectedSession || undefined);
      const sessionLabel = activeSessionName ?? selectedSession ?? 'todas';
      if (format === 'excel') {
        exportPendingToExcel(allPending, sessionLabel, sessionNameMap);
      } else {
        exportPendingToCsv(allPending, sessionLabel, sessionNameMap);
      }
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg">
                <i className="ri-time-line text-amber-600 text-base"></i>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Pendientes de Reconteo</h1>
            </div>
            <p className="text-sm text-gray-500 ml-10">
              Artículos donde T1 y T2 difieren y requieren reconteo por supervisor
              {activeSessionName && (
                <span className="ml-1 font-semibold text-gray-600">— {activeSessionName}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!loading && lines.length > 0 && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <i className="ri-alert-line text-amber-600 text-lg"></i>
                <div>
                  <div className="text-xl font-bold text-amber-800">{lines.length}</div>
                  <div className="text-xs text-amber-600 leading-none">artículos pendientes</div>
                </div>
              </div>
            )}
            <ExportButtons
              disabled={lines.length === 0}
              loading={loading || exportLoading}
              onExcelExport={() => handleExport('excel')}
              onCsvExport={() => handleExport('csv')}
            />
          </div>
        </div>

        {/* Alert banner */}
        {!loading && lines.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start gap-3">
              <i className="ri-information-line text-amber-600 text-xl mt-0.5"></i>
              <div>
                <div className="text-sm font-semibold text-amber-800">Acción requerida</div>
                <div className="text-sm text-amber-700">
                  Estos artículos presentaron diferencias entre Toma 1 y Toma 2. Un supervisor debe realizar el reconteo físico para determinar la cantidad correcta.
                </div>
              </div>
            </div>
            <Link
              to="/comparison"
              className="shrink-0 flex items-center gap-2 bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-file-list-3-line"></i>
              Ver comparación completa
            </Link>
          </div>
        )}

        {/* Filtro de artículo */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1 min-w-[220px]">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Buscar artículo</label>
            <div className="relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                placeholder="Código o descripción..."
                value={articleFilter}
                onChange={(e) => setArticleFilter(e.target.value)}
                className="w-full border border-gray-200 rounded-lg text-sm pl-8 pr-3 py-2 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
              />
            </div>
          </div>
          {articleFilter && (
            <button
              onClick={() => setArticleFilter('')}
              className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1.5 cursor-pointer whitespace-nowrap pb-0.5"
            >
              <i className="ri-refresh-line"></i> Limpiar
            </button>
          )}
          {!loading && (
            <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
              <i className="ri-time-line text-amber-400"></i>
              <span>
                Sesión:{' '}
                <strong className="text-gray-600">{activeSessionName ?? 'Todas'}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Error */}
        {error && <ErrorState message={error} onRetry={fetchData} />}

        {/* Loading */}
        {loading && !error && <LoadingState message="Cargando artículos pendientes..." rows={4} />}

        {/* Content */}
        {!loading && !error && (
          pendingLines.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 py-20 text-center">
              <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-emerald-50 rounded-full">
                <i className="ri-checkbox-circle-line text-emerald-500 text-3xl"></i>
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {articleFilter ? 'Sin resultados para esta búsqueda' : 'No hay artículos pendientes de reconteo'}
              </h3>
              <p className="text-sm text-gray-400 max-w-sm mx-auto">
                {articleFilter
                  ? `No se encontraron artículos pendientes que coincidan con "${articleFilter}".`
                  : `No hay artículos pendientes de reconteo para esta sesión${activeSessionName ? ` (${activeSessionName})` : ''}.`}
              </p>
              {articleFilter && (
                <button
                  onClick={() => setArticleFilter('')}
                  className="mt-4 text-sm text-amber-600 hover:text-amber-700 font-medium cursor-pointer"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-amber-50/40">
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Artículo</th>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Descripción</th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Teórico</th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Cteo T1</th>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario T1</th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Cteo T2</th>
                      <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario T2</th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Dif. U1</th>
                      <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Dif. U2</th>
                      <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-50">
                    {pendingLines.map((row) => (
                      <tr
                        key={`${row.session_id}-${row.article_id}-${row.id}`}
                        className="bg-amber-50/20 hover:bg-amber-50/50 transition-colors"
                      >
                        <td className="px-5 py-3.5">
                          <span className="font-mono text-sm font-semibold text-gray-800">{row.article_id}</span>
                        </td>
                        <td className="px-4 py-3.5 text-sm text-gray-500 max-w-[200px] truncate">
                          {row.article_description ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-right text-sm text-gray-600">{row.theoretical_qty}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-semibold text-red-600">{row.count_1_qty ?? '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{row.user_1 ?? '—'}</td>
                        <td className="px-4 py-3.5 text-right text-sm font-semibold text-red-600">{row.count_2_qty ?? '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{row.user_2 ?? '—'}</td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`text-sm font-bold ${row.difference_user_1 > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {row.difference_user_1}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span className={`text-sm font-bold ${row.difference_user_2 > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {row.difference_user_2}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <StatusBadge status={row.comparison_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-5 py-3.5 border-t border-amber-50 bg-amber-50/20 flex items-center justify-between">
                <span className="text-xs text-amber-700 font-medium">
                  <i className="ri-time-line mr-1.5"></i>
                  {pendingLines.length} artículo{pendingLines.length !== 1 ? 's' : ''} requiere{pendingLines.length !== 1 ? 'n' : ''} reconteo
                </span>
                {articleFilter && lines.length !== pendingLines.length && (
                  <span className="text-xs text-gray-400">
                    Mostrando {pendingLines.length} de {lines.length} totales
                  </span>
                )}
              </div>
            </div>
          )
        )}
      </div>
    </AppLayout>
  );
}