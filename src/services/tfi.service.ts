import { supabase } from '@/lib/supabase';
import type {
  TfiSession,
  TfiSessionWithCount,
  TfiComparisonLine,
  TfiUserPrecision,
  TfiGlobalPrecision,
  ComparisonFilters,
  DashboardStats,
  TfiSyncRun,
  TfiSyncLock,
  RankingsBundle,
  UserRankingCounts,
  UserRankingRecounts,
  UserRankingGlobal,
} from '@/types/tfi.types';

// Columnas explícitas de v_tfi_comparison_lines para evitar ambigüedad con select('*')
const V_TFI_COMPARISON_LINES_COLUMNS =
  'id,session_id,article_id,article_description,theoretical_qty,take_1_name,count_1_qty,difference_1_wms,user_1,take_2_name,count_2_qty,difference_2_wms,user_2,recount_qty,recount_user,difference_user_1,difference_user_2,comparison_status,final_count_qty,final_difference_vs_theoretical,situation_1,situation_2,situation_recount,estado_formulario_1,estado_formulario_2,estado_formulario_recount';

// Columnas mínimas para cálculo de ranking (performance)
const RANKING_COLUMNS =
  'id,session_id,user_1,take_1_name,difference_1_wms,user_2,take_2_name,difference_2_wms,recount_user,recount_qty,theoretical_qty';

// ─── Helper: filtra líneas por situación ──────────────────────────────────────
function filterBySituation(
  lines: TfiComparisonLine[],
  situation: string | undefined
): TfiComparisonLine[] {
  if (!situation || situation === 'TODOS') return lines;
  const target = situation.toUpperCase();
  return lines.filter(
    (l) =>
      (l.situation_1 ?? '').toUpperCase() === target ||
      (l.situation_2 ?? '').toUpperCase() === target ||
      (l.situation_recount ?? '').toUpperCase() === target
  );
}

