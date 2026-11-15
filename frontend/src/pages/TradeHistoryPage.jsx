import { useState } from 'react';
import { LineChart as ChartIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatAtlanticDate, formatAtlanticTime } from '../lib/dateTime';
import Reveal from '../components/motion/Reveal';

export default function TradeHistoryPage() {
  const { tradeHistory } = useApp();
  const [filter, setFilter] = useState('ALL');

  const sorted = [...tradeHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const filtered = filter === 'ALL' ? sorted : sorted.filter(t => t.side === filter);
  const totalBuys = tradeHistory.filter(t => t.side === 'BUY').length;
  const totalSells = tradeHistory.filter(t => t.side === 'SELL').length;
  const totalVolume = tradeHistory.reduce((sum, t) => sum + ((t.price || 0) * (t.quantity || 0)), 0);

  return (
    <div className="page-enter">
      <header className="page-head">
        <div>
          <h1 className="display-lg">Trade history</h1>
          <p className="headline-sm" style={{ marginTop: '0.4rem' }}>Every buy and sell the bot has executed</p>
        </div>
      </header>

      <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="glass-card stat-tile">
          <div className="label-sm">Total trades</div>
          <div className="stat-tile__value">{tradeHistory.length}</div>
        </div>
        <div className="glass-card stat-tile">
          <div className="label-sm" style={{ color: 'var(--primary)' }}>Buys</div>
          <div className="stat-tile__value" style={{ color: 'var(--primary)' }}>{totalBuys}</div>
        </div>
        <div className="glass-card stat-tile">
          <div className="label-sm" style={{ color: 'var(--secondary)' }}>Sells</div>
          <div className="stat-tile__value" style={{ color: 'var(--secondary)' }}>{totalSells}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <div role="group" aria-label="Filter trades">
          {['ALL', 'BUY', 'SELL'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`sector-pill ${filter === f ? 'active' : ''}`}
              aria-pressed={filter === f}
              style={{ marginRight: '0.35rem' }}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', color: 'var(--on-surface-variant)', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
          Traded volume ${totalVolume.toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-card state-block">
          <ChartIcon size={28} aria-hidden="true" />
          <p className="state-block__title">{tradeHistory.length === 0 ? 'No trades yet' : `No ${filter.toLowerCase()} trades`}</p>
          <p className="state-block__body">
            {tradeHistory.length === 0
              ? 'Executions appear here as soon as the bot fills an order.'
              : 'Switch the filter back to all to see the full history.'}
          </p>
        </div>
      ) : (
        <Reveal className="trade-list" x={-12} y={10} stagger={0.05}>
          {filtered.map((trade, index) => {
            const isBuy = trade.side === 'BUY';
            const total = (trade.price || 0) * (trade.quantity || 0);
            return (
              <div key={`${trade.symbol}-${trade.timestamp}-${index}`} className="trade-row">
                <div className={`trade-dot ${isBuy ? 'buy' : 'sell'}`} aria-hidden="true" />
                <div className="trade-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="trade-card__title">
                        <span className="ticker" style={{ fontSize: '1.15rem' }}>{trade.symbol}</span>
                        <span className={`chip ${isBuy ? 'positive' : 'negative'}`} style={{ fontSize: '0.7rem' }}>{trade.side}</span>
                        {trade.signal && <span className="chip" style={{ fontSize: '0.7rem' }}>{trade.signal}</span>}
                      </div>
                      <div className="trade-card__qty">
                        {Number(trade.quantity || 0).toLocaleString('en-US')} shares @{' '}
                        <strong>${(trade.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        {' = '}
                        <strong>${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="label-sm" style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {formatAtlanticDate(trade.timestamp)}
                      </div>
                      <div className="label-sm" style={{ textTransform: 'none', letterSpacing: 0 }}>
                        {formatAtlanticTime(trade.timestamp)} ADT/AST
                      </div>
                      {trade.ai_grade != null && (
                        <div className="label-sm" style={{ marginTop: '0.2rem' }}>
                          AI grade{' '}
                          <strong style={{ color: trade.ai_grade >= 80 ? 'var(--primary)' : trade.ai_grade < 50 ? 'var(--secondary)' : 'var(--warning)' }}>
                            {trade.ai_grade}
                          </strong>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </Reveal>
      )}
    </div>
  );
}
