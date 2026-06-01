import { supabase } from '@/lib/supabase';
import type { DashboardV2Stats, DashboardV2Diff } from '@/types/tfi.types';

export async function getDashboardV2Stats(
  sessionId?: string,
  takeNames?: string[],
): Promise<DashboardV2Stats | null> {
  if (!sessionId) return null;

  const { data, error } = await supabase
    .rpc('get_dashboard_stats_v2', {
      p_session_id: sessionId,
      p_take_names: takeNames && takeNames.length > 0 ? takeNames : null,
    })
    .single();

  if (error) {
    console.error('[DashboardV2] getDashboardV2Stats error:', error.message);
    throw error;
  }

  if (!data || Array.isArray(data)) return null;

  return data as DashboardV2Stats;
}

export async function getDashboardV2Diffs(
  sessionId?: string,
  limit = 10,
  takeNames?: string[],
): Promise<DashboardV2Diff[]> {
  if (!sessionId) return [];

  const { data, error } = await supabase
    .rpc('get_dashboard_v2_diffs', {
      p_session_id: sessionId,
      p_limit: limit,
      p_take_names: takeNames && takeNames.length > 0 ? takeNames : null,
    });

  if (error) {
    console.error('[DashboardV2] getDashboardV2Diffs error:', error.message);
    throw error;
  }

  return (data ?? []) as DashboardV2Diff[];
}