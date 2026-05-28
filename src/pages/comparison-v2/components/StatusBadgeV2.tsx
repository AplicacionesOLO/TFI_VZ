import type { ComparisonV2Status } from '@/types/comparison-v2.types';

interface StatusBadgeV2Props {
  status: ComparisonV2Status | string;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  MATCH: {
    label: 'MATCH',
    className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  DIFFERENT: {
    label: 'DIFFERENT',
    className: 'bg-red-50 text-red-700 border border-red-200',
  },
  PENDING_RECOUNT: {
    label: 'PEND. RECONTEO',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  RECOUNT_MATCH_A: {
    label: 'REC. MATCH A',
    className: 'bg-sky-50 text-sky-700 border border-sky-200',
  },
  RECOUNT_MATCH_B: {
    label: 'REC. MATCH B',
    className: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  },
  ALL_DIFFERENT: {
    label: 'TODOS DIFF.',
    className: 'bg-red-50 text-red-700 border border-red-200',
  },
  PENDING_TAKE_A: {
    label: 'PEND. TOMA A',
    className: 'bg-orange-50 text-orange-600 border border-orange-200',
  },
  PENDING_TAKE_B: {
    label: 'PEND. TOMA B',
    className: 'bg-gray-50 text-gray-600 border border-gray-200',
  },
  NO_DATA: {
    label: 'SIN DATOS',
    className: 'bg-gray-50 text-gray-400 border border-gray-200',
  },
};

export default function StatusBadgeV2({ status }: StatusBadgeV2Props) {
  const key = (status ?? '').toUpperCase();
  const config = statusConfig[key] ?? {
    label: status ?? '—',
    className: 'bg-gray-50 text-gray-500 border border-gray-200',
  };
  return (
    <span
      className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${config.className}`}
    >
      {config.label}
    </span>
  );
}