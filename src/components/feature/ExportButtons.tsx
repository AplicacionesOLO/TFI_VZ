import { useState } from 'react';

interface ExportButtonsProps {
  onExcelExport: () => void;
  onCsvExport: () => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function ExportButtons({
  onExcelExport,
  onCsvExport,
  disabled = false,
  loading = false,
}: ExportButtonsProps) {
  const [toast, setToast] = useState<string | null>(null);

  const handleExcel = () => {
    if (disabled) {
      setToast('No hay datos para exportar.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    onExcelExport();
  };

  const handleCsv = () => {
    if (disabled) {
      setToast('No hay datos para exportar.');
      setTimeout(() => setToast(null), 3000);
      return;
    }
    onCsvExport();
  };

  return (
    <div className="relative flex items-center gap-2">
      {/* Toast */}
      {toast && (
        <div className="absolute right-0 -top-10 bg-gray-800 text-white text-xs px-3 py-2 rounded-lg whitespace-nowrap shadow-sm z-50">
          {toast}
        </div>
      )}

      <button
        onClick={handleExcel}
        disabled={loading}
        title="Exportar Excel"
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
          disabled || loading
            ? 'border-gray-200 text-gray-300 bg-white cursor-not-allowed'
            : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
        }`}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          <i className="ri-file-excel-2-line text-sm"></i>
        </div>
        Excel
      </button>

      <button
        onClick={handleCsv}
        disabled={loading}
        title="Exportar CSV"
        className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
          disabled || loading
            ? 'border-gray-200 text-gray-300 bg-white cursor-not-allowed'
            : 'border-gray-300 text-gray-600 bg-white hover:bg-gray-50'
        }`}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          <i className="ri-file-text-line text-sm"></i>
        </div>
        CSV
      </button>
    </div>
  );
}