interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: string;
}

export default function EmptyState({
  title = 'Sin datos',
  message = 'No hay información para mostrar con los filtros actuales.',
  icon = 'ri-inbox-line',
}: EmptyStateProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
      <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-gray-50 rounded-full">
        <i className={`${icon} text-gray-400 text-2xl`}></i>
      </div>
      <h3 className="text-base font-semibold text-gray-700 mb-1">{title}</h3>
      <p className="text-sm text-gray-400 max-w-sm mx-auto">{message}</p>
    </div>
  );
}