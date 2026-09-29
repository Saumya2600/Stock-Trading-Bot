import { useApp } from '../context/AppContext';
import { Brain, TrendingUp, Activity, Clock, Zap, ChevronRight } from 'lucide-react';

/* ── small reusable stat cell ── */
function StatCell({ label, value, sub, accent }) {
  return (
    <div className="stat-cell">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : {}}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/* ── section heading ── */
function SectionHead({ icon, label }) {
  return (
    <div className="section-head">
      {icon}
      <span>{label}</span>
    </div>
  );
}

export default function HubPage() {
  const {
    botOnline, researchReports, botSignals,
    performance, positions, researchStatus, tradeHistory,
    manualResearchLoading, setManualResearchLoading,
    researchClearing, setResearchClearing,
    setResearchReports, API_BASE,
    openStockModal,
  } = useApp();

  /* ── Hero bento stat row ── */
  const HeroBento = () => {
    const hasPerf = performance && performance.bot_roi != null;
    const totalPnL = positions?.total_unrealized_pnl || 0;
    const portfolioValue = positions?.total_value || 0;
    const alpha = hasPerf ? (performance.bot_roi - performance.spy_roi).toFixed(2) : null;
    const isWinning = hasPerf && performance.bot_roi > performance.spy_roi;

    return (
      <div className="hero-bento">
        {/* Alpha chip — the big number */}
        <div className="hero-bento-main glass-card">
          <div className="hero-bento-eyebrow">
            <span className={`status-dot ${botOnline ? 'online' : 'offline'}`} />
            <span className="label-md" style={{ opacity: 0.5 }}>INTELLIGENCE ENGINE</span>
          </div>
          {hasPerf ? (
            <>
              <div className="hero-alpha" style={{ color: isWinning ? '#3fff8b' : '#ff716c' }}>
                {isWinning ? '+' : ''}{alpha}%
              </div>
              <div className="label-md" style={{ opacity: 0.4, marginTop: '0.25rem' }}>ALPHA VS SPY</div>
            </>
          ) : (
            <div className="hero-alpha-placeholder">
              <Brain size={32} style={{ opacity: 0.2 }} />
              <div style={{ opacity: 0.3, fontSize: '0.9rem', marginTop: '0.5rem' }}>Awaiting data…</div>
            </div>
          )}
        </div>

        {/* Stat cells */}
        <div className="hero-bento-stats">
          <div className="glass-card hero-stat-card">
            <TrendingUp size={16} style={{ color: '#3fff8b', opacity: 0.7, marginBottom: '0.75rem' }} />
            <StatCell
              label="BOT ROI"
              value={hasPerf ? `${performance.bot_roi.toFixed(2)}%` : '—'}
              accent={hasPerf && performance.bot_roi >= 0 ? '#3fff8b' : '#ff716c'}
            />
          </div>
          <div className="glass-card hero-stat-card">
            <Activity size={16} style={{ color: '#57bcff', opacity: 0.7, marginBottom: '0.75rem' }} />
            <StatCell
              label="PORTFOLIO"
              value={portfolioValue > 0 ? `$${portfolioValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—'}
              sub={totalPnL !== 0 ? `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(0)} P&L` : null}
              accent={totalPnL >= 0 ? '#3fff8b' : '#ff716c'}
            />
          </div>
          <div className="glass-card hero-stat-card">
            <Zap size={16} style={{ color: '#ffd60a', opacity: 0.7, marginBottom: '0.75rem' }} />
            <StatCell
              label="TRADES"
              value={tradeHistory.length || '—'}
              sub="since inception"
            />
          </div>
          <div className="glass-card hero-stat-card">
            <Clock size={16} style={{ color: 'var(--on-surface-variant)', opacity: 0.7, marginBottom: '0.75rem' }} />
            <StatCell
              label="RESEARCH"
              value={Object.keys(researchReports).filter(k => !k.startsWith('_')).length || '—'}
              sub="stocks analyzed"
            />
          </div>
        </div>
      </div>
    );
  };

  /* ── Research Status ── */
  const ResearchStatus = () => {
    if (!researchStatus) return null;
    const lastRun = researchStatus.last_run
      ? new Date(researchStatus.last_run).toLocaleString()
      : 'None yet';
    const isOpen = researchStatus.market_open;
    const nextOpen = researchStatus.next_market_open_sec != null
      ? `${Math.floor(researchStatus.next_market_open_sec / 3600)}h ${Math.floor((researchStatus.next_market_open_sec % 3600) / 60)}m`
      : '—';
    const symbols = (researchStatus.research_symbols || []).slice(0, 8).join(', ') || 'None yet';

    return (
      <div className="glass-card hub-section">
        <div className="hub-section-header">
          <div>
            <h3 className="hub-section-title">Research Engine</h3>
            <div className="hub-section-sub">
              Market is <span style={{ color: isOpen ? '#3fff8b' : '#ffd60a', fontWeight: '700' }}>{isOpen ? 'OPEN' : 'CLOSED'}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              className="apple-btn apple-btn-primary"
              disabled={manualResearchLoading || researchClearing}
              onClick={async () => {
                setManualResearchLoading(true);
                setResearchReports({});
                try { await fetch(`${API_BASE}/trigger_research`, { method: 'POST' }); }
                catch (e) { console.error(e); }
                setManualResearchLoading(false);
              }}
            >
              {manualResearchLoading ? 'Triggering…' : 'Run Now'}
            </button>
            <button
              className="apple-btn apple-btn-secondary"
              disabled={researchClearing || manualResearchLoading}
              onClick={async () => {
                setResearchClearing(true);
                setResearchReports({});
                try { await fetch(`${API_BASE}/clear_research`, { method: 'POST' }); }
                catch (e) { console.error(e); }
                setResearchClearing(false);
              }}
            >
              {researchClearing ? 'Clearing…' : 'Clear'}
            </button>
          </div>
        </div>

        <div className="research-meta-grid">
          <div>
            <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Last Run</div>
            <div className="meta-value">{lastRun}</div>
          </div>
          <div>
            <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Stocks Analyzed</div>
            <div className="meta-value">{researchStatus.research_count || 0}</div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Latest Symbols</div>
            <div className="meta-value" style={{ opacity: 0.7 }}>{symbols}</div>
          </div>
          <div>
            <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Next Open</div>
            <div className="meta-value">{nextOpen}</div>
          </div>
        </div>
      </div>
    );
  };

  /* ── Portfolio ── */
  const Portfolio = () => {
    if (!positions || !positions.positions || positions.positions.length === 0) {
      return (
        <div className="glass-card hub-section hub-empty">
          <h3 className="hub-section-title">Portfolio Positions</h3>
          <p className="hub-empty-text">No active positions. Bot is waiting for high-conviction opportunities.</p>
        </div>
      );
    }
    const totalPnL = positions.total_unrealized_pnl || 0;
    const totalValue = positions.total_value || 0;
    const totalInvested = positions.total_invested || 0;
    const pct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return (
      <div className="glass-card hub-section">
        <div className="hub-section-header">
          <div>
            <h3 className="hub-section-title">Portfolio Positions</h3>
            <div className="hub-section-sub">{positions.is_live_alpaca ? 'Live from Alpaca' : 'Vs SPY benchmark'}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', letterSpacing: '-0.03em', color: totalPnL >= 0 ? '#3fff8b' : '#ff716c' }}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </div>
            <div className="label-md" style={{ color: totalPnL >= 0 ? '#3fff8b' : '#ff716c' }}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}% P&L
            </div>
          </div>
        </div>

        <div className="position-grid">
          {positions.positions.map(p => {
            const pos = p.unrealized_pnl >= 0;
            const met = p.sell_target_price ? p.current_price >= p.sell_target_price : false;
            return (
              <div key={p.symbol} className={`position-card ${met ? 'target-met' : ''}`}>
                {met && <div className="target-badge">TARGET MET</div>}
                <div className="position-card-header">
                  <div>
                    <div className="ticker" style={{ fontSize: '1.15rem' }}>{p.symbol}</div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.1rem' }}>{p.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '700', color: pos ? '#3fff8b' : '#ff716c', fontSize: '0.95rem' }}>
                      {pos ? '+' : ''}${p.unrealized_pnl.toFixed(2)}
                    </div>
                    <div className="label-sm" style={{ color: pos ? '#3fff8b' : '#ff716c' }}>
                      {pos ? '+' : ''}{p.unrealized_pnl_pct.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="position-details">
                  {[['Qty', p.quantity], ['Avg', `$${(p.avg_price||0).toFixed(2)}`], ['Now', `$${(p.current_price||0).toFixed(2)}`], ['Grade', `${p.ai_grade||'—'}/100`]].map(([l,v]) => (
                    <div key={l}>
                      <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{l}</div>
                      <div style={{ fontWeight: '600', fontSize: '0.85rem', marginTop: '0.15rem' }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="portfolio-summary-bar">
          {[['Invested', `$${totalInvested.toFixed(2)}`], ['Value', `$${totalValue.toFixed(2)}`], ['P&L', `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`]].map(([l, v]) => (
            <div key={l}>
              <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{l}</div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem', marginTop: '0.2rem' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ── Trade Timeline ── */
  const Timeline = () => {
    if (!tradeHistory.length) {
      return (
        <div className="glass-card hub-section hub-empty">
          <h3 className="hub-section-title">Trade Timeline</h3>
          <p className="hub-empty-text">No trade events yet. Events appear here after the bot executes.</p>
        </div>
      );
    }
    const sorted = [...tradeHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 8);
    return (
      <div className="glass-card hub-section">
        <h3 className="hub-section-title" style={{ marginBottom: '1.5rem' }}>Trade Timeline</h3>
        <div className="timeline-track">
          {sorted.map((t, i) => (
            <div key={`${t.symbol}-${t.timestamp}-${i}`} className="timeline-item">
              <div className={`timeline-dot ${t.side === 'BUY' ? 'buy' : 'sell'}`} />
              <div className="timeline-card">
                <div className="timeline-card-row">
                  <div>
                    <span className="ticker" style={{ fontSize: '1.05rem' }}>{t.symbol}</span>
                    <span className={`chip ${t.side === 'BUY' ? 'positive' : 'negative'}`} style={{ fontSize: '0.6rem', marginLeft: '0.5rem' }}>{t.side}</span>
                    {t.signal && <span className="chip" style={{ background: 'rgba(255,255,255,0.06)', fontSize: '0.58rem', marginLeft: '0.4rem' }}>{t.signal}</span>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{new Date(t.timestamp).toLocaleString()}</div>
                    {t.ai_grade != null && (
                      <div className="label-sm" style={{ color: t.ai_grade >= 80 ? '#3fff8b' : t.ai_grade < 50 ? '#ff716c' : '#ffd60a' }}>
                        Grade {t.ai_grade}
                      </div>
                    )}
                  </div>
                </div>
                <div className="label-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.4rem', textTransform: 'none', letterSpacing: 0, fontSize: '0.78rem' }}>
                  {t.quantity} shares @ ${(t.price || 0).toFixed(2)}
                  {' = '}<strong style={{ color: '#fff' }}>${((t.price||0)*(t.quantity||0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ── AI Intelligence Cards ── */
  const IntelligenceCards = () => {
    if (!botOnline) {
      return (
        <div className="glass-card offline-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="hub-section-title">Intelligence Engine Offline</div>
              <div className="hub-section-sub">Start backend/bot.py to activate AI Research & Discovery</div>
            </div>
            <div className="chip hold">OFFLINE</div>
          </div>
        </div>
      );
    }
    const symbols = Object.keys(researchReports).filter(k => !k.startsWith('_'));
    if (!symbols.length) {
      return (
        <div style={{ padding: '2rem', color: 'var(--on-surface-variant)', fontSize: '0.9rem' }}>
          AI Researcher initializing… click Run Now to kick off research.
        </div>
      );
    }
    return (
      <div className="intel-grid">
        {symbols.map(ticker => {
          const r = researchReports[ticker];
          const tech = botSignals?.[ticker];
          const grade = r?.ai_grade || 50;
          const gColor = grade > 80 ? '#3fff8b' : grade < 40 ? '#ff716c' : '#ffd60a';
          return (
            <div key={ticker} className="intel-card glass-card" style={{ '--aura': gColor, borderColor: grade > 80 || grade < 40 ? `${gColor}44` : 'rgba(255,255,255,0.08)' }}>
              <div className="intel-aura" style={{ background: gColor }} />

              {/* Top row */}
              <div className="intel-card-top">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="ticker" style={{ fontSize: '1.4rem' }}>{ticker}</div>
                    {r.type && (
                      <div className="chip" style={{
                        fontSize: '0.55rem', padding: '2px 7px',
                        background: r.type === 'DEEP VALUE' ? 'rgba(63,255,139,0.1)' : 'rgba(255,214,10,0.1)',
                        color: r.type === 'DEEP VALUE' ? '#3fff8b' : '#ffd60a',
                        border: '1px solid currentColor'
                      }}>{r.type}</div>
                    )}
                  </div>
                  <div style={{ fontSize: '0.82rem', fontWeight: '500', marginTop: '0.2rem', color: '#fff' }}>{r.name || ticker}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)', marginTop: '0.1rem' }}>
                    ${r.price.toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="label-md" style={{ color: gColor, fontSize: '0.6rem' }}>AI GRADE</div>
                  <div style={{ fontSize: '2rem', fontWeight: '800', color: gColor, letterSpacing: '-0.04em', lineHeight: 1 }}>{grade}</div>
                </div>
              </div>

              {/* Brief */}
              <div className="intel-brief">
                <div className="label-md" style={{ fontSize: '0.55rem', opacity: 0.4, marginBottom: '0.4rem' }}>RESEARCH BRIEF</div>
                <div style={{ fontSize: '0.82rem', lineHeight: '1.55', color: 'var(--on-surface)' }}>
                  {r.reasoning || 'Analyzing latest news catalysts…'}
                </div>
              </div>

              {/* Footer */}
              <div className="intel-card-footer">
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {tech?.signal && (
                    <div className={`chip ${tech.signal.includes('BUY') ? 'positive' : 'hold'}`} style={{ fontSize: '0.58rem' }}>
                      {tech.signal}
                    </div>
                  )}
                  <button
                    className="details-btn"
                    onClick={() => openStockModal(r)}
                  >
                    Details <ChevronRight size={12} />
                  </button>
                </div>
                <div className="label-md" style={{ fontSize: '0.55rem', opacity: 0.25 }}>
                  {new Date(r.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="page-enter">
      {/* Page hero */}
      <div className="hub-hero">
        <div>
          <h1 className="hub-title">Intelligence Hub</h1>
          <p className="hub-subtitle">Autonomous Deep Research · SPY Alpha Tracking</p>
        </div>
      </div>

      {/* Bento stats */}
      <HeroBento />

      {/* Research engine */}
      <ResearchStatus />

      {/* Portfolio */}
      <Portfolio />

      {/* Trade timeline */}
      <Timeline />

      {/* AI intel cards */}
      <section>
        <SectionHead icon={<Brain size={14} />} label="DEEP RESEARCH INTELLIGENCE" />
        <IntelligenceCards />
      </section>
    </div>
  );
}
