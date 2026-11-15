import { useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Brain, TrendingUp, Activity, Clock, Zap, ChevronRight, Database, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatAtlanticDateTime, formatAtlanticTime } from '../lib/dateTime';
import Reveal from '../components/motion/Reveal';
import CountUp from '../components/motion/CountUp';
import { gsap, useGSAP, prefersReducedMotion, EASE } from '../lib/gsapSetup';

const money = (value, digits = 2) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const sign = num < 0 ? '-' : '';
  return `${sign}$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
};

function StatCell({ label, value, sub, accent }) {
  return (
    <div className="stat-cell">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function SectionTitle({ icon, title, count }) {
  return (
    <h2 className="section-title">
      {icon}
      <span>{title}</span>
      <span className="section-rule" aria-hidden="true" />
      {count != null && <span className="section-title__count">{count}</span>}
    </h2>
  );
}

/* ── Alpha + scalar facts ── */
function HeroBento({ performance, positions, tradeHistory, reportCount, botOnline }) {
  const root = useRef(null);
  const hasPerf = performance && performance.bot_roi != null;

  /* The one authored entrance: the alpha card settles, tiles flip up in
     sequence behind it. Runs once per mount, skipped for reduced motion. */
  useGSAP(() => {
    if (prefersReducedMotion() || !root.current) return undefined;

    const tl = gsap.timeline({ defaults: { ease: EASE.out } });
    tl.from(root.current.querySelector('.hero-bento-main'), { y: 24, opacity: 0, duration: 0.9 }, 0)
      .from(root.current.querySelectorAll('.hero-stat-card'), {
        y: 34,
        opacity: 0,
        rotateX: -18,
        transformOrigin: '50% 0%',
        duration: 0.9,
        stagger: 0.085,
      }, 0.06);

    return () => tl.kill();
  }, { scope: root });
  const totalPnL = positions?.total_unrealized_pnl || 0;
  const portfolioValue = positions?.total_value || 0;
  const alpha = hasPerf ? (performance.bot_roi - performance.spy_roi).toFixed(2) : null;
  const isWinning = hasPerf && performance.bot_roi > performance.spy_roi;

  return (
    <div className="hero-bento" ref={root}>
      <div className="hero-bento-main glass-card">
        <div className="hero-bento-eyebrow">
          <span className={`status-dot ${botOnline ? 'online' : 'offline'}`} aria-hidden="true" />
          <span className="label-md">Intelligence engine</span>
        </div>
        {hasPerf ? (
          <>
            <div className="hero-alpha" style={{ color: isWinning ? 'var(--primary)' : 'var(--secondary)' }}>
              <CountUp value={Number(alpha)} decimals={2} prefix={isWinning ? '+' : ''} suffix="%" duration={1.4} />
            </div>
            <div className="label-md" style={{ marginTop: '0.4rem' }}>Alpha vs SPY</div>
          </>
        ) : (
          <div className="hero-alpha-placeholder">
            <Brain size={28} style={{ color: 'var(--on-surface-variant)', flexShrink: 0 }} aria-hidden="true" />
            <div>
              <div style={{ fontSize: '1.05rem', fontWeight: 650, letterSpacing: '-0.02em', marginBottom: '0.2rem' }}>
                No benchmark yet
              </div>
              <div className="stat-sub">
                Alpha appears once the bot has closed trades to measure against SPY.
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="hero-bento-stats">
        <div className="glass-card hero-stat-card">
          <TrendingUp size={15} style={{ color: 'var(--primary)' }} aria-hidden="true" />
          <StatCell
            label="Bot ROI"
            value={hasPerf ? <CountUp value={performance.bot_roi} decimals={2} suffix="%" /> : '—'}
            accent={hasPerf ? (performance.bot_roi >= 0 ? 'var(--primary)' : 'var(--secondary)') : undefined}
          />
        </div>
        <div className="glass-card hero-stat-card">
          <Activity size={15} style={{ color: 'var(--tertiary)' }} aria-hidden="true" />
          <StatCell
            label={positions?.positions?.length ? 'Portfolio' : 'Paper cash'}
            value={portfolioValue > 0 ? <CountUp value={portfolioValue} prefix="$" /> : '—'}
            sub={totalPnL !== 0 ? `${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(0)} P&L` : null}
            accent={portfolioValue > 0 ? (totalPnL >= 0 ? 'var(--primary)' : 'var(--secondary)') : undefined}
          />
        </div>
        <div className="glass-card hero-stat-card">
          <Zap size={15} style={{ color: 'var(--warning)' }} aria-hidden="true" />
          <StatCell label="Trades" value={tradeHistory.length ? <CountUp value={tradeHistory.length} /> : '—'} sub="since inception" />
        </div>
        <div className="glass-card hero-stat-card">
          <Clock size={15} style={{ color: 'var(--on-surface-variant)' }} aria-hidden="true" />
          <StatCell label="Research" value={reportCount ? <CountUp value={reportCount} /> : '—'} sub="stocks analyzed" />
        </div>
      </div>
    </div>
  );
}

/* ── Research engine ── */
function ResearchStatus({
  researchStatus,
  manualResearchLoading, setManualResearchLoading,
  researchClearing, setResearchClearing,
  setResearchReports, API_BASE,
}) {
  if (!researchStatus) return null;

  const lastRun = researchStatus.last_run
    ? `${formatAtlanticDateTime(researchStatus.last_run)} ADT/AST`
    : 'None yet';
  const isOpen = researchStatus.market_open;
  const nextOpen = researchStatus.next_market_open_sec != null
    ? `${Math.floor(researchStatus.next_market_open_sec / 3600)}h ${Math.floor((researchStatus.next_market_open_sec % 3600) / 60)}m`
    : '—';
  const symbols = (researchStatus.research_symbols || []).slice(0, 8).join(', ') || 'None yet';
  const busy = manualResearchLoading || researchClearing;

  return (
    <div className="glass-card hub-section">
      <div className="hub-section-header">
        <div>
          <h2 className="hub-section-title">Research engine</h2>
          <div className="hub-section-sub">
            Market is{' '}
            <span style={{ color: isOpen ? 'var(--primary)' : 'var(--warning)', fontWeight: 650 }}>
              {isOpen ? 'open' : 'closed'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="apple-btn apple-btn-primary"
            disabled={busy}
            onClick={async () => {
              setManualResearchLoading(true);
              setResearchReports({});
              try { await fetch(`${API_BASE}/trigger_research`, { method: 'POST' }); }
              catch (e) { console.error(e); }
              setManualResearchLoading(false);
            }}
          >
            {manualResearchLoading ? (
              <><Loader2 size={14} className="spinner" aria-hidden="true" /> Running…</>
            ) : 'Run research'}
          </button>
          <button
            className="apple-btn apple-btn-secondary"
            disabled={busy}
            onClick={async () => {
              setResearchClearing(true);
              setResearchReports({});
              try { await fetch(`${API_BASE}/clear_research`, { method: 'POST' }); }
              catch (e) { console.error(e); }
              setResearchClearing(false);
            }}
          >
            {researchClearing ? 'Clearing…' : 'Clear results'}
          </button>
        </div>
      </div>

      <div className="research-meta-grid">
        <div>
          <div className="label-sm">Last run</div>
          <div className="meta-value">{lastRun}</div>
        </div>
        <div>
          <div className="label-sm">Stocks analyzed</div>
          <div className="meta-value">{researchStatus.research_count || 0}</div>
        </div>
        <div>
          <div className="label-sm">Next open</div>
          <div className="meta-value">{nextOpen}</div>
        </div>
        <div>
          <div className="label-sm">Latest symbols</div>
          <div className="meta-value" style={{ color: 'var(--on-surface-variant)', fontSize: '0.88rem' }}>{symbols}</div>
        </div>
      </div>
    </div>
  );
}

/* ── Portfolio ── */
function Portfolio({ positions }) {
  if (!positions?.positions?.length) {
    return (
      <div className="glass-card hub-section">
        <h2 className="hub-section-title">Portfolio positions</h2>
        <p className="hub-empty-text">No open positions. The bot is waiting for a high-conviction setup.</p>
      </div>
    );
  }

  const totalPnL = positions.total_unrealized_pnl || 0;
  const totalValue = positions.total_value || 0;
  const totalInvested = positions.total_invested || 0;
  const pct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
  const pnlColor = totalPnL >= 0 ? 'var(--primary)' : 'var(--secondary)';

  return (
    <div className="glass-card hub-section">
      <div className="hub-section-header">
        <div>
          <h2 className="hub-section-title">Portfolio positions</h2>
          <div className="hub-section-sub">{positions.is_live_alpaca ? 'Live from Alpaca' : 'Benchmarked against SPY'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.03em', color: pnlColor }}>
            <CountUp
              value={Math.abs(totalPnL)}
              decimals={2}
              prefix={totalPnL >= 0 ? '+$' : '-$'}
            />
          </div>
          <div className="label-md" style={{ color: pnlColor }}>
            {pct >= 0 ? '+' : ''}{pct.toFixed(2)}% P&L
          </div>
        </div>
      </div>

      <Reveal className="position-grid">
        {positions.positions.map(p => {
          const up = (p.unrealized_pnl || 0) >= 0;
          const pnlPct = Number(p.unrealized_pnl_pct);
          const met = p.sell_target_price ? p.current_price >= p.sell_target_price : false;
          return (
            <div key={p.symbol} className={`position-card ${met ? 'target-met' : ''}`}>
              {met && <div className="target-badge">Target met</div>}
              <div className="position-card-header">
                <div style={{ minWidth: 0 }}>
                  <div className="ticker" style={{ fontSize: '1.1rem' }}>{p.symbol}</div>
                  <div className="label-sm" style={{ marginTop: '0.2rem', textTransform: 'none', letterSpacing: 0, fontSize: '0.72rem' }}>
                    {p.name}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 650, color: up ? 'var(--primary)' : 'var(--secondary)', fontSize: '0.95rem' }}>
                    {up ? '+' : ''}{money(p.unrealized_pnl)}
                  </div>
                  <div className="label-sm" style={{ color: up ? 'var(--primary)' : 'var(--secondary)' }}>
                    {Number.isFinite(pnlPct) ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : '—'}
                  </div>
                </div>
              </div>
              <div className="position-details">
                {[
                  ['Qty', Number(p.quantity || 0).toLocaleString('en-US')],
                  ['Avg', money(p.avg_price || 0)],
                  ['Now', money(p.current_price || 0)],
                  ['Grade', `${p.ai_grade || '—'}/100`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <div className="label-sm">{label}</div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginTop: '0.15rem' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </Reveal>

      <div className="portfolio-summary-bar">
        {[
          ['Invested', money(totalInvested)],
          ['Value', money(totalValue)],
          ['P&L', `${totalPnL >= 0 ? '+' : ''}${money(totalPnL)}`],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="label-sm">{label}</div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem', marginTop: '0.2rem' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Trade timeline ── */
function Timeline({ tradeHistory }) {
  if (!tradeHistory.length) {
    return (
      <div className="glass-card hub-section">
        <h2 className="hub-section-title">Trade timeline</h2>
        <p className="hub-empty-text">No executions yet. Events appear here the moment the bot fills an order.</p>
      </div>
    );
  }

  const sorted = [...tradeHistory]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 8);

  return (
    <div className="glass-card hub-section">
      <h2 className="hub-section-title" style={{ marginBottom: '1.25rem' }}>Trade timeline</h2>
      <Reveal className="timeline-track" x={-14} y={12} stagger={0.05}>
        {sorted.map((t, i) => (
          <div key={`${t.symbol}-${t.timestamp}-${i}`} className="timeline-item">
            <div className={`timeline-dot ${t.side === 'BUY' ? 'buy' : 'sell'}`} aria-hidden="true" />
            <div className="timeline-card">
              <div className="timeline-card-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <span className="ticker" style={{ fontSize: '1rem' }}>{t.symbol}</span>
                  <span className={`chip ${t.side === 'BUY' ? 'positive' : 'negative'}`} style={{ fontSize: '0.7rem' }}>{t.side}</span>
                  {t.signal && <span className="chip" style={{ fontSize: '0.7rem' }}>{t.signal}</span>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="label-sm" style={{ textTransform: 'none', letterSpacing: 0 }}>{formatAtlanticDateTime(t.timestamp)} ADT/AST</div>
                  {t.ai_grade != null && (
                    <div className="label-sm" style={{ color: t.ai_grade >= 80 ? 'var(--primary)' : t.ai_grade < 50 ? 'var(--secondary)' : 'var(--warning)' }}>
                      Grade {t.ai_grade}
                    </div>
                  )}
                </div>
              </div>
              <div className="trade-card__qty" style={{ marginTop: '0.45rem' }}>
                {Number(t.quantity || 0).toLocaleString('en-US')} shares @ ${(t.price || 0).toFixed(2)}
                {' = '}
                <strong>${((t.price || 0) * (t.quantity || 0)).toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
              </div>
            </div>
          </div>
        ))}
      </Reveal>
    </div>
  );
}

/* ── AI intel cards ── */
function IntelligenceCards({ reportSymbols, researchReports, botSignals, botOnline, openStockModal }) {
  if (!reportSymbols.length) {
    return (
      <div className="glass-card offline-card" style={{ padding: '1.25rem 1.4rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div className="hub-section-title">{botOnline ? 'No fresh scan yet' : 'Engine is waking up'}</div>
            <div className="hub-section-sub">
              {botOnline ? 'Run research to fill this feed with graded setups.' : 'Connecting to the cloud trading engine…'}
            </div>
          </div>
          <div className={`chip ${botOnline ? 'hold' : 'negative'}`}>{botOnline ? 'IDLE' : 'CONNECTING'}</div>
        </div>
      </div>
    );
  }

  return (
    <Reveal className="intel-grid" y={34} stagger={0.075}>
      {reportSymbols.map(ticker => {
        const r = researchReports[ticker] || {};
        const tech = botSignals?.[ticker];
        const grade = r.ai_grade || 50;
        const gColor = grade > 80 ? 'var(--primary)' : grade < 40 ? 'var(--secondary)' : 'var(--warning)';
        const gradeBorder = grade > 80 ? 'rgba(63,255,139,0.3)' : grade < 40 ? 'rgba(255,113,108,0.3)' : undefined;

        return (
          <article key={ticker} className="intel-card glass-card" style={{ borderColor: gradeBorder }}>
            <div className="intel-card-top">
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span className="ticker" style={{ fontSize: '1.3rem' }}>{ticker}</span>
                  {r.type && (
                    <span
                      className="chip"
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 7px',
                        color: r.type === 'DEEP VALUE' ? 'var(--primary)' : 'var(--warning)',
                        borderColor: 'currentColor',
                        background: 'transparent',
                      }}
                    >
                      {r.type}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 500, marginTop: '0.2rem', color: 'var(--on-surface)' }}>
                  {r.name || ticker}
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--on-surface-variant)', marginTop: '0.1rem' }}>
                  ${Number(r.price || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label-md" style={{ fontSize: '0.7rem' }}>AI grade</div>
                <div style={{ fontSize: '1.9rem', fontWeight: 700, color: gColor, letterSpacing: '-0.035em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {grade}
                </div>
              </div>
            </div>

            <div className="intel-brief">
              <div className="label-md" style={{ fontSize: '0.7rem', marginBottom: '0.4rem' }}>Research brief</div>
              <p className="intel-brief-text" style={{ margin: 0 }}>
                {r.reasoning || 'Analyzing the latest news catalysts…'}
              </p>
            </div>

            <div className="intel-card-footer">
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                {tech?.signal && (
                  <span className={`chip ${tech.signal.includes('BUY') ? 'positive' : 'hold'}`} style={{ fontSize: '0.7rem' }}>
                    {tech.signal}
                  </span>
                )}
                <button className="details-btn" onClick={() => openStockModal(r)} aria-label={`Open details for ${ticker}`}>
                  Details <ChevronRight size={12} aria-hidden="true" />
                </button>
              </div>
              <div className="label-md" style={{ fontSize: '0.7rem' }}>
                {formatAtlanticTime(r.updated_at)} ADT/AST
              </div>
            </div>
          </article>
        );
      })}
    </Reveal>
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

  const reportSymbols = Object.keys(researchReports || {}).filter(k => !k.startsWith('_'));

  return (
    <div className="page-enter">
      <header className="hub-hero">
        <div>
          <h1 className="hub-title">Intelligence Hub</h1>
          <p className="hub-subtitle">Autonomous deep research · SPY alpha tracking</p>
        </div>
        <Link to="/picks" className="supa-badge">
          <Database size={10} aria-hidden="true" /> Picks database
        </Link>
      </header>

      <HeroBento
        performance={performance}
        positions={positions}
        tradeHistory={tradeHistory}
        reportCount={reportSymbols.length}
        botOnline={botOnline}
      />

      <ResearchStatus
        researchStatus={researchStatus}
        manualResearchLoading={manualResearchLoading}
        setManualResearchLoading={setManualResearchLoading}
        researchClearing={researchClearing}
        setResearchClearing={setResearchClearing}
        setResearchReports={setResearchReports}
        API_BASE={API_BASE}
      />

      <Portfolio positions={positions} />
      <Timeline tradeHistory={tradeHistory} />

      <section>
        <SectionTitle
          icon={<Brain size={15} aria-hidden="true" />}
          title="Deep research intelligence"
          count={reportSymbols.length ? `${reportSymbols.length} analyzed` : null}
        />
        <IntelligenceCards
          reportSymbols={reportSymbols}
          researchReports={researchReports}
          botSignals={botSignals}
          botOnline={botOnline}
          openStockModal={openStockModal}
        />
      </section>
    </div>
  );
}
