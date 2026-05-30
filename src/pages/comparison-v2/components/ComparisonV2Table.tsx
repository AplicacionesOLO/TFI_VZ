import { useState } from 'react';
import type { ComparisonV2Line } from '@/types/comparison-v2.types';
import { COLUMN_META, GROUP_COLORS, GROUP_LABELS } from '@/pages/comparison-v2/types/columns';
import StatusBadgeV2 from './StatusBadgeV2';

interface ComparisonV2TableProps {
  data: ComparisonV2Line[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  mode?: 'compare' | 'single_take';
  visibleColumns: string[];
  hiddenColumns: string[];
  order: string[];
  isSticky: (id: string) => boolean;
  getStickyOffset: (id: string) => string | undefined;
  moveColumn: (fromId: string, toId: string) => void;
  setDraggingId: (id: string | null) => void;
  draggingId: string | null;
}

export default function ComparisonV2Table({
  data,
  totalCount,
  page,
  pageSize,
  onPageChange,
  mode = 'compare',
  visibleColumns,
  order,
  isSticky,
  getStickyOffset,
  moveColumn,
  setDraggingId,
  draggingId,
}: ComparisonV2TableProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handlePrev = () => onPageChange(Math.max(1, page - 1));
  const handleNext = () => onPageChange(Math.min(totalPages, page + 1));

  const isSingleTake = mode === 'single_take';

  function getCellBg(group: string): string {
    const color = GROUP_COLORS[group as keyof typeof GROUP_COLORS];
    if (!color) return 'bg-white';
    return '';
  }

  function getCellStyle(group: string): React.CSSProperties {
    const color = GROUP_COLORS[group as keyof typeof GROUP_COLORS];
    if (!color) return {};
    return { backgroundColor: color };
  }

  function renderCell(colId: string, row: ComparisonV2Line): React.ReactNode {
    switch (colId) {
      case 'article_id':
        return (
          <div>
            <span className="font-mono text-sm font-semibold text-gray-800">{row.article_id}</span>
            {row.article_description && (
              <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{row.article_description}</p>
            )}
          </div>
        );
      case 'location_id':
        return (
          <span className="text-sm text-gray-600 font-mono">
            {row.location_id ?? <span className="text-gray-300">—</span>}
          </span>
        );
      case 'location_b_id':
        return (
          <span className="text-sm text-gray-600 font-mono">
            {row.location_b_id ?? <span className="text-gray-300">—</span>}
          </span>
        );
      case 'theoretical_qty':
        return <span className="text-sm text-gray-600">{row.theoretical_qty}</span>;
      case 'take_a_qty':
        return (
          <span
            className={`text-sm font-semibold ${
              row.take_a_qty != null && row.take_a_qty !== row.theoretical_qty ? 'text-red-600' : 'text-gray-800'
            }`}
          >
            {row.take_a_qty ?? <span className="text-gray-300">—</span>}
          </span>
        );
      case 'take_a_user':
        return <span className="text-sm text-gray-600">{row.take_a_user ?? '—'}</span>;
      case 'difference_a': {
        const diff = row.take_a_qty != null ? row.take_a_qty - row.theoretical_qty : null;
        return (
          <span
            className={`text-sm font-bold ${
              diff != null
                ? diff < 0
                  ? 'text-red-600'
                  : diff > 0
                  ? 'text-amber-600'
                  : 'text-emerald-600'
                : 'text-gray-300'
            }`}
          >
            {diff != null ? (diff > 0 ? `+${diff}` : diff) : '—'}
          </span>
        );
      }
      case 'situation_a':
        return <span className="text-sm text-gray-600">{row.situation ?? '—'}</span>;
      case 'form_status_a':
        return <span className="text-sm text-gray-600">{row.form_status ?? '—'}</span>;
      case 'take_b_qty':
        return (
          <span
            className={`text-sm font-semibold ${
              row.take_b_qty != null && row.take_b_qty !== row.theoretical_qty ? 'text-red-600' : 'text-gray-800'
            }`}
          >
            {row.take_b_qty ?? <span className="text-gray-300">—</span>}
          </span>
        );
      case 'take_b_user':
        return <span className="text-sm text-gray-600">{row.take_b_user ?? '—'}</span>;
      case 'difference_b': {
        const diff = row.take_b_qty != null ? row.take_b_qty - row.theoretical_qty : null;
        return (
          <span
            className={`text-sm font-bold ${
              diff != null
                ? diff < 0
                  ? 'text-red-600'
                  : diff > 0
                  ? 'text-amber-600'
                  : 'text-emerald-600'
                : 'text-gray-300'
            }`}
          >
            {diff != null ? (diff > 0 ? `+${diff}` : diff) : '—'}
          </span>
        );
      }
      case 'situation_b':
        return <span className="text-sm text-gray-600">{row.situation_b ?? '—'}</span>;
      case 'form_status_b':
        return <span className="text-sm text-gray-600">{row.form_status_b ?? '—'}</span>;
      case 'recount_qty':
        return (
          <span className="text-sm text-gray-600">
            {row.recount_qty != null ? row.recount_qty : <span className="text-gray-300">—</span>}
          </span>
        );
      case 'recount_user':
        return (
          <span className="text-sm text-gray-600">
            {row.recount_user ?? <span className="text-gray-300">—</span>}
          </span>
        );
      case 'situation_recount':
        return <span className="text-sm text-gray-600">{row.situation_recount ?? '—'}</span>;
      case 'form_status_recount':
        return <span className="text-sm text-gray-600">{row.form_status_recount ?? '—'}</span>;
      case 'final_difference':
        return (
          <span
            className={`text-sm font-bold ${
              row.final_difference < 0
                ? 'text-red-600'
                : row.final_difference > 0
                ? 'text-amber-600'
                : 'text-emerald-600'
            }`}
          >
            {row.final_difference > 0 ? `+${row.final_difference}` : row.final_difference}
          </span>
        );
      case 'comparison_status':
        return <StatusBadgeV2 status={row.comparison_status} />;
      case 'registered_at':
        return (
          <span className="text-sm text-gray-600">
            {row.registered_at ? new Date(row.registered_at).toLocaleDateString('es-AR') : '—'}
          </span>
        );
      default:
        return <span className="text-sm text-gray-400">—</span>;
    }
  }

  function getAlignClass(colId: string): string {
    const meta = COLUMN_META[colId];
    if (!meta) return 'text-left';
    if (meta.align === 'right') return 'text-right';
    if (meta.align === 'center') return 'text-center';
    return 'text-left';
  }

  function getPxClass(colId: string): string {
    const meta = COLUMN_META[colId];
    if (!meta) return 'px-4';
    if (meta.sticky) return 'px-5';
    return 'px-4';
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className={`w-full ${isSingleTake ? 'min-w-[900px]' : 'min-w-[1400px]'}`}>
          <thead>
            {/* Group labels row */}
            <tr className="border-b border-gray-100">
              {visibleColumns.map((colId) => {
                const meta = COLUMN_META[colId];
                if (!meta) return null;
                const sticky = isSticky(colId);
                const stickyOffset = getStickyOffset(colId);
                const style = getCellStyle(meta.group);
                return (
                  <th
                    key={`group-${colId}`}
                    className={`text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-1 ${meta.width} ${meta.minWidth} ${sticky ? `sticky ${stickyOffset} z-[35]` : ''} ${getCellBg(meta.group)}`}
                    style={style}
                  >
                    {GROUP_LABELS[meta.group]}
                  </th>
                );
              })}
            </tr>
            {/* Column names row */}
            <tr className="border-b border-gray-100">
              {visibleColumns.map((colId) => {
                const meta = COLUMN_META[colId];
                if (!meta) return null;
                const sticky = isSticky(colId);
                const stickyOffset = getStickyOffset(colId);
                const style = getCellStyle(meta.group);
                const draggable = !sticky;
                const isDragging = draggingId === colId;
                const isDragOver = dragOverId === colId;
                return (
                  <th
                    key={`col-${colId}`}
                    draggable={draggable}
                    onDragStart={(e) => {
                      if (!draggable) {
                        e.preventDefault();
                        return;
                      }
                      setDraggingId(colId);
                      e.dataTransfer.setData('text/plain', colId);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (!draggable) return;
                      if (dragOverId !== colId) setDragOverId(colId);
                    }}
                    onDragLeave={() => {
                      setDragOverId(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromId = e.dataTransfer.getData('text/plain');
                      if (fromId && fromId !== colId) {
                        moveColumn(fromId, colId);
                      }
                      setDraggingId(null);
                      setDragOverId(null);
                    }}
                    className={`text-left text-xs font-semibold text-gray-600 uppercase tracking-wider py-2 ${meta.width} ${meta.minWidth} ${sticky ? `sticky ${stickyOffset} z-[30]` : ''} ${getCellBg(meta.group)} ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'ring-2 ring-inset ring-emerald-400' : ''} ${draggable ? 'cursor-move' : ''}`}
                    style={style}
                  >
                    <div className={`flex items-center gap-1 ${getAlignClass(colId)}`}>
                      {draggable && (
                        <i className="ri-draggable text-gray-300 text-xs"></i>
                      )}
                      <span className="whitespace-nowrap">{meta.label}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="text-center py-12 text-gray-400 text-sm">
                  <i className="ri-search-line text-2xl block mb-2"></i>
                  No se encontraron resultados con los filtros aplicados
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const rowKey = `${row.article_id}-${row.location_id ?? 'noloc'}-${idx}`;
                const isDifferent = row.comparison_status === 'DIFFERENT' || row.comparison_status === 'ALL_DIFFERENT';
                const isPending = row.comparison_status === 'PENDING_RECOUNT';

                return (
                  <tr
                    key={rowKey}
                    className={`hover:bg-gray-50/60 transition-colors ${
                      isPending ? 'bg-amber-50/30' : isDifferent ? 'bg-red-50/20' : ''
                    }`}
                  >
                    {visibleColumns.map((colId) => {
                      const meta = COLUMN_META[colId];
                      if (!meta) return null;
                      const sticky = isSticky(colId);
                      const stickyOffset = getStickyOffset(colId);
                      const style = getCellStyle(meta.group);
                      const pxClass = getPxClass(colId);
                      const alignClass = getAlignClass(colId);

                      return (
                        <td
                          key={colId}
                          className={`${pxClass} py-3.5 ${meta.width} ${meta.minWidth} ${sticky ? `sticky ${stickyOffset} z-[20]` : ''} ${getCellBg(meta.group)}`}
                          style={style}
                        >
                          <div className={alignClass}>{renderCell(colId, row)}</div>
                        </td>
                      );
                    })}
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