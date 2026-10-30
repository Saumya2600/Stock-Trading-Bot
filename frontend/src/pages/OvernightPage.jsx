import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, Moon, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';
const STATIC_BACKEND = !API_BASE || API_BASE.includes('githubusercontent.com');
const GREEN = '#3fff8b';
const RED = '#ff716c';
const AMBER = '#ffd60a';

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';
}

function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${number >= 0 ? '+' : ''}${number.toFixed(2)}%` : '—';
}

function signalColor(signal) {
  if (signal?.includes('BULLISH')) return GREEN;
  if (signal?.includes('BEARISH')) return RED;
  return AMBER;
}

function EventCard({ event }) {
  const color = signalColor(event.signal);
  const hasResults = event.status === 'released';
  const priceColor = Number(event.after_hours_change_pct) >= 0 ? GREEN : RED;
  const scoreLabel = hasResults && event.score !== null && event.score !== undefined
    ? `Score ${event.score}`
    : 'Score pending';

  return (
    <article className="glass-card overnight-card">
      <div className="overnight-card-header">
        <div>
          <div className="ticker">{event.symbol}</div>
          <div className="label-md" style={{ marginTop: '0.3rem' }}>
            {event.earnings_date} · {event.session}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color, fontWeight: 800, fontSize: '0.8rem' }}>{hasResults ? event.signal : 'SCHEDULED'}</div>
          <div className="label-md" style={{ marginTop: '0.3rem' }}>{scoreLabel}</div>
        </div>
      </div>

      <div className="overnight-metrics">
        <div>
          <span className="label-sm">EPS</span>
          <strong>{formatNumber(event.eps_actual)} <small>vs {formatNumber(event.eps_estimate)}</small></strong>
          <span className="overnight-subvalue">{formatPercent(event.eps_surprise_pct)}</span>
        </div>
        <div>
          <span className="label-sm">Revenue</span>
          <strong>{formatNumber(event.revenue_actual, 0)} <small>vs {formatNumber(event.revenue_estimate, 0)}</small></strong>
          <span className="overnight-subvalue">{formatPercent(event.revenue_surprise_pct)}</span>
        </div>
        <div>
          <span className="label-sm">Extended move</span>
          <strong style={{ color: hasResults ? priceColor : 'var(--on-surface)' }}>
            {formatPercent(event.after_hours_change_pct)}
          </strong>
          <span className="overnight-subvalue">volume {event.volume_ratio ? `${event.volume_ratio}x` : '—'}</span>
        </div>
        <div>
          <span className="label-sm">Guidance</span>
          <strong>{event.guidance_direction || 'UNKNOWN'}</strong>
          <span className="overnight-subvalue">{hasResults ? 'headline check' : 'not released'}</span>
        </div>
      </div>

      <p className="overnight-summary">{event.summary}</p>

      <div className="overnight-card-footer">
        <span className="label-sm">{hasResults ? 'RELEASED' : 'UPCOMING'} · SEC {event.sec_filing?.status || 'not checked'}</span>
        {event.sec_filing?.url && (
          <a href={event.sec_filing.url} target="_blank" rel="noreferrer" className="overnight-source-link">
            SEC filing <ExternalLink size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

function UpcomingCalendarCard({ event }) {
  const eventDate = new Date(`${event.earnings_date}T12:00:00`);
  const dateLabel = eventDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <article className="glass-card overnight-card calendar-card">
      <div className="overnight-card-header">
        <div>
          <div className="ticker">{event.symbol}</div>
          <div className="label-md" style={{ marginTop: '0.3rem' }}>{dateLabel}</div>
        </div>
        <div className="calendar-session">{event.session === 'UNKNOWN' ? 'TIME TBD' : event.session}</div>
      </div>
      <div className="overnight-metrics">
        <div>
          <span className="label-sm">EPS estimate</span>
          <strong>{formatNumber(event.eps_estimate)}</strong>
        </div>
        <div>
          <span className="label-sm">Revenue estimate</span>
          <strong>{formatNumber(event.revenue_estimate, 0)}</strong>
        </div>
        <div>
          <span className="label-sm">Status</span>
          <strong style={{ color: '#57bcff' }}>Scheduled</strong>
        </div>
        <div>
          <span className="label-sm">Analysis</span>
          <strong>Not released</strong>
        </div>
      </div>
      <div className="overnight-card-footer">
        <span className="label-sm">Calendar estimate · no order</span>
      </div>
    </article>
  );
}

export default function OvernightPage() {
  const [data, setData] = useState({ events: [], status: 'idle', sources: {} });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('analysis');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const url = STATIC_BACKEND
      ? `/overnight_analysis.json?t=${Date.now()}`
      : `${API_BASE}/overnight_analysis?t=${Date.now()}`;
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw new Error(`Overnight API returned ${response.status}`);
      setData(await response.json());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = async () => {
    if (STATIC_BACKEND) {
      setError('Live refresh needs VITE_API_BASE_URL pointing to Render.');
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/overnight_analysis/refresh`, {
        method: 'POST',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Refresh request returned ${response.status}`);
      window.setTimeout(load, 1200);
    } catch (refreshError) {
      setError(refreshError.message);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(load);
    const interval = window.setInterval(load, 30000);
    return () => window.clearInterval(interval);
  }, [load]);

  const released = useMemo(() => data.events.filter(event => event.status === 'released'), [data.events]);
  const upcoming = useMemo(() => data.events.filter(event => event.status === 'upcoming'), [data.events]);
  const upcomingByDate = useMemo(() => {
    return upcoming.reduce((groups, event) => {
      groups[event.earnings_date] = groups[event.earnings_date] || [];
      groups[event.earnings_date].push(event);
      return groups;
    }, {});
  }, [upcoming]);
  const calendarDays = useMemo(() => Object.keys(upcomingByDate).sort(), [upcomingByDate]);

  return (
    <div className="page-enter overnight-page">
      <header className="overnight-hero">
        <div>
          <div className="overnight-title-row">
            <Moon size={24} style={{ color: '#57bcff' }} />
            <h1 className="hub-title">Overnight Earnings</h1>
          </div>
          <p className="hub-subtitle">After-hours earnings analysis · no orders</p>
        </div>
        <div className="overnight-hero-actions">
          <button
            className="apple-btn apple-btn-secondary"
            onClick={() => setViewMode('calendar')}
            type="button"
          >
            <CalendarDays size={14} /> Earnings calendar
          </button>
          <button className="apple-btn apple-btn-secondary" onClick={refresh} disabled={refreshing || loading} type="button">
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </header>

      <div className="overnight-safety-banner">
        <ShieldCheck size={18} />
        <span><strong>Analysis only.</strong> This page never buys, sells, or calls broker order APIs.</span>
      </div>

      <div className="overnight-view-tabs" role="tablist" aria-label="Overnight earnings views">
        <button
          className={`overnight-view-tab ${viewMode === 'analysis' ? 'active' : ''}`}
          onClick={() => setViewMode('analysis')}
          role="tab"
          aria-selected={viewMode === 'analysis'}
        >
          <Moon size={14} /> Overnight analysis
        </button>
        <button
          className={`overnight-view-tab ${viewMode === 'calendar' ? 'active' : ''}`}
          onClick={() => setViewMode('calendar')}
          role="tab"
          aria-selected={viewMode === 'calendar'}
        >
          <CalendarDays size={14} /> Upcoming calendar · 7 days
        </button>
      </div>

      <div className="overnight-status-row">
        <span className={`status-dot ${data.status === 'error' ? 'offline' : 'online'}`} />
        <span>{data.status === 'refreshing' ? 'Refreshing free data…' : `Data ${data.status}`}</span>
        {data.last_refresh && <span className="label-sm">Last refresh {new Date(data.last_refresh).toLocaleString()}</span>}
      </div>

      {error && <div className="glass-card overnight-error">{error}</div>}
      {data.error && !error && <div className="glass-card overnight-error">{data.error}</div>}

      {viewMode === 'analysis' && !loading && released.length > 0 && (
        <section>
          <div className="overnight-section-heading">
            <h2 className="headline-md">Released</h2>
            <span className="label-md">{released.length} events</span>
          </div>
          <div className="overnight-grid">{released.map(event => <EventCard key={`${event.symbol}-${event.earnings_date}`} event={event} />)}</div>
        </section>
      )}

      {viewMode === 'analysis' && !loading && upcoming.length > 0 && (
        <section>
          <div className="overnight-section-heading">
            <h2 className="headline-md">Upcoming</h2>
            <span className="label-md">{upcoming.length} events</span>
          </div>
          <div className="overnight-grid">{upcoming.map(event => <EventCard key={`${event.symbol}-${event.earnings_date}`} event={event} />)}</div>
        </section>
      )}

      {viewMode === 'calendar' && !loading && upcoming.length > 0 && (
        <section>
          <div className="overnight-section-heading">
            <h2 className="headline-md">Upcoming earnings calendar</h2>
            <span className="label-md">{upcoming.length} scheduled</span>
          </div>
          <div className="overnight-day-list">
            {calendarDays.map(day => {
              const dateLabel = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              });
              return (
                <div key={day} className="overnight-day-group">
                  <div className="overnight-day-heading">
                    <CalendarDays size={15} />
                    <h3>{dateLabel}</h3>
                    <span className="label-md">{upcomingByDate[day].length} scheduled</span>
                  </div>
                  <div className="overnight-grid">
                    {upcomingByDate[day].map(event => (
                      <UpcomingCalendarCard key={`${event.symbol}-${event.earnings_date}`} event={event} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {loading && <div className="glass-card overnight-empty">Loading free earnings data…</div>}
      {!loading && ((viewMode === 'analysis' && !released.length && !upcoming.length) || (viewMode === 'calendar' && !upcoming.length)) && (
        <div className="glass-card overnight-empty">
          <TrendingUp size={28} style={{ opacity: 0.35 }} />
          <h2 className="headline-md">{viewMode === 'calendar' ? 'No upcoming earnings found' : 'No released events found'}</h2>
          <p>{viewMode === 'calendar'
            ? 'Finnhub returned no scheduled earnings for next seven days. Check API key and refresh.'
            : 'No released earnings in current data. Open Upcoming calendar to see scheduled events.'}</p>
        </div>
      )}

      <footer className="overnight-sources">
        <span className="label-sm">Sources: Finnhub calendar · SEC filings · Alpaca quotes · local scoring</span>
        <span className="label-sm">Rule score, not financial advice</span>
      </footer>
    </div>
  );
}
