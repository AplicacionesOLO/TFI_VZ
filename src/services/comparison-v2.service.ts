import { supabase } from '@/lib/supabase';
import type {
  AvailableTake,
  ComparisonV2Line,
  ComparisonV2Filters,
} from '@/types/comparison-v2.types';

// ─── Obtener tomas disponibles para una sesión ─────────────────────────────
export async function getAvailableTakesV2(
  sessionId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<AvailableTake[]> {
  const { data, error } = await supabase.rpc('get_available_takes_v2_f', {
    p_session_id: sessionId,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null,
  });

  if (error) {
    console.error('[ComparisonV2] getAvailableTakesV2 error:', error.message);
    throw error;
  }

  return (data ?? []) as AvailableTake[];
}

// ─── Obtener líneas de comparación dinámica ────────────────────────────────
export async function getComparisonV2(
  filters: ComparisonV2Filters,
): Promise<{ lines: ComparisonV2Line[]; totalCount: number }> {
  const { data, error } = await supabase.rpc('get_comparison_v2_f', {
    p_session_id: filters.session_id,
    p_take_a_name: filters.take_a_name,
    p_take_b_name: filters.take_b_name,
    p_article_search: filters.article_search ?? null,
    p_status_filter: filters.status_filter ?? null,
    p_page: filters.page ?? 1,
    p_page_size: filters.page_size ?? 20,
    p_date_from: filters.date_from ?? null,
    p_date_to: filters.date_to ?? null,
  });

  if (error) {
    console.error('[ComparisonV2] getComparisonV2 error:', error.message);
    throw error;
  }

  const rows = (data ?? []) as ComparisonV2Line[];
  const totalCount = rows.length > 0 ? rows[0].total_count : 0;

  return { lines: rows, totalCount };
}

// ─── Obtener todas las líneas para exportación ────────────────────────────
export async function getAllComparisonV2ForExport(
  filters: Omit<ComparisonV2Filters, 'page' | 'page_size'>,
): Promise<ComparisonV2Line[]> {
  // Fetch con page_size grande para exportar todo
  const { lines, totalCount } = await getComparisonV2({
    ...filters,
    page: 1,
    page_size: 10000,
  });

  // Si el total excede 10000, hacer múltiples llamadas
  if (totalCount > 10000) {
    const allLines: ComparisonV2Line[] = [...lines];
    const totalPages = Math.ceil(totalCount / 10000);
    for (let p = 2; p <= totalPages; p++) {
      const batch = await getComparisonV2({
        ...filters,
        page: p,
        page_size: 10000,
      });
      allLines.push(...batch.lines);
    }
    return allLines;
  }

  return lines;
}