import type { ComparisonStatus } from '@/types/tfi.types';

interface StatusBadgeProps {
  status: ComparisonStatus | string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  match: {
    label: 'MATCH',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  pending_recount: {
    label: 'PEND. RECONTEO',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  ok_user1: {
    label: 'TOMA 1 OK',
    className: 'bg-sky-50 text-sky-700 border border-sky-200',
  },
  ok_user2: {
    label: 'TOMA 2 OK',
    className: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  },
  pending_t2: {
    label: 'PEND. TOMA 2',
    className: 'bg-gray-50 text-gray-600 border border-gray-200',
  },
  pending_t1: {
    label: 'PEND. TOMA 1',
    className: 'bg-orange-50 text-orange-600 border border-orange-200',
  },
  both_different: {
    label: 'AMBAS DIFF.',
    className: 'bg-red-50 text-red-700 border border-red-200',
  },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const key = (status ?? '').toLowerCase();
  const config = statusConfig[key] ?? {
    label: status ?? '—',
    className: 'bg-gray-50 text-gray-500 border border-gray-200',
  };
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${config.className}`}>
      {config.label}
    </span>
  );
}