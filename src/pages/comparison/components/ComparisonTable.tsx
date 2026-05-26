import { useState } from 'react';
import type { TfiComparisonLine } from '@/types/tfi.types';
import StatusBadge from './StatusBadge';

interface ComparisonTableProps {
  data: TfiComparisonLine[];
}

const PAGE_SIZE = 10;

export default function ComparisonTable({ data }: ComparisonTableProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const paginated = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Artículo</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Teórico</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Cteo T1</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario T1</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Cteo T2</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario T2</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Reconteo</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario Reconteo</th>
              <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Estado</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Dif. Final</th>
              <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Sit. T1</th>
              <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Sit. T2</th>
              <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-3">Sit. Rec.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={13} className="text-center py-12 text-gray-400 text-sm">
                  <i className="ri-search-line text-2xl block mb-2"></i>
                  No se encontraron resultados con los filtros aplicados
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr
                  key={`${row.session_id}-${row.article_id}-${row.id}`}
                  className={`hover:bg-gray-50/60 transition-colors ${row.comparison_status === 'pending_recount' ? 'bg-amber-50/30' : ''}`}
                >
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-sm font-semibold text-gray-800">{row.article_id}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-sm text-gray-600">{row.theoretical_qty}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`text-sm font-semibold ${row.difference_user_1 > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {row.count_1_qty}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">{row.user_1}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`text-sm font-semibold ${row.difference_user_2 > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {row.count_2_qty}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">{row.user_2}</td>
                  <td className="px-4 py-3.5 text-right text-sm text-gray-600">
                    {row.recount_qty != null ? row.recount_qty : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">
                    {row.recount_user ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <StatusBadge status={row.comparison_status} />
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span
                      className={`text-sm font-bold ${
                        (row.final_difference_vs_theoretical ?? 0) < 0
                          ? 'text-red-600'
                          : (row.final_difference_vs_theoretical ?? 0) > 0
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }`}
                    >
                      {(row.final_difference_vs_theoretical ?? 0) > 0
                        ? `+${row.final_difference_vs_theoretical}`
                        : (row.final_difference_vs_theoretical ?? '—')}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <SituationCell value={row.situation_1} />
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <SituationCell value={row.situation_2} />
                  </td>
                  <td className="px-3 py-3.5 text-center">
                    <SituationCell value={row.situation_recount} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-50">
        <span className="text-xs text-gray-400">
          Mostrando {Math.min((page - 1) * PAGE_SIZE + 1, data.length)}–{Math.min(page * PAGE_SIZE, data.length)} de {data.length} líneas
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={page === 1}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 disabled:opacity-30 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-left-s-line text-sm"></i>
          </button>
          <span className="text-xs text-gray-500 font-medium">
            {page} / {totalPages}
          </span>
          <button
            onClick={handleNext}
            disabled={page === totalPages}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-900 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-right-s-line text-sm"></i>
          </button>
        </div>
      </div>
    </div>
  );
}

function SituationCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-gray-300 text-sm">—</span>;

  const colorMap: Record<string, string> = {
    APLICADO: 'text-emerald-700 bg-emerald-50',
    DISPONIBLE: 'text-sky-700 bg-sky-50',
    CANCELADO: 'text-red-700 bg-red-50',
  };

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorMap[value] ?? 'text-gray-600 bg-gray-100'}`}>
      {value}
    </span>
  );
}