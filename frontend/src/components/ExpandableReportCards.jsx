import { useState } from 'react';
import { formatAtlanticDate, formatAtlanticTime } from '../lib/dateTime';
import Reveal from './motion/Reveal';
import {
  ChevronDown,
  ChevronUp,
  Calendar,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  ShieldCheck,
  Zap,
} from 'lucide-react';

const ReportCard = ({ symbol, data }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const aiGrade = data.ai_grade || 50;
  const gradeColor = aiGrade > 80 ? 'var(--primary)' : aiGrade < 40 ? 'var(--secondary)' : 'var(--warning)';
  const price = typeof data.price === 'number' ? data.price : 0;
  const targetPrice = typeof data.target_price === 'number' ? data.target_price : 0;
  const stopLoss = typeof data.stop_loss === 'number' ? data.stop_loss : 0;
  const catalysts = typeof data.key_catalysts === 'string' ? data.key_catalysts.split(';').filter(Boolean) : [];
  const upside = price > 0 ? ((targetPrice / price - 1) * 100).toFixed(1) : '0.0';

  return (
    <article className="glass-card report-card">
      <button
        className="report-card-header"
        onClick={() => setIsExpanded(open => !open)}
        aria-expanded={isExpanded}
        aria-controls={`report-body-${symbol}`}
      >
        <div className="report-card-summary">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
            <span className="ticker" style={{ fontSize: '1.3rem' }}>{symbol}</span>
            <span className="report-grade" style={{ background: gradeColor }}>{aiGrade}</span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="headline-md" style={{ marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.name || symbol}
            </div>
            <div className="label-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textTransform: 'none', letterSpacing: 0 }}>
              <Calendar size={11} aria-hidden="true" />
              {formatAtlanticDate(data.updated_at)} · {formatAtlanticTime(data.updated_at)} ADT/AST
            </div>
          </div>

          <div className="report-card-metrics">
            <div className="report-metric">
              <div className="label-sm">Price</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.15rem' }}>${price.toFixed(2)}</div>
            </div>
            <div className="report-metric">
              <div className="label-sm">Target</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, marginTop: '0.15rem', color: 'var(--primary)' }}>${targetPrice.toFixed(2)}</div>
            </div>
            <div className="report-metric">
              <div className="label-sm">Risk</div>
              <div style={{ marginTop: '0.15rem' }}>
                <span className={`chip ${data.risk_level === 'High' ? 'negative' : data.risk_level === 'Low' ? 'positive' : 'hold'}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                  {data.risk_level || 'Medium'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <span className="report-toggle" aria-hidden="true">
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </span>
      </button>

      <div className={`report-body ${isExpanded ? 'open' : ''}`} id={`report-body-${symbol}`}>
        <div className="report-body__inner">
          <div className="report-body__content">
            <div className="report-columns">
              <div className="report-stack">
                <section>
                  <h3 className="label-md" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.6rem', color: 'var(--on-surface)' }}>
                    <Zap size={13} color="var(--primary)" aria-hidden="true" /> Executive reasoning
                  </h3>
                  <p className="report-prose">{data.reasoning || 'No reasoning was recorded for this scan.'}</p>
                </section>

                <div className="mini-grid">
                  <div className="sub-panel sub-panel--bull">
                    <h4 className="label-sm" style={{ color: 'var(--primary)' }}>
                      <TrendingUp size={12} aria-hidden="true" /> Bull thesis
                    </h4>
                    <p>{data.bull_case || 'Not provided.'}</p>
                  </div>
                  <div className="sub-panel sub-panel--bear">
                    <h4 className="label-sm" style={{ color: 'var(--secondary)' }}>
                      <TrendingDown size={12} aria-hidden="true" /> Bear risks
                    </h4>
                    <p>{data.bear_case || 'Not provided.'}</p>
                  </div>
                </div>
              </div>

              <div className="report-stack">
                {data.fundamentals && (
                  <div className="sub-panel">
                    <h4 className="label-md" style={{ color: 'var(--on-surface)' }}>Fundamental ledger</h4>
                    <div className="mini-grid">
                      {[
                        ['P/E', data.fundamentals.pe],
                        ['PEG', data.fundamentals.peg],
                        ['Debt / equity', data.fundamentals.debt_to_equity],
                        ['Sector', data.fundamentals.sector],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <div className="label-sm">{label}</div>
                          <div style={{ fontSize: '0.88rem', fontWeight: 600, marginTop: '0.1rem' }}>{value || 'N/A'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {catalysts.length > 0 && (
                  <div className="sub-panel">
                    <h4 className="label-md" style={{ color: 'var(--on-surface)' }}>Key catalysts</h4>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                      {catalysts.map((catalyst, i) => (
                        <li key={i} style={{ display: 'flex', gap: '0.55rem', alignItems: 'flex-start' }}>
                          <span style={{ marginTop: '6px', width: 5, height: 5, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} aria-hidden="true" />
                          <span style={{ fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--on-surface-muted)' }}>{catalyst.trim()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mini-grid">
                  <div className="mini-cell">
                    <div className="label-sm">Entry limit</div>
                    <strong>${price.toFixed(2)}</strong>
                  </div>
                  <div className="mini-cell">
                    <div className="label-sm">Stop loss (ATR)</div>
                    <strong style={{ color: 'var(--secondary)' }}>${stopLoss.toFixed(2)}</strong>
                  </div>
                  {(data.support_level || data.resistance_level) && (
                    <>
                      <div className="mini-cell" style={{ background: 'rgba(63,255,139,0.05)', borderColor: 'rgba(63,255,139,0.14)' }}>
                        <div className="label-sm">Support</div>
                        <strong style={{ color: 'var(--primary)' }}>${Number(data.support_level || 0).toFixed(2)}</strong>
                      </div>
                      <div className="mini-cell" style={{ background: 'rgba(255,113,108,0.05)', borderColor: 'rgba(255,113,108,0.14)' }}>
                        <div className="label-sm">Resistance</div>
                        <strong style={{ color: 'var(--secondary)' }}>${Number(data.resistance_level || 0).toFixed(2)}</strong>
                      </div>
                    </>
                  )}
                </div>

                <div className="alpha-strip">
                  <div>
                    <div className="label-sm" style={{ color: 'var(--primary)' }}>Projected upside</div>
                    <div className="alpha-strip__value">+{upside}%</div>
                  </div>
                  <ShieldCheck size={26} style={{ color: 'var(--primary)', opacity: 0.5 }} aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

const ExpandableReportCards = ({ reports = {} }) => {
  const symbols = Object.keys(reports).filter(k => !k.startsWith('_'));

  if (symbols.length === 0) {
    return (
      <div className="glass-card state-block">
        <Lightbulb size={30} aria-hidden="true" />
        <p className="state-block__title">No research reports yet</p>
        <p className="state-block__body">
          Run the research engine from the Intelligence Hub and each graded setup lands here with its full thesis.
        </p>
      </div>
    );
  }

  const sorted = [...symbols].sort((a, b) => (reports[b].ai_grade || 0) - (reports[a].ai_grade || 0));

  return (
    <div className="page-enter">
      <header className="page-head">
        <div>
          <h1 className="display-lg">Deep Research</h1>
          <p className="headline-sm" style={{ marginTop: '0.4rem' }}>
            Autonomous multi-factor discovery and risk assessment
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="label-sm">Live reports</div>
          <div className="headline-md" style={{ fontSize: '1.35rem', marginTop: '0.15rem' }}>{symbols.length}</div>
        </div>
      </header>

      <Reveal className="report-list" y={24} stagger={0.06}>
        {sorted.map(symbol => (
          <ReportCard key={symbol} symbol={symbol} data={reports[symbol]} />
        ))}
      </Reveal>
    </div>
  );
};

export default ExpandableReportCards;
