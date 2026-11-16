import { useState, useEffect, useCallback } from 'react';
import { fetchPicksFromSupabase } from '../lib/supabase';
import { formatAtlanticDateTime, getAtlanticDateKey } from '../lib/dateTime';
import { Database, RefreshCw, Calendar, Star } from 'lucide-react';

const GREEN = 'var(--primary)';
const RED = 'var(--secondary)';
const AMBER = 'var(--warning)';

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: 'All', days: 365 },
];

function GradeBadge({ grade }) {
  const color = grade >= 80 ? GREEN : grade < 50 ? RED : AMBER;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.72rem',
        fontWeight: 700,
        color,
        background: 'rgba(255,255,255,0.04)',
        border: `1px solid ${color}`,
        borderRadius: '6px',
        padding: '1px 7px',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      <Star size={9} aria-hidden="true" /> {grade}
    </span>
  );
}

function RiskChip({ level }) {
  const color = { High: RED, Medium: AMBER, Low: GREEN }[level] || AMBER;
  return (
    <span
      style={{
        fontSize: '0.7rem',
        fontWeight: 600,
        color,
        border: `1px solid ${color}`,
        borderRadius: '5px',
        padding: '0 6px',
        opacity: 0.95,
      }}
    >
      {level}
    </span>
  );
}

export default function PicksHistoryPage({ embedded = false }) {
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('30D');
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const days = RANGES.find(r => r.label === range)?.days || 30;
    const { data, error: err } = await fetchPicksFromSupabase({ days, limit: 200 });
    if (err && typeof err === 'string') setError(err);
    else if (err) setError(err.message || 'Failed to load picks');
    else setPicks(data);
    setLoading(false);
  }, [range]);

  useEffect(() => { Promise.resolve().then(load); }, [load]);

  const grouped = picks.reduce((acc, p) => {
    const dateKey = getAtlanticDateKey(p.updated_at) || p.run_date;
    (acc[dateKey] = acc[dateKey] || []).push(p);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const configMissing = error === 'Supabase not configured';

  return (
    <div className="page-enter" aria-busy={loading} style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <header className="hub-hero">
        {!embedded && (
          <div>
            <h1 className="hub-title">Picks history</h1>
            <p className="hub-subtitle">Every daily research pick, stored in Supabase</p>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div
            role="group"
            aria-label="Date range"
            style={{
              display: 'flex',
              gap: '2px',
              padding: '3px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '10px',
              border: '1px solid var(--hairline)',
            }}
          >
            {RANGES.map(({ label }) => (
              <button
                key={label}
                onClick={() => setRange(label)}
                aria-pressed={range === label}
                className="range-pill"
                style={{
                  border: 'none',
                  background: range === label ? 'rgba(255,255,255,0.12)' : 'transparent',
                  color: range === label ? 'var(--on-surface)' : 'var(--on-surface-variant)',
                  padding: '5px 13px',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="apple-btn apple-btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spinner' : undefined} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </header>

      {configMissing && (
        <div className="inline-alert inline-alert--warn" role="status">
          <Database size={17} aria-hidden="true" />
          <div>
            <p className="inline-alert__title">Supabase is not connected</p>
            <p className="inline-alert__body">
              Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to your environment, then run the
              SQL migration that creates the <code>research_picks</code> table. Picks start saving on the next research run.
            </p>
          </div>
        </div>
      )}

      {error && !configMissing && (
        <div className="inline-alert" role="alert">
          <Database size={17} aria-hidden="true" />
          <div>
            <p className="inline-alert__title">Could not load picks</p>
            <p className="inline-alert__body">{error} Try refreshing, or widen the date range.</p>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }} aria-busy="true">
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '76px' }} />)}
        </div>
      )}

      {!loading && !error && picks.length === 0 && (
        <div className="glass-card state-block">
          <Database size={28} aria-hidden="true" />
          <p className="state-block__title">No picks in this range</p>
          <p className="state-block__body">
            Run research from the Intelligence Hub — picks save to Supabase after each scan. Widening the range may also help.
          </p>
        </div>
      )}

      {!loading && dates.map(date => {
        const dayPicks = [...grouped[date]].sort((a, b) => (b.ai_grade || 0) - (a.ai_grade || 0));
        const avgGrade = Math.round(dayPicks.reduce((s, p) => s + (p.ai_grade || 0), 0) / dayPicks.length);
        const fmt = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        return (
          <section key={date}>
            <div className="date-rule">
              <span className="date-rule__label">
                <Calendar size={11} aria-hidden="true" /> {fmt}
              </span>
              <span className="date-rule__line" aria-hidden="true" />
              <span className="date-rule__meta">{dayPicks.length} picks · avg grade {avgGrade}</span>
            </div>

            <div className="glass-card picks-table-card">
              <div className="picks-table-scroll">
                <div className="picks-table">
                  <div className="picks-table-head" aria-hidden="true">
                    <span>Symbol</span>
                    <span>Company</span>
                    <span style={{ textAlign: 'right' }}>Grade</span>
                    <span style={{ textAlign: 'right' }}>Price</span>
                    <span style={{ textAlign: 'right' }}>Target</span>
                    <span style={{ textAlign: 'center' }}>Risk</span>
                    <span style={{ textAlign: 'center' }}>Type</span>
                  </div>

                  {dayPicks.map(pick => {
                    const rowId = `${date}-${pick.symbol}`;
                    const isExpanded = expandedId === rowId;
                    const upside = pick.target_price && pick.price
                      ? ((pick.target_price - pick.price) / pick.price * 100).toFixed(1)
                      : null;

                    return (
                      <div key={rowId}>
                        <button
                          className="picks-row"
                          onClick={() => setExpandedId(isExpanded ? null : rowId)}
                          aria-expanded={isExpanded}
                          aria-controls={`picks-reasoning-${rowId}`}
                        >
                          <span className="picks-symbol">{pick.symbol}</span>
                          <span className="picks-name">{pick.name}</span>
                          <span style={{ textAlign: 'right' }}>
                            <GradeBadge grade={pick.ai_grade || 50} />
                          </span>
                          <span className="picks-num">{pick.price ? `$${Number(pick.price).toFixed(2)}` : '—'}</span>
                          <span className="picks-num" style={{ color: GREEN }}>
                            {pick.target_price ? `$${Number(pick.target_price).toFixed(2)}` : '—'}
                            {upside && <span className="picks-upside">+{upside}%</span>}
                          </span>
                          <span style={{ textAlign: 'center' }}>
                            <RiskChip level={pick.risk_level || 'Medium'} />
                          </span>
                          <span style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, color: pick.type === 'DEEP VALUE' ? GREEN : AMBER }}>
                            {pick.type || '—'}
                          </span>
                        </button>

                        <div
                          className={`report-body ${isExpanded ? 'open' : ''}`}
                          id={`picks-reasoning-${rowId}`}
                        >
                          <div className="report-body__inner">
                            <div className="picks-reasoning">
                              <div className="label-sm" style={{ marginBottom: '0.45rem' }}>AI research brief</div>
                              <p>{pick.reasoning || 'No reasoning recorded for this pick.'}</p>
                              {pick.updated_at && (
                                <div className="label-sm" style={{ marginTop: '0.55rem', fontSize: '0.7rem', textTransform: 'none', letterSpacing: 0 }}>
                                  Analyzed {formatAtlanticDateTime(pick.updated_at)} ADT/AST
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
