interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = 'Error al cargar los datos. Verificá la conexión con Supabase.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="bg-white rounded-xl border border-red-100 p-10 text-center">
      <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-red-50 rounded-full">
        <i className="ri-error-warning-line text-red-500 text-2xl"></i>
      </div>
      <h3 className="text-base font-semibold text-gray-800 mb-1">No se pudieron cargar los datos</h3>
      <p className="text-sm text-gray-500 max-w-sm mx-auto mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          <i className="ri-refresh-line"></i>
          Reintentar
        </button>
      )}
    </div>
  );
}