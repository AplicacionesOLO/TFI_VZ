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
  attempt_lines: number;
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

// ─── Tipos V2 para ranking basado en tfi_count_attempts ──────────────────

export type RankingV2Type = 'normal' | 'recount' | 'global';

export interface UserRankingV2 {
  user_id: string;
  total_articulos_contados: number;
  total_ubicaciones: number;
  total_conteos: number;
  conteos_exactos: number;
  conteos_con_diferencia: number;
  diferencia_absoluta_total: number;
  precision_porcentaje: number;
}

export interface RankingV2Filters {
  session_id: string;
  take_names?: string[];
  take_type?: string;
  user_search?: string;
}

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

export interface DashboardV2Stats {
  total_conteos: number;
  total_articulos: number;
  total_ubicaciones: number;
  total_usuarios: number;
  total_tomas: number;
  conteos_exactos: number;
  conteos_con_diferencia: number;
  precision_global: number;
  diferencia_absoluta_total: number;
  tomas_normal: number;
  tomas_reconteo: number;
  articulos_con_diferencia: number;
  articulos_sin_diferencia: number;
  conteos_faltantes: number;
}

export interface DashboardV2Diff {
  article_id: string;
  article_description: string | null;
  total_conteos: number;
  exactos: number;
  con_diferencia: number;
  max_difference: number;
  ubicaciones: number;
  tomas_normal: number;
  tomas_reconteo: number;
  last_user: string | null;
  last_take_name: string | null;
  last_take_type: string | null;
  theoretical_qty: number;
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
  sync_run_id: string;
}

// ─── SINCRONIZACIÓN — TIPOS ENTERPRISE V2 ───────────────────────────────────────

export type SyncRunStatus =
  | 'queued'
  | 'running'
  | 'finishing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stale'
  | 'zombie';

export type ComputedSyncStatus =
  | 'idle'
  | 'queued'
  | 'starting'
  | 'syncing'
  | 'finishing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'stale'
  | 'timeout'
  | 'orphaned'
  | 'zombie'
  | 'partial_failure';

export interface TfiSyncRun {
  id: string;
  session_id: string;
  situation: string | null;
  status: SyncRunStatus;
  started_at: string;
  finished_at: string | null;
  total_rows: number | null;
  error_message: string | null;
  updated_at: string | null;
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

export interface TfiSyncRunBranch {
  id: string;
  sync_run_id: string;
  branch_name: string;
  status: 'running' | 'completed' | 'failed';
  rows_processed: number | null;
  completed_at: string;
}

export interface SyncStatusResult {
  // Lock info
  lock_is_running: boolean;
  lock_sync_run_id: string | null;
  lock_started_at: string | null;
  lock_finished_at: string | null;
  lock_updated_at: string | null;
  lock_error_message: string | null;
  // Sync run info
  sync_run_id: string | null;
  sync_run_status: string | null;
  sync_run_started_at: string | null;
  sync_run_finished_at: string | null;
  sync_run_total_rows: number | null;
  sync_run_error_message: string | null;
  // Branch summary
  branch_count: number;
  branches_completed: number;
  branches_failed: number;
  branches_running: number;
  // Health checks
  last_n8n_step_at: string | null;
  last_n8n_step_name: string | null;
  last_n8n_branch: string | null;
  minutes_since_start: number;
  minutes_since_last_update: number;
  minutes_since_last_n8n_step: number;
  // Computed status
  computed_status: ComputedSyncStatus;
  computed_message: string;
}

export interface SyncCleanupResult {
  cleaned_locks: number;
  cleaned_syncs: number;
  cleaned_branches: number;
  details: string[];
}

export interface ForceReleaseResult {
  released: boolean;
  previous_lock_id: string | null;
  previous_sync_run_id: string | null;
  message: string;
}

export interface CancelSyncResult {
  cancelled: boolean;
  previous_status: string | null;
  message: string;
}

// ─── ALIASES LEGACY ──────────────────────────────────────────────────────────
export type SyncStatus = 'idle' | 'starting' | 'syncing' | 'success' | 'error' | 'stale';