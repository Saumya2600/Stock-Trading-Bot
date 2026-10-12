import { createClient } from '@supabase/supabase-js';
import process from 'node:process';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const allowedEmails = new Set(
  (process.env.DASHBOARD_ALLOWED_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

export default async function authorizeSupabaseUser(req) {
  if (!supabaseUrl || !supabaseAnonKey || allowedEmails.size === 0) {
    return { status: 503, error: 'Supabase dashboard access is not configured.' };
  }

  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { status: 401, error: 'Sign in to continue.' };

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { status: 401, error: 'Session is invalid or expired.' };

    const email = data.user.email?.toLowerCase();
    if (!email || !allowedEmails.has(email)) {
      return { status: 403, error: 'This account is not allowed to access dashboard.' };
    }

    return { user: data.user };
  } catch {
    return { status: 502, error: 'Could not verify Supabase session.' };
  }
}