// ─── Helper: trae TODOS los registros superando el límite de 1000 de Supabase ──
// Usa paginación interna con .range() en lotes de pageSize hasta agotar.
async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => any,
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
  const sessionsRes = await supabase
    .from('tfi_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (sessionsRes.error) throw sessionsRes.error;

  // Contar líneas con paginación robusta (supera límite de 1000)
  const allCounts = await fetchAllPages<{ session_id: string }>(
    (from, to) => supabase.from('tfi_count_lines').select('session_id').range(from, to)
  );

  // Construir mapa session_id -> total_lines contando registros
  const lineCountMap: Record<string, number> = {};
  for (const row of allCounts) {
    const sid = row.session_id;
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
    .select(V_TFI_COMPARISON_LINES_COLUMNS)
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

  // Filtro por situación (post-query porque puede matchear en 3 columnas distintas)
  result = filterBySituation(result, filters.situation);

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
    .select(V_TFI_COMPARISON_LINES_COLUMNS)
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
  // Usa getAllLinesForDashboardExport para traer TODAS las líneas (sin límite de 1000)
  // y obtener conteos exactos de estados en el dashboard.
  const [global, lines] = await Promise.all([
    getGlobalPrecision(sessionId),
    getAllLinesForDashboardExport(sessionId),
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
      .select(V_TFI_COMPARISON_LINES_COLUMNS)
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

  // Filtro por situación en export
  result = filterBySituation(result, filters.situation);

  return result;
}

export async function getAllPendingRecountForExport(
  sessionId?: string
): Promise<TfiComparisonLine[]> {
  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('v_tfi_comparison_lines')
      .select(V_TFI_COMPARISON_LINES_COLUMNS)
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
      .select(V_TFI_COMPARISON_LINES_COLUMNS)
      .order('article_id', { ascending: true })
      .range(from, to);

    if (sessionId) q = q.eq('session_id', sessionId);
    return q;
  };

  return fetchAllPages<TfiComparisonLine>(buildQuery);
}

export async function getAllLinesForRanking(sessionId?: string): Promise<TfiComparisonLine[]> {
  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('v_tfi_comparison_lines')
      .select(RANKING_COLUMNS)
      .order('article_id', { ascending: true })
      .range(from, to);

    if (sessionId) q = q.eq('session_id', sessionId);
    return q;
  };

  return fetchAllPages<TfiComparisonLine>(buildQuery);
}

function sortRankingByPrecisionAndVolume<T extends { precision: number; hasEnoughData: boolean }>(
  list: T[]
): T[] {
  return list.sort((a, b) => {
    if (a.hasEnoughData && !b.hasEnoughData) return -1;
    if (!a.hasEnoughData && b.hasEnoughData) return 1;
    return b.precision - a.precision;
  });
}

export function calculateRankings(lines: TfiComparisonLine[]): RankingsBundle {
  const countsMap = new Map<
    string,
    { total1: number; errors1: number; total2: number; errors2: number; name1: string | null; name2: string | null }
  >();
  const recountsMap = new Map<string, { total: number; errors: number }>();

  for (const line of lines) {
    // Conteo 1
    if (line.user_1) {
      const cur = countsMap.get(line.user_1) ?? { total1: 0, errors1: 0, total2: 0, errors2: 0, name1: null, name2: null };
      cur.total1++;
      if (line.difference_1_wms !== null && line.difference_1_wms !== 0) {
        cur.errors1++;
      }
      if (!cur.name1 && line.take_1_name) {
        cur.name1 = line.take_1_name;
      }
      countsMap.set(line.user_1, cur);
    }

    // Conteo 2
    if (line.user_2) {
      const cur = countsMap.get(line.user_2) ?? { total1: 0, errors1: 0, total2: 0, errors2: 0, name1: null, name2: null };
      cur.total2++;
      if (line.difference_2_wms !== null && line.difference_2_wms !== 0) {
        cur.errors2++;
      }
      if (!cur.name2 && line.take_2_name) {
        cur.name2 = line.take_2_name;
      }
      countsMap.set(line.user_2, cur);
    }

    // Reconteo (solo si hay qty real)
    if (line.recount_user && line.recount_qty !== null) {
      const cur = recountsMap.get(line.recount_user) ?? { total: 0, errors: 0 };
      cur.total++;
      if (line.recount_qty !== line.theoretical_qty) {
        cur.errors++;
      }
      recountsMap.set(line.recount_user, cur);
    }
  }

  // Helper para display_name en conteos
  const getCountDisplayName = (userId: string): string => {
    const data = countsMap.get(userId);
    return data?.name1 ?? data?.name2 ?? userId;
  };

  // ── Ranking Conteos 1 y 2 ────────────────────────────────────────────────
  const countsArr: UserRankingCounts[] = [];
  for (const [user_name, data] of countsMap) {
    const total_articulos = data.total1 + data.total2;
    const total_errores = data.errors1 + data.errors2;
    const precision = total_articulos > 0 ? ((total_articulos - total_errores) / total_articulos) * 100 : 0;
    countsArr.push({
      user_name,
      display_name: getCountDisplayName(user_name),
      total_conteo_1: data.total1,
      errores_conteo_1: data.errors1,
      total_conteo_2: data.total2,
      errores_conteo_2: data.errors2,
      total_articulos,
      total_errores,
      precision: Number(precision.toFixed(2)),
      hasEnoughData: total_articulos >= 20,
    });
  }

  // ── Ranking Reconteos ────────────────────────────────────────────────────
  const recountsArr: UserRankingRecounts[] = [];
  for (const [user_name, data] of recountsMap) {
    const precision = data.total > 0 ? ((data.total - data.errors) / data.total) * 100 : 0;
    recountsArr.push({
      user_name,
      display_name: user_name, // Por ahora no hay recount_user_name en la base
      total_reconteos: data.total,
      errores_reconteo: data.errors,
      precision: Number(precision.toFixed(2)),
      hasEnoughData: data.total >= 20,
    });
  }

  // ── Ranking Global Ponderado ─────────────────────────────────────────────
  // Unir todos los usuarios que aparezcan en counts o recounts
  const allUsers = new Set([...countsMap.keys(), ...recountsMap.keys()]);
  const globalArr: UserRankingGlobal[] = [];
  for (const user_name of allUsers) {
    const c = countsMap.get(user_name) ?? { total1: 0, errors1: 0, total2: 0, errors2: 0, name1: null, name2: null };
    const r = recountsMap.get(user_name) ?? { total: 0, errors: 0 };

    const total_conteos = c.total1 + c.total2;
    const errores_conteos = c.errors1 + c.errors2;
    const total_reconteos = r.total;
    const errores_reconteo = r.errors;

    const precision_conteos = total_conteos > 0 ? ((total_conteos - errores_conteos) / total_conteos) * 100 : 0;
    const precision_reconteo = total_reconteos > 0 ? ((total_reconteos - errores_reconteo) / total_reconteos) * 100 : 0;

    const total_general = total_conteos + total_reconteos;
    const errores_general = errores_conteos + errores_reconteo;
    const precision_global = total_general > 0 ? ((total_general - errores_general) / total_general) * 100 : 0;

    globalArr.push({
      user_name,
      display_name: getCountDisplayName(user_name),
      total_conteos,
      errores_conteos,
      total_reconteos,
      errores_reconteo,
      precision_conteos: Number(precision_conteos.toFixed(2)),
      precision_reconteo: Number(precision_reconteo.toFixed(2)),
      precision_global: Number(precision_global.toFixed(2)),
      hasEnoughData: total_general >= 20,
    });
  }

  return {
    counts: sortRankingByPrecisionAndVolume(countsArr),
    recounts: sortRankingByPrecisionAndVolume(recountsArr),
    global: sortRankingByPrecisionAndVolume(globalArr),
  };
}

export async function getRankingData(sessionId?: string): Promise<RankingsBundle> {
  const lines = await getAllLinesForRanking(sessionId);
  return calculateRankings(lines);
}

export async function getDistinctUsers(
  sessionId?: string
): Promise<{ users1: string[]; users2: string[] }> {
  const buildQuery = (from: number, to: number) => {
    let q = supabase
      .from('v_tfi_comparison_lines')
      .select('user_1, user_2')
      .range(from, to);

    if (sessionId) {
      q = q.eq('session_id', sessionId);
    }
    return q;
  };

  const allData = await fetchAllPages<{ user_1: string | null; user_2: string | null }>(buildQuery);

  const users1 = [
    ...new Set(
      allData
        .map((r) => r.user_1)
        .filter((u): u is string => Boolean(u))
    ),
  ].sort();

  const users2 = [
    ...new Set(
      allData
        .map((r) => r.user_2)
        .filter((u): u is string => Boolean(u))
    ),
  ].sort();

  return { users1, users2 };
}

// ─── Situaciones disponibles para una sesión (dinámicas desde tfi_count_lines) ──
export async function getAvailableSituations(sessionId: string): Promise<string[]> {
  const buildQuery = (from: number, to: number) => {
    return supabase
      .from('tfi_count_lines')
      .select('situation_1,situation_2,situation_recount')
      .eq('session_id', sessionId)
      .range(from, to);
  };

  const rows = await fetchAllPages<{
    situation_1: string | null;
    situation_2: string | null;
    situation_recount: string | null;
  }>(buildQuery);

  const values = new Set<string>();
  for (const row of rows) {
    if (row.situation_1) values.add(row.situation_1.trim().toUpperCase());
    if (row.situation_2) values.add(row.situation_2.trim().toUpperCase());
    if (row.situation_recount) values.add(row.situation_recount.trim().toUpperCase());
  }

  // Siempre devolver TODOS primero, luego el resto ordenado alfabéticamente
  const rest = Array.from(values).sort();
  return ['TODOS', ...rest];
}

export async function getSyncRunById(syncRunId: string): Promise<TfiSyncRun | null> {
  console.log('[Supabase] getSyncRunById — syncRunId:', syncRunId);

  const { data, error } = await supabase
    .from('tfi_sync_runs')
    .select('id,session_id,situation,status,started_at,finished_at,total_rows,error_message')
    .eq('id', syncRunId)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] getSyncRunById error:', error.message, error.details, error.hint);
    throw error;
  }

  console.log('[Supabase] getSyncRunById resultado:', data);
  return data as TfiSyncRun | null;
}

