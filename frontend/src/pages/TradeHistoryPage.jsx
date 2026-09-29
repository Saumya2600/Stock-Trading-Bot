import { useState } from 'react';
import { LineChart as ChartIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';

export default function TradeHistoryPage() {
  const { tradeHistory } = useApp();
  const [filter, setFilter] = useState('ALL');

  const sorted = [...tradeHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const filtered = filter === 'ALL' ? sorted : sorted.filter(t => t.side === filter);
  const totalBuys = tradeHistory.filter(t => t.side === 'BUY').length;
  const totalSells = tradeHistory.filter(t => t.side === 'SELL').length;
  const totalVolume = tradeHistory.reduce((sum, t) => sum + ((t.price || 0) * (t.quantity || 0)), 0);

  return (
    <>
      <header style={{ marginBottom: '2rem' }}>
        <h2 className="display-lg">Trade History</h2>
        <p className="headline-sm" style={{ marginTop: '0.5rem', opacity: 0.7 }}>All buy &amp; sell events executed by the bot</p>
      </header>

      {/* Stats */}
      <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
          <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Total Trades</div>
          <div className="display-lg" style={{ fontSize: '2.5rem', marginTop: '0.25rem' }}>{tradeHistory.length}</div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', border: '1px solid rgba(63,255,139,0.2)' }}>
          <div className="label-sm" style={{ color: '#3fff8b' }}>Buys</div>
          <div className="display-lg" style={{ fontSize: '2.5rem', marginTop: '0.25rem', color: '#3fff8b' }}>{totalBuys}</div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', border: '1px solid rgba(255,113,108,0.2)' }}>
          <div className="label-sm" style={{ color: '#ff716c' }}>Sells</div>
          <div className="display-lg" style={{ fontSize: '2.5rem', marginTop: '0.25rem', color: '#ff716c' }}>{totalSells}</div>
        </div>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
        {['ALL', 'BUY', 'SELL'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`sector-pill ${filter === f ? 'active' : ''}`}>
            {f}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', color: 'var(--on-surface-variant)', fontSize: '0.8rem' }}>
          Total volume: ${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
          <ChartIcon size={48} style={{ marginBottom: '1rem' }} />
          <p>No trades yet. Bot will log events here after market hours.</p>
        </div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: '1.5rem', borderLeft: '2px solid rgba(255,255,255,0.08)' }}>
          {filtered.map((trade, index) => (
            <div key={`${trade.symbol}-${trade.timestamp}-${index}`} style={{ position: 'relative', marginBottom: '1.25rem', paddingLeft: '1.5rem' }}>
              <div style={{
                position: 'absolute', left: '-10px', top: '1rem',
                width: '16px', height: '16px', borderRadius: '50%',
                background: trade.side === 'BUY' ? '#3fff8b' : '#ff716c',
                border: '2px solid rgba(255,255,255,0.15)',
                boxShadow: `0 0 12px ${trade.side === 'BUY' ? '#3fff8b' : '#ff716c'}66`
              }} />
              <div className="glass-card" style={{
                padding: '1.25rem',
                background: trade.side === 'BUY' ? 'rgba(63,255,139,0.03)' : 'rgba(255,113,108,0.03)',
                border: `1px solid ${trade.side === 'BUY' ? 'rgba(63,255,139,0.12)' : 'rgba(255,113,108,0.12)'}`,
                borderRadius: '16px',
                transition: 'transform 0.2s ease',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <div className="ticker" style={{ fontSize: '1.3rem' }}>{trade.symbol}</div>
                      <div className={`chip ${trade.side === 'BUY' ? 'positive' : 'negative'}`} style={{ fontSize: '0.65rem' }}>{trade.side}</div>
                      {trade.signal && <div className="chip" style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: '0.6rem' }}>{trade.signal}</div>}
                    </div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'none', letterSpacing: 0, fontSize: '0.8rem' }}>
                      {trade.quantity} shares @ <strong style={{ color: '#fff' }}>${(trade.price || 0).toFixed(2)}</strong>
                      {' '}= <strong style={{ color: '#fff' }}>${((trade.price || 0) * (trade.quantity || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{new Date(trade.timestamp).toLocaleDateString()}</div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    {trade.ai_grade != null && (
                      <div className="label-sm" style={{ marginTop: '0.25rem' }}>
                        AI Grade: <strong style={{ color: trade.ai_grade >= 80 ? '#3fff8b' : trade.ai_grade < 50 ? '#ff716c' : '#ffd60a' }}>{trade.ai_grade}</strong>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
