import { supabase } from '@/lib/supabase';
import type {
  TfiSession,
  TfiSessionWithCount,
  TfiComparisonLine,
  TfiUserPrecision,
  TfiGlobalPrecision,
  ComparisonFilters,
  DashboardStats,
} from '@/types/tfi.types';

// ─── Helper: trae TODOS los registros superando el límite de 1000 de Supabase ──
// Usa paginación interna con .range() en lotes de pageSize hasta agotar.
async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => ReturnType<typeof supabase.from>,
  pageSize = 1000
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    results.push(...batch);
    hasMore = batch.length === pageSize;
    from += pageSize;
  }

  return results;
}

export async function getSessions(): Promise<TfiSessionWithCount[]> {
  // Trae sesiones y el conteo real de líneas desde tfi_count_lines en paralelo
  const [sessionsRes, countsRes] = await Promise.all([
    supabase.from('tfi_sessions').select('*').order('created_at', { ascending: false }),
    supabase.from('tfi_count_lines').select('session_id'),
  ]);

  if (sessionsRes.error) throw sessionsRes.error;
  if (countsRes.error) throw countsRes.error;

  // Construir mapa session_id -> total_lines contando registros
  const lineCountMap: Record<string, number> = {};
  for (const row of (countsRes.data ?? [])) {
    const sid = (row as { session_id: string }).session_id;
    lineCountMap[sid] = (lineCountMap[sid] ?? 0) + 1;
  }

  const sessions = (sessionsRes.data ?? []) as TfiSession[];

  // Enriquecer con total_lines y ordenar: con datos primero, sin datos al final
  const enriched: TfiSessionWithCount[] = sessions.map((s) => ({
    ...s,
    total_lines: lineCountMap[s.id] ?? 0,
  }));

  enriched.sort((a, b) => {
    // Primero las que tienen datos, luego sin datos
    if (a.total_lines > 0 && b.total_lines === 0) return -1;
    if (a.total_lines === 0 && b.total_lines > 0) return 1;
    // Dentro de cada grupo, más reciente primero
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return enriched;
}

export async function getComparisonLines(
  filters: ComparisonFilters = {}
): Promise<TfiComparisonLine[]> {
  let query = supabase
    .from('v_tfi_comparison_lines')
    .select('*')
    .order('article_id', { ascending: true });

  if (filters.session_id) {
    query = query.eq('session_id', filters.session_id);
  }
  if (filters.article_id) {
    query = query.ilike('article_id', `%${filters.article_id}%`);
  }
  if (filters.user_1) {
    query = query.ilike('user_1', `%${filters.user_1}%`);
  }
  if (filters.user_2) {
    query = query.ilike('user_2', `%${filters.user_2}%`);
  }
  // pendingOnly has priority over comparison_status filter
  if (filters.pendingOnly) {
    query = query.eq('comparison_status', 'pending_recount');
  } else if (filters.comparison_status) {
    query = query.eq('comparison_status', filters.comparison_status);
  }

  const { data, error } = await query;
  if (error) throw error;

  let result = (data ?? []) as TfiComparisonLine[];

  // Filter lines where either user has a difference
  const useOnlyDiffs = filters.onlyDifferences ?? filters.onlyDiffs ?? false;
  if (useOnlyDiffs) {
    result = result.filter(
      (l) => (l.difference_user_1 ?? 0) !== 0 || (l.difference_user_2 ?? 0) !== 0
    );
  }

  return result;
}

export async function getUserPrecision(
  sessionId?: string
): Promise<TfiUserPrecision[]> {
  let query = supabase
    .from('v_tfi_user_precision')
    .select('*')
    .order('precision_percentage', { ascending: false });

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TfiUserPrecision[];
}

export async function getGlobalPrecision(
  sessionId?: string
): Promise<TfiGlobalPrecision | null> {
  let query = supabase
    .from('v_tfi_global_precision')
    .select('*');

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return null;
  return data[0] as TfiGlobalPrecision;
}

export async function getPendingRecount(
  sessionId?: string
): Promise<TfiComparisonLine[]> {
  let query = supabase
    .from('v_tfi_comparison_lines')
    .select('*')
    .eq('comparison_status', 'pending_recount')
    .order('article_id', { ascending: true });

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TfiComparisonLine[];
}

export async function getDashboardStats(
  sessionId?: string
): Promise<DashboardStats> {
  const [global, lines] = await Promise.all([
    getGlobalPrecision(sessionId),
    getComparisonLines(sessionId ? { session_id: sessionId } : {}),
  ]);

  const pendingRecount = lines.filter((l) => l.comparison_status === 'pending_recount').length;
  const pendingT2 = lines.filter((l) => l.comparison_status === 'pending_t2').length;
  const pendingT1 = lines.filter((l) => l.comparison_status === 'pending_t1').length;
  const matches = lines.filter((l) => l.comparison_status === 'match').length;
  const okUser1 = lines.filter((l) => l.comparison_status === 'ok_user1').length;
  const okUser2 = lines.filter((l) => l.comparison_status === 'ok_user2').length;
  const bothDifferent = lines.filter((l) => l.comparison_status === 'both_different').length;

  const recentDiffs = lines
    .filter((l) =>
      l.comparison_status === 'pending_recount' ||
      l.comparison_status === 'both_different' ||
      (l.final_difference_vs_theoretical !== null && l.final_difference_vs_theoretical !== 0)
    )
    .slice(0, 10);

  return {
    totalCounts: global?.total_user_counts ?? 0,
    totalDiffs: global?.total_differences ?? 0,
    weightedPrecision: global?.weighted_global_precision ?? 0,
    avgPrecision: global?.average_global_precision ?? 0,
    pendingRecount,
    matches,
    okUser1,
    okUser2,
    pendingT2,
    pendingT1,
    bothDifferent,
    totalLines: lines.length,
    recentDiffs,
  };
}

// ─── Funciones dedicadas para exportación (sin límite de paginación) ─────────────────
// Estas funciones traen TODOS los registros que cumplen los filtros,
// usando paginación interna para superar el límite de 1000 rows de Supabase.
// Son independientes de la paginación visual de la UI.

export async function getAllComparisonLinesForExport(
  filters: ComparisonFilters = {}
): Promise<TfiComparisonLine[]> {
  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('v_tfi_comparison_lines')
      .select('*')
      .order('article_id', { ascending: true })
      .range(from, to);

    if (filters.session_id) q = q.eq('session_id', filters.session_id);
    if (filters.article_id) q = q.ilike('article_id', `%${filters.article_id}%`);
    if (filters.user_1) q = q.ilike('user_1', `%${filters.user_1}%`);
    if (filters.user_2) q = q.ilike('user_2', `%${filters.user_2}%`);

    if (filters.pendingOnly) {
      q = q.eq('comparison_status', 'pending_recount');
    } else if (filters.comparison_status) {
      q = q.eq('comparison_status', filters.comparison_status);
    }

    return q;
  };

  let result = await fetchAllPages<TfiComparisonLine>(buildQuery);

  // onlyDiffs: filtro que no se puede hacer en SQL directamente
  const useOnlyDiffs = filters.onlyDifferences ?? filters.onlyDiffs ?? false;
  if (useOnlyDiffs) {
    result = result.filter(
      (l) => (l.difference_user_1 ?? 0) !== 0 || (l.difference_user_2 ?? 0) !== 0
    );
  }

  return result;
}

export async function getAllPendingRecountForExport(
  sessionId?: string
): Promise<TfiComparisonLine[]> {
  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('v_tfi_comparison_lines')
      .select('*')
      .eq('comparison_status', 'pending_recount')
      .order('article_id', { ascending: true })
      .range(from, to);

    if (sessionId) q = q.eq('session_id', sessionId);
    return q;
  };

  return fetchAllPages<TfiComparisonLine>(buildQuery);
}

