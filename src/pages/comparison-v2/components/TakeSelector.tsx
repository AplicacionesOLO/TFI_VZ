import SearchableDropdown from '@/components/base/SearchableDropdown';
import type { AvailableTake } from '@/types/comparison-v2.types';

interface TakeSelectorProps {
  takes: AvailableTake[];
  takeA: string;
  takeB: string;
  onTakeAChange: (name: string) => void;
  onTakeBChange: (name: string) => void;
  loading: boolean;
}

export default function TakeSelector({
  takes,
  takeA,
  takeB,
  onTakeAChange,
  onTakeBChange,
  loading,
}: TakeSelectorProps) {
  const options = takes.map((t) => {
    const dateRange = t.min_date && t.max_date
      ? t.min_date === t.max_date
        ? t.min_date
        : `${t.min_date} al ${t.max_date}`
      : '';
    return {
      value: t.take_name,
      label: t.take_name,
      subtitle: `${t.article_count.toLocaleString('es-AR')} artículos${dateRange ? ` · ${dateRange}` : ''}`,
    };
  });

  // Opciones para Toma B incluyen "Sin toma B"
  const bOptions = [
    { value: '', label: 'Sin toma B / Solo Toma A', subtitle: 'Ver solo registros de Toma A' },
    ...options,
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex flex-wrap items-end gap-4">
        <SearchableDropdown
          options={options}
          value={takeA}
          onChange={onTakeAChange}
          label="Toma A"
          icon="ri-checkbox-circle-line text-emerald-500"
          placeholder="Buscar toma..."
          loading={loading}
          disabled={takes.length === 0}
          accentColor="emerald"
          emptyMessage="No se encontraron tomas"
        />

        <SearchableDropdown
          options={bOptions}
          value={takeB}
          onChange={onTakeBChange}
          label="Toma B"
          icon="ri-checkbox-circle-line text-indigo-500"
          placeholder="Buscar toma..."
          loading={loading}
          disabled={takes.length === 0}
          accentColor="indigo"
          emptyMessage="No se encontraron tomas"
        />

        {takeA && takeB && (
          <div className="flex items-center gap-2 pb-0.5">
            <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1.5 rounded-lg">
              <i className="ri-arrow-left-right-line mr-1"></i>
              Comparando
            </span>
          </div>
        )}
        {takeA && !takeB && (
          <div className="flex items-center gap-2 pb-0.5">
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200">
              <i className="ri-eye-line mr-1"></i>
              Solo Toma A
            </span>
          </div>
        )}
      </div>
    </div>
  );
}