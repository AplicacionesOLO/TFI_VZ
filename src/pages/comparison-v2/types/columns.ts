import type { ComparisonV2Line } from '@/types/comparison-v2.types';

export type ColumnGroup =
  | 'general'
  | 'takeA'
  | 'takeB'
  | 'recount'
  | 'result';

export interface ColumnMeta {
  id: string;
  label: string;
  group: ColumnGroup;
  width: string;
  minWidth: string;
  sticky?: boolean;
  stickyOffset?: string;
  optional?: boolean;
  align?: 'left' | 'right' | 'center';
  showInSingleTake: boolean;
  showInCompare: boolean;
}

export const GROUP_COLORS: Record<ColumnGroup, string> = {
  general: '',
  takeA: 'rgba(34,197,94,0.06)',
  takeB: 'rgba(59,130,246,0.06)',
  recount: 'rgba(245,158,11,0.06)',
  result: 'rgba(139,92,246,0.06)',
};

export const GROUP_LABELS: Record<ColumnGroup, string> = {
  general: 'General',
  takeA: 'Toma A',
  takeB: 'Toma B',
  recount: 'Reconteo',
  result: 'Resultado',
};

export const GROUP_CLASS: Record<ColumnGroup, string> = {
  general: 'bg-white',
  takeA: 'bg-green-50/50',
  takeB: 'bg-blue-50/50',
  recount: 'bg-amber-50/50',
  result: 'bg-violet-50/50',
};

export const DEFAULT_COMPARE_ORDER: string[] = [
  'article_id',
  'location_id',
  'location_b_id',
  'theoretical_qty',
  'take_a_qty',
  'take_a_user',
  'difference_a',
  'situation_a',
  'form_status_a',
  'take_b_qty',
  'take_b_user',
  'difference_b',
  'situation_b',
  'form_status_b',
  'recount_qty',
  'recount_user',
  'situation_recount',
  'form_status_recount',
  'final_difference',
  'comparison_status',
  'registered_at',
];

export const DEFAULT_SINGLE_TAKE_ORDER: string[] = [
  'article_id',
  'location_id',
  'theoretical_qty',
  'take_a_qty',
  'take_a_user',
  'difference_a',
  'situation_a',
  'form_status_a',
  'final_difference',
  'comparison_status',
  'registered_at',
];

export const DEFAULT_HIDDEN_COLUMNS: string[] = [];

