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

      <footer className="cad-card__foot">
        <span className="chip">View only</span>
        <span className="cad-card__stamp">{row.as_of}</span>
      </footer>
    </article>
  );
}

export default function CanadaPage() {
  const [snapshot, setSnapshot] = useState(null);
  const [status, setStatus] = useState('loading');
  const [tab, setTab] = useState('equities');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const stamp = Date.now();
      const urls = API_BASE
        ? [`${API_BASE}/canada.json?t=${stamp}`, `/canada.json?t=${stamp}`]
        : [`/canada.json?t=${stamp}`];

      for (const url of urls) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const data = await response.json();
          const hasRows = data && ((data.equities || []).length || (data.etfs || []).length);
          if (!cancelled && hasRows) {
            setSnapshot(data);
            setStatus('ready');
            return;
          }
        } catch {
          /* try the next source */
        }
      }

      if (!cancelled) setStatus('empty');
    };

    load();
    return () => { cancelled = true; };
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
        No model calls are made on this page.
      </p>
    </div>
  );
}
