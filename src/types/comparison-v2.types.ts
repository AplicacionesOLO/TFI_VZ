// ─── Comparison V2 Types ────────────────────────────────────────────────────
// Nueva arquitectura dinámica basada en tfi_count_attempts (tabla normalizada)
// Reemplaza el modelo pivotado de tfi_count_lines (count_1_qty, count_2_qty, etc.)

export type ComparisonV2Status =
  | 'MATCH'
  | 'DIFFERENT'
  | 'PENDING_RECOUNT'
  | 'RECOUNT_MATCH_A'
  | 'RECOUNT_MATCH_B'
  | 'ALL_DIFFERENT'
  | 'PENDING_TAKE_A'
  | 'PENDING_TAKE_B'
  | 'NO_DATA';

// ─── Una toma disponible para seleccionar ──────────────────────────────────
export interface AvailableTake {
  take_name: string;
  take_type: string;
  take_order: number;
  article_count: number;
  min_date: string | null;
  max_date: string | null;
}

// ─── Una línea de comparación dinámica ─────────────────────────────────────
export interface ComparisonV2Line {
  article_id: string;
  article_description: string | null;
  location_id: string | null;
  location_b_id: string | null;
  theoretical_qty: number;
  take_a_name: string;
  take_a_qty: number | null;
  take_a_user: string | null;
  take_b_name: string;
  take_b_qty: number | null;
  take_b_user: string | null;
  recount_qty: number | null;
  recount_user: string | null;
  recount_name: string | null;
  comparison_status: ComparisonV2Status;
  final_difference: number;
  total_count: number;
}

// ─── Filtros para la tabla de comparación ──────────────────────────────────
export interface ComparisonV2Filters {
  session_id: string;
  take_a_name: string;
  take_b_name: string;
  article_search?: string;
  status_filter?: string;
  page?: number;
  page_size?: number;
  date_from?: string;
  date_to?: string;
}

// ─── Resumen de estados para los pills ─────────────────────────────────────
export interface ComparisonV2Summary {
  total: number;
  matches: number;
  pending_recount: number;
  recount_match_a: number;
  recount_match_b: number;
  all_different: number;
  different: number;
}