interface LoadingStateProps {
  message?: string;
  rows?: number;
}

export default function LoadingState({ message = 'Cargando datos...', rows = 5 }: LoadingStateProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
        <div className="w-4 h-4 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
        <span className="text-sm text-gray-500">{message}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
            <div className="h-4 bg-gray-100 rounded w-24"></div>
            <div className="h-4 bg-gray-100 rounded w-16"></div>
            <div className="h-4 bg-gray-100 rounded w-32 flex-1"></div>
            <div className="h-4 bg-gray-100 rounded w-20"></div>
            <div className="h-4 bg-gray-100 rounded w-16"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingKpis() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 animate-pulse">
          <div className="flex items-start justify-between mb-4">
            <div className="w-10 h-10 bg-gray-100 rounded-lg"></div>
            <div className="h-6 w-16 bg-gray-100 rounded-full"></div>
          </div>
          <div className="h-9 w-24 bg-gray-100 rounded mb-2"></div>
          <div className="h-4 w-36 bg-gray-100 rounded"></div>
        </div>
      ))}
    </div>
  );
}