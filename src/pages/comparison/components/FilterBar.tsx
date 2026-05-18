interface FilterBarProps {
  users1: string[];
  users2: string[];
  filters: {
    article: string;
    user1: string;
    user2: string;
    status: string;
    onlyDiffs: boolean;
    pendingOnly: boolean;
  };
  onChange: (key: string, value: string | boolean) => void;
  onReset: () => void;
}

const statusOptions: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'match', label: 'MATCH' },
  { value: 'ok_user1', label: 'TOMA 1 OK' },
  { value: 'ok_user2', label: 'TOMA 2 OK' },
  { value: 'pending_recount', label: 'PEND. RECONTEO' },
  { value: 'pending_t2', label: 'PEND. TOMA 2' },
  { value: 'pending_t1', label: 'PEND. TOMA 1' },
  { value: 'both_different', label: 'AMBAS DIFF.' },
];

export default function FilterBar({ users1, users2, filters, onChange, onReset }: FilterBarProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Article */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Artículo</label>
          <div className="relative">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input
              type="text"
              placeholder="Buscar artículo..."
              value={filters.article}
              onChange={(e) => onChange('article', e.target.value)}
              className="w-full border border-gray-200 rounded-lg text-sm pl-8 pr-3 py-2 bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
            />
          </div>
        </div>

        {/* User 1 */}
        <div className="flex flex-col gap-1 min-w-[150px]">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Usuario T1</label>
          <select
            value={filters.user1}
            onChange={(e) => onChange('user1', e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
          >
            <option value="">Todos</option>
            {users1.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* User 2 */}
        <div className="flex flex-col gap-1 min-w-[150px]">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Usuario T2</label>
          <select
            value={filters.user2}
            onChange={(e) => onChange('user2', e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
          >
            <option value="">Todos</option>
            {users2.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estado</label>
          <select
            value={filters.status}
            onChange={(e) => onChange('status', e.target.value)}
            className="border border-gray-200 rounded-lg text-sm px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 cursor-pointer"
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-3 pb-0.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.onlyDiffs}
              onChange={(e) => onChange('onlyDiffs', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <span className="text-sm text-gray-600 whitespace-nowrap">Solo diferencias</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.pendingOnly}
              onChange={(e) => onChange('pendingOnly', e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400 cursor-pointer"
            />
            <span className="text-sm text-gray-600 whitespace-nowrap">Pendientes reconteo</span>
          </label>
        </div>

        {/* Reset */}
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