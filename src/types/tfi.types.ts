export type TfiSituation = string;

export type ComparisonStatus =
  | 'match'
  | 'ok_user1'
  | 'ok_user2'
  | 'pending_recount'
  | 'pending_t2'
  | 'pending_t1'
  | 'both_different';

// La base de datos usa 'open' y 'reviewing' como estados de sesión activa
export type SessionStatus = 'active' | 'open' | 'reviewing' | 'closed' | 'cancelled' | 'draft';

export interface TfiSession {
  id: string;
  name: string;
  status: SessionStatus;
  location: string | null;
  created_at: string;
  updated_at: string;
}

// TfiSession enriquecida con conteo de líneas reales de tfi_count_lines
export interface TfiSessionWithCount extends TfiSession {
  total_lines: number;
}

export interface TfiComparisonLine {
  id: number;
  session_id: string;
  article_id: string;
  article_description: string | null;
  theoretical_qty: number;
  take_1_name: string | null;
  count_1_qty: number | null;
  difference_1_wms: number | null;
  user_1: string | null;
  take_2_name: string | null;
  count_2_qty: number | null;
  difference_2_wms: number | null;
  user_2: string | null;
  recount_qty: number | null;
  recount_user: string | null;
  difference_user_1: number;
  difference_user_2: number;
  comparison_status: ComparisonStatus;
  final_count_qty: number | null;
  final_difference_vs_theoretical: number | null;
  situation_1: string | null;
  situation_2: string | null;
  situation_recount: string | null;
  estado_formulario_1: string | null;
  estado_formulario_2: string | null;
  estado_formulario_recount: string | null;
}

// Alias for backward compatibility across pages
export type ComparisonLine = TfiComparisonLine;

export interface TfiUserPrecision {
  session_id: string;
  user_name: string;
  total_articles: number;
  differences: number;
  precision_percentage: number;
}

// Alias for backward compatibility
export type UserPrecision = TfiUserPrecision;

// ─── Nuevos tipos para ranking separado ─────────────────────────────────────

export type RankingType = 'counts' | 'recounts' | 'global';

export interface UserRankingCounts {
  user_name: string;
  display_name: string;
  total_conteo_1: number;
  errores_conteo_1: number;
  total_conteo_2: number;
  errores_conteo_2: number;
  total_articulos: number;
  total_errores: number;
  precision: number;
  hasEnoughData: boolean;
}

export interface UserRankingRecounts {
  user_name: string;
  display_name: string;
  total_reconteos: number;
  errores_reconteo: number;
  precision: number;
  hasEnoughData: boolean;
}

export interface UserRankingGlobal {
  user_name: string;
  display_name: string;
  total_conteos: number;
  errores_conteos: number;
  total_reconteos: number;
  errores_reconteo: number;
  precision_conteos: number;
  precision_reconteo: number;
  precision_global: number;
  hasEnoughData: boolean;
}

export interface RankingsBundle {
  counts: UserRankingCounts[];
  recounts: UserRankingRecounts[];
  global: UserRankingGlobal[];
}

// ─── Fin nuevos tipos ───────────────────────────────────────────────────────

export interface TfiGlobalPrecision {
  session_id: string;
  total_user_counts: number;
  total_differences: number;
  weighted_global_precision: number;
  average_global_precision: number;
}

// Alias for backward compatibility
export type GlobalPrecision = TfiGlobalPrecision;

export interface ComparisonFilters {
  session_id?: string;
  article_id?: string;
  user_1?: string;
  user_2?: string;
  comparison_status?: string;
  onlyDifferences?: boolean;
  onlyDiffs?: boolean;
  pendingOnly?: boolean;
  situation?: string;
}

export interface DashboardStats {
  totalCounts: number;
  totalDiffs: number;
  weightedPrecision: number;
  avgPrecision: number;
  pendingRecount: number;
  matches: number;
  okUser1: number;
  okUser2: number;
  pendingT2: number;
  pendingT1: number;
  bothDifferent: number;
  totalLines: number;
  recentDiffs: TfiComparisonLine[];
}

export interface N8nRefreshPayload {
  session_id: string;
  session_name: string;
  location: string | null;
  situation: string;
  triggered_from: string;
  timestamp: string;
  warehouse?: string;
  warehouse_id?: string;
}

export interface TfiSyncRun {
  id: number;
  session_id: string;
  situation: string | null;
  status: 'running' | 'completed' | 'failed' | string;
  started_at: string;
  finished_at: string | null;
  total_rows: number | null;
  error_message: string | null;
}

export interface TfiSyncLock {
  session_id: string;
  is_running: boolean;
  sync_run_id: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  locked_by: string | null;
  error_message: string | null;
}