import { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import TakeSelector from './components/TakeSelector';
import FilterBarV2 from './components/FilterBarV2';
import ComparisonV2Table from './components/ComparisonV2Table';
import ColumnSettings from './components/ColumnSettings';
import LoadingState from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import ExportButtons from '@/components/feature/ExportButtons';
import { useSession } from '@/context/SessionContext';
import { useColumnConfig } from './hooks/useColumnConfig';
import {
  getAvailableTakesV2,
  getComparisonV2,
  getSingleTakeLinesV2,
} from '@/services/comparison-v2.service';
import { exportComparisonV2ToExcel } from '@/utils/exportToExcel';
import { exportComparisonV2ToCsv } from '@/utils/exportToCsv';
import type { AvailableTake, ComparisonV2Line, ComparisonV2Summary, ComparisonMode } from '@/types/comparison-v2.types';

const PAGE_SIZE = 20;

function computeSummary(lines: ComparisonV2Line[], totalCount: number, mode: ComparisonMode): ComparisonV2Summary {
  if (mode === 'single_take') {
    return {
      total: totalCount,
      matches: lines.filter((l) => l.comparison_status === 'MATCH').length,
      pending_recount: 0,
      recount_match_a: 0,
      recount_match_b: 0,
      all_different: 0,
      different: lines.filter((l) => l.comparison_status === 'DIFFERENT').length,
      single_take: lines.filter((l) => l.comparison_status === 'SINGLE_TAKE').length,
    };
  }
  return {
    total: totalCount,
    matches: lines.filter((l) => l.comparison_status === 'MATCH').length,
    pending_recount: lines.filter((l) => l.comparison_status === 'PENDING_RECOUNT').length,
    recount_match_a: lines.filter((l) => l.comparison_status === 'RECOUNT_MATCH_A').length,
    recount_match_b: lines.filter((l) => l.comparison_status === 'RECOUNT_MATCH_B').length,
    all_different: lines.filter((l) => l.comparison_status === 'ALL_DIFFERENT').length,
    different: lines.filter((l) => l.comparison_status === 'DIFFERENT').length,
    single_take: 0,
  };
}

export default function ComparisonV2Page() {
  const { selectedSession, sessions } = useSession();

  // Date range state
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Takes state
  const [availableTakes, setAvailableTakes] = useState<AvailableTake[]>([]);
  const [takeA, setTakeA] = useState('');
  const [takeB, setTakeB] = useState('');
  const [takesLoading, setTakesLoading] = useState(false);
  const [takesError, setTakesError] = useState<string | null>(null);

  // Data state
  const [lines, setLines] = useState<ComparisonV2Line[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Filters
  const [articleSearch, setArticleSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  // Export
  const [exportLoading, setExportLoading] = useState(false);

  // Mode
  const mode: ComparisonMode = useMemo(() => {
    return takeA && !takeB ? 'single_take' : 'compare';
  }, [takeA, takeB]);

  // Column config
  const columnConfig = useColumnConfig(mode);

  // ─── Cargar tomas disponibles al cambiar sesión o fechas ─────────────────────────
  useEffect(() => {
    if (!selectedSession) return;
    setTakesLoading(true);
    setTakesError(null);
    setTakeA('');
    setTakeB('');
    setLines([]);
    setTotalCount(0);

    getAvailableTakesV2(
      selectedSession,
      dateFrom || undefined,
      dateTo || undefined,
    )
      .then((takes) => {
        setAvailableTakes(takes);
        // Auto-seleccionar las dos primeras tomas (por article_count descendente)
        if (takes.length >= 2) {
          const sorted = [...takes].sort((a, b) => b.article_count - a.article_count);
          setTakeA(sorted[0].take_name);
          setTakeB(sorted[1].take_name);
        } else if (takes.length === 1) {
          setTakeA(takes[0].take_name);
        }
      })
      .catch((err) => setTakesError(err?.message ?? 'Error al cargar tomas'))
      .finally(() => setTakesLoading(false));
  }, [selectedSession, dateFrom, dateTo]);

  // ─── Cargar datos cuando cambian las tomas o filtros ────────────────────
  const fetchData = useCallback(() => {
    if (!selectedSession || !takeA) return;

    setDataLoading(true);
    setDataError(null);

    if (mode === 'single_take') {
      getSingleTakeLinesV2({
        session_id: selectedSession,
        take_name: takeA,
        article_search: articleSearch || undefined,
        status_filter: statusFilter || undefined,
        page,
        page_size: PAGE_SIZE,
      })
        .then(({ lines: data, totalCount: tc }) => {
          setLines(data);
          setTotalCount(tc);
        })
        .catch((err) => setDataError(err?.message ?? 'Error al cargar toma'))
        .finally(() => setDataLoading(false));
    } else {
      getComparisonV2({
        session_id: selectedSession,
        take_a_name: takeA,
        take_b_name: takeB,
        article_search: articleSearch || undefined,
        status_filter: statusFilter || undefined,
        page,
        page_size: PAGE_SIZE,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
        .then(({ lines: data, totalCount: tc }) => {
          setLines(data);
          setTotalCount(tc);
        })
        .catch((err) => setDataError(err?.message ?? 'Error al cargar comparación'))
        .finally(() => setDataLoading(false));
    }
  }, [selectedSession, takeA, takeB, articleSearch, statusFilter, page, dateFrom, dateTo, mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [articleSearch, statusFilter, takeA, takeB, dateFrom, dateTo]);

  const summary = useMemo(() => computeSummary(lines, totalCount, mode), [lines, totalCount, mode]);

  // Session name map for export
  const sessionNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sessions) {
      map[s.id] = s.location ? `${s.name} — ${s.location}` : s.name;
    }
    return map;
  }, [sessions]);

  const handleReset = () => {
    setArticleSearch('');
    setStatusFilter('');
  };

  const handleExport = async (format: 'excel' | 'csv') => {
    if (!selectedSession || !takeA) return;
    setExportLoading(true);
    try {
      const { getAllComparisonV2ForExport } = await import('@/services/comparison-v2.service');
      const allRows = await getAllComparisonV2ForExport({
        session_id: selectedSession,
        take_a_name: takeA,
        take_b_name: mode === 'single_take' ? null : takeB,
        article_search: articleSearch || undefined,
        status_filter: statusFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      const sessionLabel = sessionNameMap[selectedSession] ?? selectedSession;
      const title = mode === 'single_take' ? `${takeA} — Solo Toma A` : `${takeA} vs ${takeB}`;
      const visibleCols = columnConfig.visibleColumns();
      if (format === 'excel') {
        exportComparisonV2ToExcel(allRows, title, sessionLabel, mode, visibleCols);
      } else {
        exportComparisonV2ToCsv(allRows, title, sessionLabel, mode, visibleCols);
      }
    } finally {
      setExportLoading(false);
    }
  };

  const showContent = Boolean(takeA);

  const dateRangeLabel = useMemo(() => {
    if (dateFrom && dateTo) return `${dateFrom} al ${dateTo}`;
    if (dateFrom) return `Desde ${dateFrom}`;
    if (dateTo) return `Hasta ${dateTo}`;
    return null;
  }, [dateFrom, dateTo]);

  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Comparación Dinámica</h1>
            <p className="text-sm text-gray-500 mt-1">
              Comparación basada en tomas seleccionadas — arquitectura normalizada v2
              {mode === 'compare' && takeA && takeB && (
                <span className="ml-2 text-emerald-600 font-medium">
                  <i className="ri-arrow-left-right-line mr-1"></i>
                  {takeA} vs {takeB}
                </span>
              )}
              {mode === 'single_take' && takeA && (
                <span className="ml-2 text-emerald-600 font-medium">
                  <i className="ri-eye-line mr-1"></i>
                  {takeA} — Solo Toma A
                </span>
              )}
              {dateRangeLabel && (
                <span className="ml-2 text-sky-600 font-medium">
                  <i className="ri-calendar-line mr-1"></i>
                  {dateRangeLabel}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!dataLoading && showContent && totalCount > 0 && (
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <i className="ri-file-list-3-line text-emerald-600"></i>
                  <strong className="text-gray-700">{totalCount}</strong> líneas
                </span>
                {mode === 'compare' && (
                  <span className="h-4 w-px bg-gray-200"></span>
                )}
                {mode === 'compare' && (
                  <span className="flex items-center gap-1.5">
                    <i className="ri-time-line text-amber-500"></i>
                    <strong className="text-amber-700">{summary.pending_recount}</strong> pendientes
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <ExportButtons
                disabled={!showContent || lines.length === 0}
                loading={dataLoading || exportLoading}
                onExcelExport={() => handleExport('excel')}
                onCsvExport={() => handleExport('csv')}
              />
            </div>
          </div>
        </div>

        {/* Date Range + Take Selector */}
        <div className="mb-5">
          {/* Date Range Filter */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-3">
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-500">Desde</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-gray-500">Hasta</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <i className="ri-close-line"></i>
                  Limpiar fechas
                </button>
              )}
              <div className="flex-1"></div>
              {dateRangeLabel && (
                <span className="text-xs font-medium text-sky-700 bg-sky-50 px-3 py-1.5 rounded-lg border border-sky-100">
                  <i className="ri-filter-3-line mr-1"></i>
                  {availableTakes.length} tomas en rango
                </span>
              )}
            </div>
          </div>

          <TakeSelector
            takes={availableTakes}
            takeA={takeA}
            takeB={takeB}
            onTakeAChange={(name) => { setTakeA(name); setPage(1); }}
            onTakeBChange={(name) => { setTakeB(name); setPage(1); }}
            loading={takesLoading}
          />
        </div>

        {/* Takes error */}
        {takesError && (
          <ErrorState message={takesError} onRetry={() => selectedSession && getAvailableTakesV2(selectedSession, dateFrom || undefined, dateTo || undefined).then(setAvailableTakes).catch(() => {})} />
        )}

        {/* Filters */}
        {showContent && !takesError && (
          <div className="mb-5">
            <FilterBarV2
              articleSearch={articleSearch}
              statusFilter={statusFilter}
              onArticleSearchChange={setArticleSearch}
              onStatusFilterChange={setStatusFilter}
              onReset={handleReset}
              mode={mode}
            />
          </div>
        )}

        {/* Data error */}
        {dataError && <ErrorState message={dataError} onRetry={fetchData} />}

        {/* Loading */}
        {dataLoading && !dataError && showContent && (
          <LoadingState message={mode === 'single_take' ? "Cargando toma A..." : "Cargando comparación dinámica..."} rows={8} />
        )}

        {/* Content */}
        {!dataLoading && !dataError && showContent && (
          <>
            {/* Summary pills + column controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap gap-2">
                {mode === 'compare' ? (
                  [
                    { label: 'Total', value: summary.total, color: 'text-gray-600 bg-gray-100' },
                    { label: 'MATCH', value: summary.matches, color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' },
                    { label: 'Pend. Reconteo', value: summary.pending_recount, color: 'text-amber-700 bg-amber-50 border border-amber-200' },
                    { label: 'Rec. Match A', value: summary.recount_match_a, color: 'text-sky-700 bg-sky-50 border border-sky-200' },
                    { label: 'Rec. Match B', value: summary.recount_match_b, color: 'text-indigo-700 bg-indigo-50 border border-indigo-200' },
                    { label: 'Todos Diff.', value: summary.all_different, color: 'text-red-700 bg-red-50 border border-red-200' },
                  ].map((s) => (
                    <span key={s.label} className={`text-xs font-semibold px-3 py-1 rounded-full ${s.color}`}>
                      {s.label}: {s.value}
                    </span>
                  ))
                ) : (
                  [
                    { label: 'Total', value: summary.total, color: 'text-gray-600 bg-gray-100' },
                    { label: 'MATCH', value: summary.matches, color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' },
                    { label: 'Different', value: summary.different, color: 'text-red-700 bg-red-50 border border-red-200' },
                    { label: 'Solo Toma A', value: summary.single_take, color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' },
                  ].map((s) => (
                    <span key={s.label} className={`text-xs font-semibold px-3 py-1 rounded-full ${s.color}`}>
                      {s.label}: {s.value}
                    </span>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button
                    onClick={() => columnConfig.setShowSettings(!columnConfig.showSettings)}
                    className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 bg-white border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-layout-column-line"></i>
                    Columnas
                  </button>
                  {columnConfig.showSettings && (
                    <ColumnSettings
                      hidden={columnConfig.hidden}
                      onToggle={columnConfig.toggleColumn}
                      onReset={columnConfig.resetLayout}
                      onClose={() => columnConfig.setShowSettings(false)}
                      mode={mode}
                    />
                  )}
                </div>
              </div>
            </div>

            <ComparisonV2Table
              data={lines}
              totalCount={totalCount}
              page={page}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              mode={mode}
              visibleColumns={columnConfig.visibleColumns()}
              hiddenColumns={columnConfig.hidden}
              order={columnConfig.order}
              isSticky={columnConfig.isSticky}
              getStickyOffset={columnConfig.getStickyOffset}
              moveColumn={columnConfig.moveColumn}
              setDraggingId={columnConfig.setDraggingId}
              draggingId={columnConfig.draggingId}
            />
          </>
        )}

        {/* Empty state when no takes selected */}
        {!showContent && !takesLoading && !takesError && (
          <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
            <i className="ri-arrow-left-right-line text-5xl text-gray-200 block mb-4"></i>
            <h3 className="text-lg font-semibold text-gray-600 mb-2">Seleccioná una toma para comenzar</h3>
            <p className="text-sm text-gray-400 max-w-md mx-auto">
              Elegí Toma A para ver sus registros individualmente, o seleccioná Toma A y Toma B para comparar lado a lado.
              {dateRangeLabel && (
                <span className="block mt-2 text-sky-600">
                  <i className="ri-calendar-line mr-1"></i>
                  Filtrando por fechas: {dateRangeLabel}
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}