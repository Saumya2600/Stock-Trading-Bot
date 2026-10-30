import { useEffect, useState } from 'react';
import { DashboardAuthContext } from './dashboardAuthContext';
import { supabase } from '../lib/supabase';

export default function DashboardAuthGate({ children }) {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(Boolean(supabase));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSession(null);
        setError(payload.error || 'This account cannot access dashboard.');
        return false;
      }

      setSession(nextSession);
      setError('');
      return true;
    } catch {
      setSession(null);
      setError('Could not verify Supabase session.');
      return false;
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!supabase) return undefined;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!nextSession) {
        setSession(null);
        setChecking(false);
        return;
      }
      setChecking(true);
      Promise.resolve().then(() => verifySession(nextSession));
    });

    return () => subscription.unsubscribe();
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

  if (checking) return <div className="loading">Checking dashboard access...</div>;

  if (!session) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
        <form onSubmit={login} className="glass-card" style={{ width: 'min(100%, 380px)', padding: '2rem' }}>
          <h1 className="headline-md" style={{ marginBottom: '0.5rem' }}>Dashboard sign-in</h1>
          <p className="label-sm" style={{ marginBottom: '1.5rem', textTransform: 'none' }}>Sign in with your approved Supabase account.</p>
          <input
            autoFocus
            type="email"
            autoComplete="username"
            value={email}
            onChange={event => setEmail(event.target.value)}
            aria-label="Email address"
            placeholder="Email address"
            required
            style={{ width: '100%', padding: '0.8rem', marginBottom: '0.75rem', color: '#fff', background: '#111', border: '1px solid #444', borderRadius: '6px' }}
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            aria-label="Dashboard password"
            required
            style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem', color: '#fff', background: '#111', border: '1px solid #444', borderRadius: '6px' }}
          />
          {(error || !supabase) && <p role="alert" style={{ color: '#ff716c', fontSize: '0.85rem' }}>{error || 'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'}</p>}
          <button className="apple-btn apple-btn-primary" type="submit" disabled={submitting || !supabase || !email || !password} style={{ width: '100%' }}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <DashboardAuthContext.Provider value={{ logout }}>
      {children}
    </DashboardAuthContext.Provider>
  );
}