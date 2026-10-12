import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Only init if the URL looks valid — never crash on placeholder values
const isValidUrl = supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://');

export const supabase = isValidUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!isValidUrl) {
  console.warn(
    '[Supabase] Not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable picks persistence.'
  );
}


/**
 * Save a batch of research picks to Supabase.
 * Table: research_picks (id, symbol, name, ai_grade, price, target_price,
 *   entry_price, reasoning, risk_level, type, updated_at, run_date)
 */
export async function savePicksToSupabase(reportsObj) {
  if (!supabase) return { error: 'Supabase not configured' };

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const picks = Object.entries(reportsObj)
    .filter(([k]) => !k.startsWith('_'))
    .map(([symbol, r]) => ({
      symbol,
      name: r.name || symbol,
      ai_grade: r.ai_grade || 50,
      price: r.price || null,
      target_price: r.target_price || null,
      entry_price: r.entry_price || null,
      reasoning: r.reasoning || null,
      risk_level: r.risk_level || 'Medium',
      type: r.type || null,
      updated_at: r.updated_at || new Date().toISOString(),
      run_date: today,
    }));

  if (!picks.length) return { data: [], error: null };

  const { data, error } = await supabase
    .from('research_picks')
    .upsert(picks, { onConflict: 'symbol,run_date' });

  return { data, error };
}

/**
 * Fetch all stored picks from Supabase, newest first.
 */
export async function fetchPicksFromSupabase({ limit = 100, days = 30 } = {}) {
  if (!supabase) return { data: [], error: 'Supabase not configured' };

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('research_picks')
    .select('*')
    .gte('run_date', since.toISOString().split('T')[0])
    .order('run_date', { ascending: false })
    .order('ai_grade', { ascending: false })
    .limit(limit);

  return { data: data || [], error };
}
