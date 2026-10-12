import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only init when both public Supabase settings are present.
const isConfigured = (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://'))
  && Boolean(supabaseAnonKey);

export const supabase = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const publicDataClient = isConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  : null;

if (!isConfigured) {
  console.warn(
    '[Supabase] Not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign-in and picks persistence.'
  );
}


/**
 * Save a batch of research picks to Supabase.
 * Table: research_picks (id, symbol, name, ai_grade, price, target_price,
 *   entry_price, reasoning, risk_level, type, updated_at, run_date)
 */
export async function savePicksToSupabase(reportsObj) {
  if (!publicDataClient) return { error: 'Supabase not configured' };

  const picks = Object.entries(reportsObj)
    .filter(([k]) => !k.startsWith('_'))
    .map(([symbol, r]) => {
      const updatedAtStr = r.updated_at || new Date().toISOString();
      // Use the actual report date so historical scans don't falsely label as today
      const runDate = updatedAtStr.split('T')[0];
      return {
        symbol,
        name: r.name || symbol,
        ai_grade: r.ai_grade || 50,
        price: r.price || null,
        target_price: r.target_price || null,
        entry_price: r.entry_price || null,
        reasoning: r.reasoning || null,
        risk_level: r.risk_level || 'Medium',
        type: r.type || null,
        updated_at: updatedAtStr,
        run_date: runDate,
      };
    });

  if (!picks.length) return { data: [], error: null };

  const { data, error } = await publicDataClient
    .from('research_picks')
    .upsert(picks, { onConflict: 'symbol,run_date' });

  return { data, error };
}

/**
 * Fetch all stored picks from Supabase, newest first.
 */
export async function fetchPicksFromSupabase({ limit = 100, days = 30 } = {}) {
  if (!publicDataClient) return { data: [], error: 'Supabase not configured' };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await publicDataClient
    .from('research_picks')
    .select('*')
    .gte('run_date', since.toISOString().split('T')[0])
    .order('run_date', { ascending: false })
    .order('ai_grade', { ascending: false })
    .limit(limit);

  return { data: data || [], error };
}
