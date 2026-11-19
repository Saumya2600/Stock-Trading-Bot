import { useEffect, useState } from 'react';
import { Globe2, Info, Layers, TrendingDown, TrendingUp } from 'lucide-react';
import Reveal from '../components/motion/Reveal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function Change({ value }) {
  if (value == null) return <span className="cad-metric__value">—</span>;
  const positive = value >= 0;
  return (
    <span className={`cad-metric__value ${positive ? 'is-up' : 'is-down'}`}>
      {positive ? '+' : ''}{value.toFixed(2)}%
    </span>
  );
}

function Premium({ value }) {
  if (value == null) return <span className="chip">NAV n/a</span>;
  const positive = value >= 0;
  return (
    <span className={`chip ${positive ? 'hold' : 'positive'}`} title="Price versus net asset value">
      {positive ? '+' : ''}{value.toFixed(2)}% to NAV
    </span>
  );
}

const STATE_LABEL = {
  in_zone: 'In buy zone',
  below_zone: 'Below zone',
  stretched: 'Stretched',
  wait: 'Wait for pullback',
};

function Levels({ row }) {
  const levels = row.levels;
  if (!levels) return null;

  return (
    <div className="cad-levels">
      <div className={`cad-state is-${levels.tone}`}>
        <span className="cad-state__label">{STATE_LABEL[levels.state] || levels.state}</span>
        <span className="cad-state__detail">{levels.detail}</span>
      </div>
      <dl className="cad-level-grid">
        <div>
          <dt>Buy zone</dt>
          <dd>${levels.zone_low} to ${levels.zone_high}</dd>
        </div>
        <div>
          <dt>Stop</dt>
          <dd>${levels.stop}</dd>
        </div>
        <div>
          <dt>Target 1</dt>
          <dd>${levels.target_one}</dd>
        </div>
        <div>
          <dt>Reward / risk</dt>
          <dd>{levels.reward_risk != null ? `${levels.reward_risk}:1` : '—'}</dd>
        </div>
      </dl>
    </div>
  );
}

const VERDICT_LABEL = {
  accumulate: 'Keep buying',
  hold: 'Buy slowly',
  wait: 'Wait for trend',
};