// Busca específicamente un sync en estado 'running' para una sesión.
// Devuelve null si no hay ninguno activo.
export async function getRunningSyncForSession(sessionId: string): Promise<TfiSyncRun | null> {
  console.log('[Supabase] getRunningSyncForSession — sessionId:', sessionId);

  const { data, error } = await supabase
    .from('tfi_sync_runs')
    .select('id,session_id,situation,status,started_at,finished_at,total_rows,error_message')
    .eq('session_id', sessionId)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] getRunningSyncForSession error:', error.message, error.details, error.hint);
    throw error;
  }

  console.log('[Supabase] getRunningSyncForSession resultado:', data);
  return data as TfiSyncRun | null;
}

export async function getLatestSyncRun(sessionId: string): Promise<TfiSyncRun | null> {
  console.log('[Supabase] getLatestSyncRun — sessionId:', sessionId);

  const { data, error } = await supabase
    .from('tfi_sync_runs')
    .select('id,session_id,situation,status,started_at,finished_at,total_rows,error_message')
    .eq('session_id', sessionId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] getLatestSyncRun error:', error.message, error.details, error.hint);
    throw error;
  }

  console.log('[Supabase] getLatestSyncRun resultado:', data);
  return data as TfiSyncRun | null;
}

// ─── Sync Lock Functions ────────────────────────────────────────────────────

