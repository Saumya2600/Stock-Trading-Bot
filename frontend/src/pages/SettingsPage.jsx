import { useApp } from '../context/AppContext';

export default function SettingsPage() {
  const { botOnline } = useApp();

  return (
    <>
      <header style={{ marginBottom: '2.5rem' }}>
        <h2 className="display-lg">Settings</h2>
        <p className="headline-sm" style={{ marginTop: '0.5rem', opacity: 0.7 }}>App configuration &amp; API connections</p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '640px' }}>
        {/* Alpaca connection */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 className="headline-sm" style={{ fontSize: '1.1rem' }}>Alpaca API</h3>
            <div className="chip hold" style={{ fontSize: '0.65rem' }}>SERVER-SIDE</div>
          </div>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.85rem', lineHeight: '1.6' }}>
            Vercel Function reads live market data from{' '}
            <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>data.alpaca.markets</code>.
            Store Alpaca credentials in Vercel server environment variables. Never add them as <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>VITE_*</code> variables.
          </p>
          <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--on-surface-variant)', lineHeight: '1.8' }}>
            <div>ALPACA_API_KEY=stored in Vercel</div>
            <div>ALPACA_SECRET_KEY=stored in Vercel</div>
            <div>DASHBOARD_PASSWORD=stored in Vercel</div>
            <div>DASHBOARD_SESSION_SECRET=stored in Vercel</div>
          </div>
        </div>

        {/* Bot engine status */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 className="headline-sm" style={{ fontSize: '1.1rem' }}>Intelligence Engine</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: '8px', height: '8px',
                background: botOnline ? '#3fff8b' : '#ff716c',
                borderRadius: '50%',
                boxShadow: botOnline ? '0 0 10px #3fff8b' : 'none',
                transition: 'all 0.3s ease',
              }} />
              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: botOnline ? '#3fff8b' : '#ff716c' }}>
                {botOnline ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
          </div>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.85rem', lineHeight: '1.6' }}>
            {botOnline
              ? 'Bot is running and publishing research reports. Intelligence Hub is live.'
              : 'Start the Python backend to enable AI research, autonomous trading, and live intelligence.'}
          </p>
          {!botOnline && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>
              cd backend && python bot.py
            </div>
          )}
        </div>

        {/* App info */}
        <div className="glass-card" style={{ padding: '2rem' }}>
          <h3 className="headline-sm" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>About</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              ['App', 'Deep Tech — AI Stock Trading Bot'],
              ['Frontend', 'React + Vite'],
              ['Backend', 'FastAPI + Python'],
              ['Data', 'Alpaca Markets API'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{label}</span>
                <span style={{ fontSize: '0.85rem', fontWeight: '500' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