export async function getAllUserPrecisionForExport(
  sessionId?: string
): Promise<TfiUserPrecision[]> {
  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('v_tfi_user_precision')
      .select('*')
      .order('precision_percentage', { ascending: false })
      .range(from, to);

    if (sessionId) q = q.eq('session_id', sessionId);
    return q;
  };

  return fetchAllPages<TfiUserPrecision>(buildQuery);
}

export async function getAllLinesForDashboardExport(
  sessionId?: string
): Promise<TfiComparisonLine[]> {
  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('v_tfi_comparison_lines')
      .select('*')
      .order('article_id', { ascending: true })
      .range(from, to);

    if (sessionId) q = q.eq('session_id', sessionId);
    return q;
  };

  return fetchAllPages<TfiComparisonLine>(buildQuery);
}

export async function getDistinctUsers(
  sessionId?: string
): Promise<{ users1: string[]; users2: string[] }> {
  let query = supabase
    .from('v_tfi_comparison_lines')
    .select('user_1, user_2');

  if (sessionId) {
    query = query.eq('session_id', sessionId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const users1 = [
    ...new Set(
      (data ?? [])
        .map((r: { user_1: string | null }) => r.user_1)
        .filter((u): u is string => Boolean(u))
    ),
  ].sort();

  const users2 = [
    ...new Set(
      (data ?? [])
        .map((r: { user_2: string | null }) => r.user_2)
        .filter((u): u is string => Boolean(u))
    ),
  ].sort();

  return { users1, users2 };
}