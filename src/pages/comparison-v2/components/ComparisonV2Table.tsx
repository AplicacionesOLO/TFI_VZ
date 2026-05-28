import { useState } from 'react';
import type { ComparisonV2Line } from '@/types/comparison-v2.types';
import StatusBadgeV2 from './StatusBadgeV2';

interface ComparisonV2TableProps {
  data: ComparisonV2Line[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export default function ComparisonV2Table({
  data,
  totalCount,
  page,
  pageSize,
  onPageChange,
}: ComparisonV2TableProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePrev = () => onPageChange(Math.max(1, page - 1));
  const handleNext = () => onPageChange(Math.min(totalPages, page + 1));

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1400px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Artículo</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Ubicación A</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Ubicación B</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Teórico</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Cteo Toma A</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Usuario A</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Cteo Toma B</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">Usuario B</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Reconteo</th>
              <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Usuario Rec.</th>
              <th className="text-center text-xs font-semibold text-gray-400 uppercase tracking-wider px-4 py-3">Estado</th>
              <th className="text-right text-xs font-semibold text-gray-400 uppercase tracking-wider px-5 py-3">Dif. Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-center py-12 text-gray-400 text-sm">
                  <i className="ri-search-line text-2xl block mb-2"></i>
                  No se encontraron resultados con los filtros aplicados
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const rowKey = `${row.article_id}-${row.location_id ?? 'noloc'}-${idx}`;
                const isPendingRecount = row.comparison_status === 'PENDING_RECOUNT';
                const isAllDifferent = row.comparison_status === 'ALL_DIFFERENT';

                return (
                  <tr
                    key={rowKey}
                    className={`hover:bg-gray-50/60 transition-colors ${
                      isPendingRecount ? 'bg-amber-50/30' : isAllDifferent ? 'bg-red-50/20' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <div>
                        <span className="font-mono text-sm font-semibold text-gray-800">{row.article_id}</span>
                        {row.article_description && (
                          <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{row.article_description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-600 font-mono">
                        {row.location_id ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-600 font-mono">
                        {row.location_b_id ?? <span className="text-gray-300">—</span>}
                      </span>
                      {row.location_b_id && row.location_id && row.location_b_id !== row.location_id && (
                        <span className="text-[10px] text-amber-600 block mt-0.5">diferente</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-gray-600">{row.theoretical_qty}</td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`text-sm font-semibold ${
                        row.take_a_qty != null && row.take_a_qty !== row.theoretical_qty ? 'text-red-600' : 'text-gray-800'
                      }`}>
                        {row.take_a_qty ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{row.take_a_user ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right">
                      <span className={`text-sm font-semibold ${
                        row.take_b_qty != null && row.take_b_qty !== row.theoretical_qty ? 'text-red-600' : 'text-gray-800'
                      }`}>
                        {row.take_b_qty ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{row.take_b_user ?? '—'}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-gray-600">
                      {row.recount_qty != null ? row.recount_qty : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">
                      {row.recount_user ?? <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <StatusBadgeV2 status={row.comparison_status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span
                        className={`text-sm font-bold ${
                          row.final_difference < 0
                            ? 'text-red-600'
                            : row.final_difference > 0
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {row.final_difference > 0
                          ? `+${row.final_difference}`
                          : row.final_difference}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-50">
          <span className="text-xs text-gray-400">
            Mostrando {Math.min((page - 1) * pageSize + 1, totalCount)}–{Math.min(page * pageSize, totalCount)} de {totalCount} líneas
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
      )}
    </div>
  );
}