export async function acquireSyncLock(sessionId: string, syncRunId: string): Promise<boolean> {
  console.log('[SyncLock] acquireSyncLock — sessionId:', sessionId, 'syncRunId:', syncRunId);

  const { data, error } = await supabase.rpc('acquire_tfi_sync_lock', {
    p_session_id: sessionId,
    p_sync_run_id: syncRunId,
  });

  if (error) {
    console.error('[SyncLock] acquireSyncLock error:', error.message, error.details, error.hint);
    throw error;
  }

  console.log('[SyncLock] acquireSyncLock resultado:', data);
  return (data as boolean) ?? false;
}

export async function releaseSyncLock(sessionId: string, errorMsg?: string): Promise<void> {
  console.log('[SyncLock] releaseSyncLock — sessionId:', sessionId, 'error:', errorMsg ?? 'none');

  const { error } = await supabase.rpc('release_tfi_sync_lock', {
    p_session_id: sessionId,
    p_error: errorMsg ?? null,
  });

  if (error) {
    console.error('[SyncLock] releaseSyncLock error:', error.message, error.details, error.hint);
    throw error;
  }

  console.log('[SyncLock] releaseSyncLock — liberado');
}

export async function getSyncLocks(): Promise<TfiSyncLock[]> {
  const { data, error } = await supabase
    .from('tfi_sync_locks')
    .select('*');

  if (error) {
    console.error('[SyncLock] getSyncLocks error:', error.message);
    throw error;
  }

  console.log('[SyncLock] getSyncLocks:', data?.length ?? 0, 'locks encontrados');
  return (data ?? []) as TfiSyncLock[];
}

export async function getSyncLock(sessionId: string): Promise<TfiSyncLock | null> {
  console.log('[SyncLock] getSyncLock — sessionId:', sessionId);

  const { data, error } = await supabase
    .from('tfi_sync_locks')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    console.error('[SyncLock] getSyncLock error:', error.message);
    throw error;
  }

  console.log('[SyncLock] getSyncLock resultado:', data);
  return data as TfiSyncLock | null;
}