import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string)?.replace(/\/$/, '');
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Error crítico: VITE_PUBLIC_SUPABASE_URL o VITE_PUBLIC_SUPABASE_ANON_KEY no están definidos en .env');
}

export const supabase = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'tfi-dashboard',
    },
  },
});

// Helper de diagnóstico: lanza un ping a Supabase para verificar conectividad y tablas TFI
export async function checkSupabaseHealth(): Promise<{ ok: boolean; tables: string[]; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .or('table_name.like.tfi%,table_name.like.v_tfi%');

    if (error) throw error;

    const tables = (data ?? []).map((r: { table_name: string }) => r.table_name);
    return { ok: true, tables };
  } catch (err: any) {
    console.error('[Supabase Health Check]', err?.message ?? err);
    return { ok: false, tables: [], error: err?.message ?? 'Error desconocido de conexión' };
  }
}