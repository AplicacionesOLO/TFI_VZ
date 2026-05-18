import { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import FilterBar from './components/FilterBar';
import ComparisonTable from './components/ComparisonTable';
import LoadingState from '@/components/base/LoadingState';
import ErrorState from '@/components/base/ErrorState';
import ExportButtons from '@/components/feature/ExportButtons';
import { useSession } from '@/context/SessionContext';
import { getComparisonLines, getDistinctUsers, getAllComparisonLinesForExport } from '@/services/tfi.service';
import { exportComparisonToExcel } from '@/utils/exportToExcel';
import { exportComparisonToCsv } from '@/utils/exportToCsv';
import type { ComparisonLine } from '@/types/tfi.types';

const defaultFilters = {
  article: '',
  user1: '',
  user2: '',
  status: '',
  onlyDiffs: false,
  pendingOnly: false,
};

export default function ComparisonPage() {
  const { selectedSession } = useSession();
  const [filters, setFilters] = useState(defaultFilters);
  const [lines, setLines] = useState<ComparisonLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users1, setUsers1] = useState<string[]>([]);
  const [users2, setUsers2] = useState<string[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  // selectedSession es la ÚNICA fuente de verdad para la sesión
  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);

    const serviceFilters = {
      session_id: selectedSession || undefined,
      article_id: filters.article || undefined,
      user_1: filters.user1 || undefined,
      user_2: filters.user2 || undefined,
      comparison_status: filters.status || undefined,
      onlyDiffs: filters.onlyDiffs,
      pendingOnly: filters.pendingOnly,
    };

    Promise.all([
      getComparisonLines(serviceFilters),
      getDistinctUsers(selectedSession || undefined),
    ])
      .then(([data, usersData]) => {
        setLines(data);
        setUsers1(usersData.users1);
        setUsers2(usersData.users2);
      })
      .catch((err) => setError(err?.message ?? 'Error al cargar comparación'))
      .finally(() => setLoading(false));
  }, [selectedSession, filters.article, filters.user1, filters.user2, filters.status, filters.onlyDiffs, filters.pendingOnly]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Resetear filtros de contenido cuando cambia la sesión global
  useEffect(() => {
    setFilters(defaultFilters);
  }, [selectedSession]);

  const handleChange = (key: string, value: string | boolean) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleReset = () => setFilters(defaultFilters);

  // Exporta TODOS los registros filtrados (sin paginación visual)
  const handleExport = async (format: 'excel' | 'csv') => {
    setExportLoading(true);
    try {
      const exportFilters = {
        session_id: selectedSession || undefined,
        article_id: filters.article || undefined,
        user_1: filters.user1 || undefined,
        user_2: filters.user2 || undefined,
        comparison_status: filters.status || undefined,
        onlyDiffs: filters.onlyDiffs,
        pendingOnly: filters.pendingOnly,
      };
      const allRows = await getAllComparisonLinesForExport(exportFilters);
      if (format === 'excel') {
        exportComparisonToExcel(allRows, selectedSession ?? 'todas');
      } else {
        exportComparisonToCsv(allRows, selectedSession ?? 'todas');
      }
    } finally {
      setExportLoading(false);
    }
  };

  const summaryStats = useMemo(() => ({
    total: lines.length,
    matches: lines.filter((l) => l.comparison_status === 'match').length,
    pending: lines.filter((l) => l.comparison_status === 'pending_recount').length,
    diffs: lines.filter((l) => (l.final_difference_vs_theoretical ?? 0) !== 0).length,
  }), [lines]);

  return (
    <AppLayout>
      <div className="px-6 md:px-8 py-8 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Comparación T1 vs T2</h1>
            <p className="text-sm text-gray-500 mt-1">
              Comparación línea por línea de toma 1 vs toma 2
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!loading && (
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <i className="ri-file-list-3-line text-emerald-600"></i>
                  <strong className="text-gray-700">{summaryStats.total}</strong> líneas
                </span>
                <span className="h-4 w-px bg-gray-200"></span>
                <span className="flex items-center gap-1.5">
                  <i className="ri-time-line text-amber-500"></i>
                  <strong className="text-amber-700">{summaryStats.pending}</strong> pendientes
                </span>
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

        {/* Filters — sin selector de sesión, la sesión viene del TopNav */}
        <div className="mb-5">
          <FilterBar
            users1={users1}
            users2={users2}
            filters={filters}
            onChange={handleChange}
            onReset={handleReset}
          />
        </div>

        {/* Error */}
        {error && <ErrorState message={error} onRetry={fetchData} />}

        {/* Loading */}
        {loading && !error && <LoadingState message="Cargando líneas de comparación..." rows={8} />}

        {/* Content */}
        {!loading && !error && (
          <>
            {/* Summary pills */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { label: 'Total', value: summaryStats.total, color: 'text-gray-600 bg-gray-100' },
                { label: 'MATCH', value: summaryStats.matches, color: 'text-emerald-700 bg-emerald-50 border border-emerald-200' },
                { label: 'Pendientes', value: summaryStats.pending, color: 'text-amber-700 bg-amber-50 border border-amber-200' },
                { label: 'Con diferencia', value: summaryStats.diffs, color: 'text-red-700 bg-red-50 border border-red-200' },
              ].map((s) => (
                <span key={s.label} className={`text-xs font-semibold px-3 py-1 rounded-full ${s.color}`}>
                  {s.label}: {s.value}
                </span>
              ))}
            </div>
            <ComparisonTable data={lines} />
          </>
        )}
      </div>
    </AppLayout>
  );
}