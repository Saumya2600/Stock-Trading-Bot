import { useEffect, useState } from 'react';
import { DashboardAuthContext } from './dashboardAuthContext';

export default function DashboardAuthGate({ children }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Dashboard authentication unavailable.');
        setAuthenticated(Boolean(payload.authenticated));
      })
      .catch(reason => setError(reason.message))
      .finally(() => setChecking(false));
  }, []);

  const login = async event => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Sign-in failed.');
      setAuthenticated(true);
      setPassword('');
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    setAuthenticated(false);
  };

  if (checking) return <div className="loading">Checking dashboard access...</div>;

  if (!authenticated) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
        <form onSubmit={login} className="glass-card" style={{ width: 'min(100%, 380px)', padding: '2rem' }}>
          <h1 className="headline-md" style={{ marginBottom: '0.5rem' }}>Dashboard sign-in</h1>
          <p className="label-sm" style={{ marginBottom: '1.5rem', textTransform: 'none' }}>Enter dashboard password to continue.</p>
          <input
            autoFocus
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            aria-label="Dashboard password"
            required
            style={{ width: '100%', padding: '0.8rem', marginBottom: '1rem', color: '#fff', background: '#111', border: '1px solid #444', borderRadius: '6px' }}
          />
          {error && <p role="alert" style={{ color: '#ff716c', fontSize: '0.85rem' }}>{error}</p>}
          <button className="apple-btn apple-btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
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