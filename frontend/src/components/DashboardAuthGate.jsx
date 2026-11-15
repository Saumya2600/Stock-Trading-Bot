import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { DashboardAuthContext } from './dashboardAuthContext';
import { supabase } from '../lib/supabase';

export default function DashboardAuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const settledRef = useRef(false);

  const verifySession = async nextSession => {
    if (!nextSession?.access_token) {
      setSession(null);
      setChecking(false);
      return false;
    }

    try {
      const response = await fetch('/api/session', {
        headers: { Authorization: `Bearer ${nextSession.access_token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSession(null);
        setError(payload.error || 'This account cannot access the dashboard.');
        return false;
      }

      settledRef.current = true;
      setSession(nextSession);
      setError('');
      return true;
    } catch {
      setSession(null);
      setError('Could not verify your session. Check your connection and try again.');
      return false;
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        setSession(null);
        setChecking(false);
        return;
      }
      setChecking(true);
      Promise.resolve().then(() => verifySession(nextSession));
    });

    /* The auth event does not always fire on a cold load (hard navigation,
       restored tab), which left the gate spinning forever. Read the stored
       session once and verify it, so the gate always resolves. */
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data?.session) Promise.resolve().then(() => verifySession(data.session));
      else setChecking(false);
    }).catch(() => {
      if (active) setChecking(false);
    });

    /* The access check must always finish. A hanging request or a stalled
       auth client previously left this screen spinning with no way out. */
    const safety = window.setTimeout(() => {
      if (!active || settledRef.current) return;
      setChecking(false);
      setError(current => current || 'The access check timed out. Reload the page or sign in again.');
    }, 10000);

    return () => {
      active = false;
      window.clearTimeout(safety);
      subscription.unsubscribe();
    };
  }, []);

  const login = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (!supabase) throw new Error('Supabase is not configured.');
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;

      const authorized = await verifySession(data.session);
      if (!authorized) {
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }
      window.dispatchEvent(new Event('refresh-dashboard-data'));
      setPassword('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setError('');
  };

  if (checking) {
    return (
      <div className="auth-shell">
        <div className="loading" role="status">Checking dashboard access&hellip;</div>
      </div>
    );
  }

  const message = error || (!supabase
    ? 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your environment.'
    : '');

  if (!session) {
    return (
      <div className="auth-shell">
        <form onSubmit={login} className="glass-card auth-card" noValidate>
          <div className="auth-brand">
            <img className="brand-mark" src="/favicon.svg" alt="" width="26" height="26" />
            <span className="brand-word">Sam&rsquo;s Lab</span>
          </div>
          <h1 className="auth-title">Dashboard sign-in</h1>
          <p className="auth-sub">Use your approved Supabase account to open the trading dashboard.</p>

          {message && (
            <p className="auth-error" role="alert">
              <AlertCircle size={15} aria-hidden="true" />
              <span>{message}</span>
            </p>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="auth-input"
              autoFocus
              type="email"
              autoComplete="username"
              value={email}
              onChange={event => setEmail(event.target.value)}
              aria-invalid={Boolean(message) || undefined}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="auth-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              aria-invalid={Boolean(message) || undefined}
              placeholder="Your dashboard password"
              required
            />
          </div>

          <button
            className="apple-btn apple-btn-primary auth-submit"
            type="submit"
            disabled={submitting || !supabase || !email || !password}
          >
            {submitting ? (
              <>
                <Loader2 size={15} className="spinner" aria-hidden="true" /> Signing in&hellip;
              </>
            ) : 'Sign in'}
          </button>

          <p className="auth-note">
            Access is limited to the emails your operator allowlisted. Ask them to add you if sign-in is refused.
          </p>
        </form>
      </div>
    );
  }

  return (
    <DashboardAuthContext.Provider value={{ logout }}>
      {children}
    </DashboardAuthContext.Provider>
  );
}
