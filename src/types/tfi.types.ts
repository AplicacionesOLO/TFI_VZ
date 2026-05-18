export type ComparisonStatus =
  | 'match'
  | 'ok_user1'
  | 'ok_user2'
  | 'pending_recount'
  | 'pending_t2'
  | 'pending_t1'
  | 'both_different';

export type SessionStatus = 'active' | 'closed' | 'cancelled' | 'draft';

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