export const COLUMN_META: Record<string, ColumnMeta> = {
  article_id: {
    id: 'article_id',
    label: 'Artículo',
    group: 'general',
    width: 'w-[180px]',
    minWidth: 'min-w-[180px]',
    sticky: true,
    stickyOffset: 'left-0',
    align: 'left',
    showInSingleTake: true,
    showInCompare: true,
  },
  location_id: {
    id: 'location_id',
    label: 'Ubicación A',
    group: 'general',
    width: 'w-[120px]',
    minWidth: 'min-w-[120px]',
    sticky: true,
    stickyOffset: 'left-[180px]',
    align: 'left',
    showInSingleTake: true,
    showInCompare: true,
  },
  location_b_id: {
    id: 'location_b_id',
    label: 'Ubicación B',
    group: 'general',
    width: 'w-[120px]',
    minWidth: 'min-w-[120px]',
    optional: true,
    align: 'left',
    showInSingleTake: false,
    showInCompare: true,
  },
  theoretical_qty: {
    id: 'theoretical_qty',
    label: 'Teórico',
    group: 'general',
    width: 'w-[90px]',
    minWidth: 'min-w-[90px]',
    align: 'right',
    showInSingleTake: true,
    showInCompare: true,
  },
  take_a_qty: {
    id: 'take_a_qty',
    label: 'Cteo Toma A',
    group: 'takeA',
    width: 'w-[110px]',
    minWidth: 'min-w-[110px]',
    align: 'right',
    showInSingleTake: true,
    showInCompare: true,
  },
  take_a_user: {
    id: 'take_a_user',
    label: 'Usuario A',
    group: 'takeA',
    width: 'w-[110px]',
    minWidth: 'min-w-[110px]',
    align: 'left',
    showInSingleTake: true,
    showInCompare: true,
  },
  difference_a: {
    id: 'difference_a',
    label: 'Dif. vs Teórico A',
    group: 'takeA',
    width: 'w-[130px]',
    minWidth: 'min-w-[130px]',
    align: 'right',
    showInSingleTake: true,
    showInCompare: true,
  },
  situation_a: {
    id: 'situation_a',
    label: 'Situación A',
    group: 'takeA',
    width: 'w-[120px]',
    minWidth: 'min-w-[120px]',
    align: 'left',
    showInSingleTake: true,
    showInCompare: true,
  },
  form_status_a: {
    id: 'form_status_a',
    label: 'Estado Formulario A',
    group: 'takeA',
    width: 'w-[140px]',
    minWidth: 'min-w-[140px]',
    align: 'left',
    showInSingleTake: true,
    showInCompare: true,
  },
  take_b_qty: {
    id: 'take_b_qty',
    label: 'Cteo Toma B',
    group: 'takeB',
    width: 'w-[110px]',
    minWidth: 'min-w-[110px]',
    align: 'right',
    showInSingleTake: false,
    showInCompare: true,
  },
  take_b_user: {
    id: 'take_b_user',
    label: 'Usuario B',
    group: 'takeB',
    width: 'w-[110px]',
    minWidth: 'min-w-[110px]',
    align: 'left',
    showInSingleTake: false,
    showInCompare: true,
  },
  difference_b: {
    id: 'difference_b',
    label: 'Dif. vs Teórico B',
    group: 'takeB',
    width: 'w-[130px]',
    minWidth: 'min-w-[130px]',
    align: 'right',
    showInSingleTake: false,
    showInCompare: true,
  },
  situation_b: {
    id: 'situation_b',
    label: 'Situación B',
    group: 'takeB',
    width: 'w-[120px]',
    minWidth: 'min-w-[120px]',
    optional: true,
    align: 'left',
    showInSingleTake: false,
    showInCompare: true,
  },
  form_status_b: {
    id: 'form_status_b',
    label: 'Estado Formulario B',
    group: 'takeB',
    width: 'w-[140px]',
    minWidth: 'min-w-[140px]',
    optional: true,
    align: 'left',
    showInSingleTake: false,
    showInCompare: true,
  },
  recount_qty: {
    id: 'recount_qty',
    label: 'Reconteo',
    group: 'recount',
    width: 'w-[90px]',
    minWidth: 'min-w-[90px]',
    align: 'right',
    showInSingleTake: false,
    showInCompare: true,
  },
  recount_user: {
    id: 'recount_user',
    label: 'Usuario Rec.',
    group: 'recount',
    width: 'w-[110px]',
    minWidth: 'min-w-[110px]',
    align: 'left',
    showInSingleTake: false,
    showInCompare: true,
  },
  situation_recount: {
    id: 'situation_recount',
    label: 'Situación Reconteo',
    group: 'recount',
    width: 'w-[140px]',
    minWidth: 'min-w-[140px]',
    optional: true,
    align: 'left',
    showInSingleTake: false,
    showInCompare: true,
  },
  form_status_recount: {
    id: 'form_status_recount',
    label: 'Estado Formulario Rec.',
    group: 'recount',
    width: 'w-[150px]',
    minWidth: 'min-w-[150px]',
    optional: true,
    align: 'left',
    showInSingleTake: false,
    showInCompare: true,
  },
  final_difference: {
    id: 'final_difference',
    label: 'Dif. Final',
    group: 'result',
    width: 'w-[100px]',
    minWidth: 'min-w-[100px]',
    align: 'right',
    showInSingleTake: true,
    showInCompare: true,
  },
  comparison_status: {
    id: 'comparison_status',
    label: 'Estado Final',
    group: 'result',
    width: 'w-[120px]',
    minWidth: 'min-w-[120px]',
    align: 'center',
    showInSingleTake: true,
    showInCompare: true,
  },
  registered_at: {
    id: 'registered_at',
    label: 'Registrado',
    group: 'result',
    width: 'w-[110px]',
    minWidth: 'min-w-[110px]',
    align: 'left',
    showInSingleTake: true,
    showInCompare: true,
  },
};

