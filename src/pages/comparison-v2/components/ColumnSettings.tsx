import { COLUMN_META, GROUP_LABELS, type ColumnGroup } from '@/pages/comparison-v2/types/columns';

interface ColumnSettingsProps {
  hidden: string[];
  onToggle: (id: string) => void;
  onReset: () => void;
  onClose: () => void;
  mode: 'compare' | 'single_take';
}

export default function ColumnSettings({
  hidden,
  onToggle,
  onReset,
  onClose,
  mode,
}: ColumnSettingsProps) {
  const allColumns = Object.values(COLUMN_META).filter((meta) => {
    if (meta.sticky) return false;
    return mode === 'single_take' ? meta.showInSingleTake : meta.showInCompare;
  });

  const groups: ColumnGroup[] = ['general', 'takeA', 'takeB', 'recount', 'result'];

  const groupColorDot: Record<ColumnGroup, string> = {
    general: 'bg-gray-300',
    takeA: 'bg-green-400',
    takeB: 'bg-blue-400',
    recount: 'bg-amber-400',
    result: 'bg-violet-400',
  };

  return (
    <div className="absolute right-0 top-full mt-2 z-50 w-72 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-800">Configurar columnas</h3>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <i className="ri-close-line text-sm"></i>
        </button>
      </div>

      <div className="max-h-[360px] overflow-y-auto p-3 space-y-3">
        {groups.map((group) => {
          const groupCols = allColumns.filter((c) => c.group === group);
          if (groupCols.length === 0) return null;
          return (
            <div key={group}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2 h-2 rounded-full ${groupColorDot[group]}`}></span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {GROUP_LABELS[group]}
                </span>
              </div>
              <div className="space-y-1">
                {groupCols.map((col) => {
                  const isHidden = hidden.includes(col.id);
                  return (
                    <label
                      key={col.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => onToggle(col.id)}
                        className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <span className="text-gray-700">{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50">
        <button
          onClick={() => {
            onReset();
            onClose();
          }}
          className="w-full flex items-center justify-center gap-2 text-sm text-gray-600 hover:text-gray-900 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
        >
          <i className="ri-refresh-line"></i>
          Restaurar columnas por defecto
        </button>
      </div>
    </div>
  );
}