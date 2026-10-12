import { useState, useEffect, useCallback } from 'react';
import { fetchPicksFromSupabase } from '../lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { Database, TrendingUp, TrendingDown, Minus, RefreshCw, Calendar, Star } from 'lucide-react';

const EASE = [0.16, 1, 0.3, 1];
const GREEN = '#3fff8b';
const RED = '#ff716c';
const AMBER = '#ffd60a';

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: 'All', days: 365 },
];

function GradeBadge({ grade }) {
  const color = grade >= 80 ? GREEN : grade < 50 ? RED : AMBER;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
      fontSize: '0.75rem', fontWeight: '700', color,
      background: `${color}18`, border: `1px solid ${color}44`,
      borderRadius: '6px', padding: '2px 8px',
    }}>
      <Star size={10} /> {grade}
    </div>
  );
}

function RiskChip({ level }) {
  const colors = { High: RED, Medium: AMBER, Low: GREEN };
  const c = colors[level] || AMBER;
  return (
    <span style={{
      fontSize: '0.65rem', fontWeight: '600', color: c,
      background: `${c}18`, border: `1px solid ${c}33`,
      borderRadius: '4px', padding: '1px 6px',
    }}>{level}</span>
  );
}

export default function PicksHistoryPage() {
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

  useEffect(() => { load(); }, [load]);

  // Group by run_date
  const grouped = picks.reduce((acc, p) => {
    (acc[p.run_date] = acc[p.run_date] || []).push(p);
    return acc;
  }, {});
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const configMissing = error === 'Supabase not configured';

  return (
    <div className="page-enter" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div className="hub-hero">
        <div>
          <h1 className="hub-title">Picks History</h1>
          <p className="hub-subtitle">Daily AI research picks · Stored in Supabase</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Range tabs */}
          <div style={{
            display: 'flex', gap: '3px', padding: '3px',
            background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            {RANGES.map(({ label }) => (
              <button
                key={label}
                onClick={() => setRange(label)}
                style={{
                  padding: '5px 14px', borderRadius: '7px', border: 'none',
                  background: range === label ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: range === label ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >{label}</button>
            ))}
          </div>
          <button
            className="apple-btn apple-btn-secondary"
            onClick={load}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* Config warning */}
      {configMissing && (
        <div className="glass-card" style={{ borderColor: `${AMBER}33`, background: `${AMBER}08` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
            <Database size={20} style={{ color: AMBER, marginTop: '0.1rem', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: '700', color: AMBER, marginBottom: '0.4rem' }}>Supabase not configured</div>
              <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.6 }}>
                Add <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>VITE_SUPABASE_URL</code> and{' '}
                <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>VITE_SUPABASE_ANON_KEY</code>{' '}
                to your <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>.env</code> file,
                then run the SQL migration in Supabase to create the <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '4px' }}>research_picks</code> table.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !configMissing && (
        <div className="glass-card" style={{ borderColor: `${RED}33` }}>
          <span style={{ color: RED }}>Error: {error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="glass-card" style={{ height: '80px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && picks.length === 0 && (
        <div className="glass-card hub-empty">
          <Database size={32} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <h3 className="hub-section-title">No picks yet</h3>
          <p className="hub-empty-text">
            Run research from the Intelligence Hub — picks auto-save to Supabase after each run.
          </p>
        </div>
      )}

      {/* Picks grouped by date */}
      {!loading && dates.map(date => {
        const dayPicks = grouped[date].sort((a, b) => (b.ai_grade || 0) - (a.ai_grade || 0));
        const avgGrade = Math.round(dayPicks.reduce((s, p) => s + (p.ai_grade || 0), 0) / dayPicks.length);
        const fmt = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

        return (
          <div key={date}>
            {/* Date header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              marginBottom: '0.75rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <Calendar size={11} /> {fmt}
              </div>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)' }}>{dayPicks.length} picks · avg grade {avgGrade}</span>
            </div>

            {/* Picks table card */}
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr 60px 80px 80px 70px 70px',
                gap: '0.5rem',
                padding: '0.6rem 1.25rem',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: '0.65rem', fontWeight: '600', textTransform: 'uppercase',
                letterSpacing: '0.06em', color: 'rgba(255,255,255,0.3)',
              }}>
                <span>Symbol</span>
                <span>Name</span>
                <span style={{ textAlign: 'right' }}>Grade</span>
                <span style={{ textAlign: 'right' }}>Price</span>
                <span style={{ textAlign: 'right' }}>Target</span>
                <span style={{ textAlign: 'center' }}>Risk</span>
                <span style={{ textAlign: 'center' }}>Type</span>
              </div>

              {dayPicks.map((pick, idx) => {
                const isExpanded = expandedId === `${date}-${pick.symbol}`;
                const upside = pick.target_price && pick.price
                  ? ((pick.target_price - pick.price) / pick.price * 100).toFixed(1)
                  : null;
                const gColor = (pick.ai_grade || 50) >= 80 ? GREEN : (pick.ai_grade || 50) < 50 ? RED : AMBER;

                return (
                  <div key={pick.symbol}>
                    <motion.div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 1fr 60px 80px 80px 70px 70px',
                        gap: '0.5rem',
                        padding: '0.75rem 1.25rem',
                        borderBottom: idx < dayPicks.length - 1 || isExpanded ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        cursor: 'pointer',
                        alignItems: 'center',
                      }}
                      whileHover={{ background: 'rgba(255,255,255,0.025)' }}
                      transition={{ duration: 0.15 }}
                      onClick={() => setExpandedId(isExpanded ? null : `${date}-${pick.symbol}`)}
                    >
                      <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.95rem', color: '#fff' }}>{pick.symbol}</span>
                      <span style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.65)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.name}</span>
                      <div style={{ textAlign: 'right' }}><GradeBadge grade={pick.ai_grade || 50} /></div>
                      <span style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                        {pick.price ? `$${Number(pick.price).toFixed(2)}` : '—'}
                      </span>
                      <span style={{ textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: GREEN, fontVariantNumeric: 'tabular-nums' }}>
                        {pick.target_price ? `$${Number(pick.target_price).toFixed(2)}` : '—'}
                        {upside && <span style={{ fontSize: '0.65rem', color: GREEN, display: 'block' }}>+{upside}%</span>}
                      </span>
                      <div style={{ textAlign: 'center' }}><RiskChip level={pick.risk_level || 'Medium'} /></div>
                      <div style={{ textAlign: 'center' }}>
                        {pick.type ? (
                          <span style={{
                            fontSize: '0.62rem', fontWeight: '600', padding: '2px 6px', borderRadius: '4px',
                            background: pick.type === 'DEEP VALUE' ? 'rgba(63,255,139,0.1)' : 'rgba(255,214,10,0.1)',
                            color: pick.type === 'DEEP VALUE' ? GREEN : AMBER,
                          }}>{pick.type}</span>
                        ) : '—'}
                      </div>
                    </motion.div>

                    {/* Expanded reasoning */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: EASE }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{
                            padding: '1rem 1.25rem 1.25rem',
                            background: `${gColor}06`,
                            borderLeft: `3px solid ${gColor}44`,
                            borderBottom: idx < dayPicks.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.3)', marginBottom: '0.5rem' }}>AI Research Brief</div>
                            <p style={{ fontSize: '0.85rem', lineHeight: 1.65, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
                              {pick.reasoning || 'No reasoning recorded.'}
                            </p>
                            {pick.updated_at && (
                              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', marginTop: '0.6rem' }}>
                                Analyzed {new Date(pick.updated_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } } @keyframes pulse { 0%,100% { opacity: 0.3 } 50% { opacity: 0.6 } }`}</style>
    </div>
  );
}
