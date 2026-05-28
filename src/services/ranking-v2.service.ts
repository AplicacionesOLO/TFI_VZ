import { supabase } from '@/lib/supabase';
import type { UserRankingV2, RankingV2Filters } from '@/types/tfi.types';

// ─── Obtener ranking de usuarios desde tfi_count_attempts ──────────────
export async function getRankingV2(
  filters: RankingV2Filters,
): Promise<UserRankingV2[]> {
  const { data, error } = await supabase.rpc('get_user_ranking_v2', {
    p_session_id: filters.session_id,
    p_take_names: filters.take_names ?? null,
    p_take_type: filters.take_type ?? null,
    p_user_search: filters.user_search ?? null,
  });

  if (error) {
    console.error('[RankingV2] getRankingV2 error:', error.message);
    throw error;
  }

  return (data ?? []) as UserRankingV2[];
}