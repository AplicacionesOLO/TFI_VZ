import type { ComparisonMode } from '@/types/comparison-v2.types';

interface FilterBarV2Props {
  articleSearch: string;
  statusFilter: string;
  onArticleSearchChange: (val: string) => void;
  onStatusFilterChange: (val: string) => void;
  onReset: () => void;
  mode?: ComparisonMode;
}

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'MATCH', label: 'MATCH' },
  { value: 'PENDING_RECOUNT', label: 'PEND. RECONTEO' },
  { value: 'RECOUNT_MATCH_A', label: 'REC. MATCH A' },
  { value: 'RECOUNT_MATCH_B', label: 'REC. MATCH B' },
  { value: 'ALL_DIFFERENT', label: 'TODOS DIFF.' },
  { value: 'DIFFERENT', label: 'DIFFERENT' },
  { value: 'PENDING_TAKE_A', label: 'PEND. TOMA A' },
  { value: 'PENDING_TAKE_B', label: 'PEND. TOMA B' },
  { value: 'SINGLE_TAKE', label: 'SOLO TOMA A' },
];

const singleTakeOptions: { value: string; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'MATCH', label: 'MATCH' },
  { value: 'DIFFERENT', label: 'DIFFERENT' },
  { value: 'PENDING_TAKE_A', label: 'PEND. TOMA A' },
];

export default function FilterBarV2({
  articleSearch,
  statusFilter,
  onArticleSearchChange,
  onStatusFilterChange,
  onReset,
  mode = 'compare',
}: FilterBarV2Props) {
  const options = mode === 'single_take' ? singleTakeOptions : statusOptions;
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 min-w-[240px]">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Artículo / Descripción</label>
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              placeholder="Buscar por código o descripción..."
              value={articleSearch}
              onChange={(e) => onArticleSearchChange(e.target.value)}
              className="w-full border border-gray-200 rounded-lg text-sm pl-8 pr-3 py-2.5 bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-2.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <button
          onClick={onReset}
          className="pb-0.5 flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-refresh-line"></i>
          Limpiar filtros
        </button>
      </div>
    </div>
  );
}