function money(value) {
  if (value == null) return '—';
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value}`;
}

function signed(value) {
  if (value == null) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/* The mechanical levels answer "where is the pullback entry". This block adds
   the slower read a long hold needs: trend on the 50/200-day, how deep the
   recent hole was, and what the fund charges. */
function LongTermPlan({ row }) {
  const plan = row.long_term;
  if (!plan) return null;

  return (
    <div className="cad-levels">
      <div className={`cad-state is-${plan.tone}`}>
        <span className="cad-state__label">
          Long-term · {VERDICT_LABEL[plan.verdict] || plan.verdict}
        </span>
        <span className="cad-state__detail">{plan.action}</span>
      </div>

      <dl className="cad-level-grid">
        <div>
          <dt>1 year</dt>
          <dd>{signed(plan.return_1y_pct)}</dd>
        </div>
        <div>
          <dt>From 1y high</dt>
          <dd>{signed(plan.drawdown_from_high_pct)}</dd>
        </div>
        <div>
          <dt>Worst 1y drop</dt>
          <dd>{signed(plan.max_drawdown_1y_pct)}</dd>
        </div>
        <div>
          <dt>Volatility</dt>
          <dd>{plan.volatility_pct != null ? `${plan.volatility_pct.toFixed(0)}%` : '—'}</dd>
        </div>
        <div>
          <dt>MER</dt>
          <dd>{row.mer_pct != null ? `${row.mer_pct.toFixed(2)}%` : '—'}</dd>
        </div>
        <div>
          <dt>Fund size</dt>
          <dd>{money(row.aum)}</dd>
        </div>
      </dl>

      {plan.reasons?.length > 0 && (
        <ul className="cad-reasons">
          {plan.reasons.map(reason => <li key={reason}>{reason}</li>)}
        </ul>
      )}

      <p className="cad-levels__note">
        Buy zone is a 20-day pullback entry. The line above reads the 50/200-day trend and cost instead.
      </p>
    </div>
  );
}

function EquityCard({ row }) {
  return (
    <article className="glass-card cad-card">
      <header className="cad-card__head">
        <div>
          <div className="cad-card__ticker">
            <span className="ticker">{row.ticker}</span>
            <span className="cad-exchange">{row.exchange}</span>
          </div>
          <div className="cad-card__name">{row.name}</div>
        </div>
        <div className="cad-card__price">${row.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
      </header>

      <div className="cad-metrics">
        <div>
          <div className="label-sm">1 day</div>
          <Change value={row.change_1d} />
        </div>
        <div>
          <div className="label-sm">1 month</div>
          <Change value={row.change_1mo} />
        </div>
        <div>
          <div className="label-sm">3 months</div>
          <Change value={row.change_3mo} />
        </div>
      </div>

      <Levels row={row} />

      <footer className="cad-card__foot">
        <span className="chip">View only</span>
        <span className="cad-card__stamp">{row.as_of}</span>
      </footer>
    </article>
  );
}

function EtfCard({ row }) {
  const mix = [
    ['stock', row.mix?.stock, 'var(--primary)'],
    ['bond', row.mix?.bond, 'var(--warning)'],
    ['cash', row.mix?.cash, 'var(--on-surface-variant)'],
  ].filter(([, value]) => value);

  return (
    <article className="glass-card cad-card">
      <header className="cad-card__head">
        <div>
          <div className="cad-card__ticker">
            <span className="ticker">{row.ticker}</span>
            <span className="cad-exchange">{row.exchange}</span>
          </div>
          <div className="cad-card__name">{row.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="cad-card__price">${row.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div style={{ marginTop: '0.35rem' }}><Premium value={row.premium_pct} /></div>
        </div>
      </header>

      <div className="cad-metrics">
        <div>
          <div className="label-sm">1 month</div>
          <Change value={row.change_1mo} />
        </div>
        <div>
          <div className="label-sm">3 months</div>
          <Change value={row.change_3mo} />
        </div>
        <div>
          <div className="label-sm">Yield</div>
          <span className="cad-metric__value">{row.yield_pct != null ? `${row.yield_pct.toFixed(2)}%` : '—'}</span>
        </div>
      </div>

      {mix.length > 0 && (
        <div className="cad-mix" aria-hidden="true">
          {mix.map(([label, value, color]) => (
            <span key={label} style={{ width: `${value}%`, background: color }} title={`${label} ${value}%`} />
          ))}
        </div>
      )}

      {row.holdings?.length > 0 && (
        <div className="cad-holdings">
          <div className="label-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Layers size={11} aria-hidden="true" /> Top holdings
          </div>
          <ul>
            {row.holdings.slice(0, 5).map(holding => (
              <li key={holding.symbol}>
                <span>{holding.symbol}</span>
                <span>{holding.weight_pct != null ? `${holding.weight_pct.toFixed(1)}%` : '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Levels row={row} />
      <LongTermPlan row={row} />

      <footer className="cad-card__foot">
        <span className="chip">View only</span>
        <span className="cad-card__stamp">{row.as_of}</span>
      </footer>
    </article>
  );
}

const PICK_GROUPS = [
  { key: 'today', title: 'Today', caption: 'Entry, from the buy zone' },
  { key: 'long_term', title: 'Long term', caption: 'Hold, from trend and cost' },
];

const CALL_TONE = {
  'Buy now': 'positive',
  'Keep buying': 'positive',
  Wait: 'warning',
  Pause: 'warning',
  'Small chunks': 'warning',
  "Don't buy yet": 'negative',
  'Too late': 'negative',
};

/* One plain sentence per name instead of a score: what the price is doing and
   whether that means buy, wait, or leave it alone. */
function PicksSummary({ picks }) {
  if (!picks) return null;

  return (
    <section className="glass-card cad-picks" aria-label="Canadian summary">
      {picks.headline && <p className="cad-picks__headline">{picks.headline}</p>}
      <div className="cad-picks__grid">
        {PICK_GROUPS.map(group => {
          const rows = picks[group.key] || [];
          return (
            <div key={group.key} className="cad-picks__col">
              <div className="cad-picks__head">
                <h2 className="headline-sm">{group.title}</h2>
                <span className="label-sm cad-picks__caption">{group.caption}</span>
              </div>
              {rows.length === 0 ? (
                <p className="cad-picks__empty">No data for this snapshot yet.</p>
              ) : (
                <ul className="cad-picks__list">
                  {rows.map(pick => (
                    <li key={pick.ticker}>
                      <div className="cad-picks__row">
                        <span className="ticker">{pick.ticker}</span>
                        <span className="cad-picks__kind">{pick.kind === 'etf' ? 'ETF' : 'Stock'}</span>
                        <span className={`cad-picks__call is-${CALL_TONE[pick.call] || 'neutral'}`}>
                          {pick.call}
                        </span>
                      </div>
                      <div className="cad-picks__meta">{pick.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="cad-picks__note">{picks.note}</p>
    </section>
  );
}

export default function CanadaPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading');
  const [tab, setTab] = useState('equities');

  useEffect(() => {
    // The committed snapshot ships with the site, so it is tried first. A
    // half-open backend port would otherwise hold the page on skeletons
    // forever, which is exactly what an unreachable localhost:8001 does.
    const load = async () => {
      const stamp = Date.now();
      const urls = [`/canada.json?t=${stamp}`];
      if (API_BASE) urls.push(`${API_BASE}/canada.json?t=${stamp}`);

      for (const url of urls) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) continue;
          const data = await response.json();
          const hasRows = data && ((data.equities || []).length || (data.etfs || []).length);
          if (hasRows) {
            setSnapshot(data);
            setStatus('ready');
            return;
          }
        } catch {
          /* try the next source */
        } finally {
          clearTimeout(timer);
        }
      }

      setStatus('empty');
    };

    load();
  }, []);

  const rows = snapshot ? (tab === 'equities' ? snapshot.equities || [] : snapshot.etfs || []) : [];
  const generated = snapshot?.generated_at
    ? new Date(snapshot.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="page-enter">
      <header className="page-head">
        <div>
          <h1 className="display-lg">Canada</h1>
          <p className="headline-sm" style={{ marginTop: '0.4rem' }}>
            TSX and TSXV coverage · research only
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="label-sm">Snapshot</div>
          <div className="headline-md" style={{ fontSize: '1rem', marginTop: '0.15rem' }}>
            {generated || 'pending'}
          </div>
        </div>
      </header>

      <div className="inline-alert inline-alert--warn" role="status" style={{ marginBottom: '1.5rem' }}>
        <Info size={17} aria-hidden="true" />
        <div>
          <p className="inline-alert__title">Tracked here, not traded here</p>
          <p className="inline-alert__body">
            The Alpaca paper account settles US listings only, so Canadian names are shown for research and never
            ordered. For tradable exposure use the cross-listing — SHOP, RY, TD, CNQ, ENB and CP all trade in New York.
          </p>
        </div>
      </div>

      {status === 'ready' && snapshot?.picks && <PicksSummary picks={snapshot.picks} />}

      <div className="segmented" role="group" aria-label="Canadian universe">
        <button
          className="segmented__item"
          aria-pressed={tab === 'equities'}
          onClick={() => setTab('equities')}
        >
          <TrendingUp size={13} aria-hidden="true" /> Equities
        </button>
        <button
          className="segmented__item"
          aria-pressed={tab === 'etfs'}
          onClick={() => setTab('etfs')}
        >
          <Layers size={13} aria-hidden="true" /> ETFs
        </button>
      </div>

      {status === 'loading' && (
        <div className="cad-grid" aria-busy="true">
          {[1, 2, 3].map(index => <div key={index} className="skeleton cad-skeleton" />)}
        </div>
      )}

      {status === 'empty' && (
        <div className="glass-card state-block">
          <Globe2 size={30} aria-hidden="true" />
          <p className="state-block__title">No Canadian snapshot yet</p>
          <p className="state-block__body">
            The research workflow publishes <code>canada.json</code> twice a day from free Yahoo Finance data. Run it
            once from the Actions tab, or wait for the next scheduled cycle.
          </p>
        </div>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="glass-card state-block">
          <TrendingDown size={28} aria-hidden="true" />
          <p className="state-block__title">Nothing in this group yet</p>
          <p className="state-block__body">Switch the tab above, or wait for the next snapshot.</p>
        </div>
      )}

      {status === 'ready' && rows.length > 0 && (
        <Reveal className="cad-grid" y={26} stagger={0.05}>
          {rows.map(row => (
            tab === 'etfs'
              ? <EtfCard key={row.symbol} row={row} />
              : <EquityCard key={row.symbol} row={row} />
          ))}
        </Reveal>
      )}

      <p className="cad-disclaimer">
        Prices from Yahoo Finance, delayed. Premium/discount compares the last price with the fund's published NAV.
        Every card also carries a mechanical buy zone, stop and target. ETFs add a long-term read from the 50/200-day
        trend, one-year drawdown, volatility and MER. No model calls are made on this page.
      </p>
    </div>
  );
}