export interface ColumnLayout {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
}

export const LS_KEY = 'comparison_v2_visible_columns';

export function getDefaultLayout(mode: 'compare' | 'single_take'): ColumnLayout {
  const order = mode === 'single_take' ? DEFAULT_SINGLE_TAKE_ORDER : DEFAULT_COMPARE_ORDER;
  return {
    order,
    hidden: mode === 'single_take' ? [] : [...DEFAULT_HIDDEN_COLUMNS],
    widths: {},
  };
}

// ─── Export helpers ───────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  MATCH: 'MATCH',
  DIFFERENT: 'DIFFERENT',
  PENDING_RECOUNT: 'PEND. RECONTEO',
  RECOUNT_MATCH_A: 'REC. MATCH A',
  RECOUNT_MATCH_B: 'REC. MATCH B',
  ALL_DIFFERENT: 'TODOS DIFF.',
  PENDING_TAKE_A: 'PEND. TOMA A',
  PENDING_TAKE_B: 'PEND. TOMA B',
  NO_DATA: 'SIN DATOS',
  SINGLE_TAKE: 'SOLO TOMA A',
};

export function getExportHeader(colId: string): string {
  const meta = COLUMN_META[colId];
  return meta?.label ?? colId;
}

export function getExportValue(colId: string, row: ComparisonV2Line): string | number {
  switch (colId) {
    case 'article_id':
      return row.article_id;
    case 'location_id':
      return row.location_id ?? '-';
    case 'location_b_id':
      return row.location_b_id ?? '-';
    case 'theoretical_qty':
      return row.theoretical_qty;
    case 'take_a_qty':
      return row.take_a_qty ?? '-';
    case 'take_a_user':
      return row.take_a_user ?? '-';
    case 'difference_a': {
      const diff = row.take_a_qty != null ? row.take_a_qty - row.theoretical_qty : null;
      return diff != null ? diff : '-';
    }
    case 'situation_a':
      return row.situation ?? '-';
    case 'form_status_a':
      return row.form_status ?? '-';
    case 'take_b_qty':
      return row.take_b_qty ?? '-';
    case 'take_b_user':
      return row.take_b_user ?? '-';
    case 'difference_b': {
      const diff = row.take_b_qty != null ? row.take_b_qty - row.theoretical_qty : null;
      return diff != null ? diff : '-';
    }
    case 'situation_b':
      return row.situation_b ?? '-';
    case 'form_status_b':
      return row.form_status_b ?? '-';
    case 'recount_qty':
      return row.recount_qty ?? '-';
    case 'recount_user':
      return row.recount_user ?? '-';
    case 'situation_recount':
      return row.situation_recount ?? '-';
    case 'form_status_recount':
      return row.form_status_recount ?? '-';
    case 'final_difference':
      return row.final_difference;
    case 'comparison_status':
      return STATUS_LABELS[row.comparison_status] ?? row.comparison_status;
    case 'registered_at':
      return row.registered_at ? new Date(row.registered_at).toLocaleDateString('es-AR') : '-';
    default:
      return '-';
  }
}

export function getExportRows(
  lines: ComparisonV2Line[],
  visibleColumns: string[],
): (string | number)[][] {
  const headers = visibleColumns.map((id) => getExportHeader(id));
  const rows = lines.map((line) => visibleColumns.map((id) => getExportValue(id, line)));
  return [headers, ...rows];
}