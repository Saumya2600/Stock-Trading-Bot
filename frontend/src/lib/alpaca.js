import { supabase } from './supabase';

export async function alpacaRequest(endpoint, params = {}) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error('Sign in to use Alpaca data.');

  const query = new URLSearchParams({ endpoint });
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(name, String(value));
  }

  const response = await fetch(`/api/alpaca?${query}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Alpaca request failed (${response.status}).`);
  return payload;
}