import { useState, useRef, useEffect } from 'react';
import { Search, TrendingUp, Clock, X, AlertCircle, Loader2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { alpacaRequest } from '../lib/alpaca';

const POPULAR_TICKERS = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'META', name: 'Meta Platforms' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'JPM', name: 'JPMorgan Chase' },
  { symbol: 'V', name: 'Visa' },
  { symbol: 'NFLX', name: 'Netflix' },
  { symbol: 'AMD', name: 'AMD' },
  { symbol: 'PLTR', name: 'Palantir' },
];

const STORAGE_KEY = 'search_history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function addToHistory(symbol) {
  const prev = getHistory().filter(s => s !== symbol);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([symbol, ...prev].slice(0, 8)));
}

export default function SearchPage() {
  const { openStockModal } = useApp();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState(getHistory);
  const inputRef = useRef(null);

  useEffect(() => {
    // Only steal focus when there is a real keyboard — on touch it just
    // throws the on-screen keyboard over the page.
    if (!window.matchMedia('(pointer: fine)').matches) return undefined;
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []);

  const doSearch = async (ticker) => {
    const sym = ticker.trim().toUpperCase();
    if (!sym) return;
    setSearching(true);
    setError('');
    try {
      const data = await alpacaRequest('snapshots', { symbols: sym });
      const snap = data?.[sym];
      const price = snap?.latestTrade?.p || snap?.dailyBar?.c;
      if (!snap || !price) {
        setError(`No quote for “${sym}”. Check the ticker symbol and try again.`);
        return;
      }
      addToHistory(sym);
      setHistory(getHistory());
      openStockModal({
        symbol: sym,
        price,
        percent_change: snap.prevDailyBar && snap.dailyBar
          ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
          : 0,
      });
      setQuery('');
    } catch {
      setError('The quote service is unreachable right now. Try again in a moment.');
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    doSearch(query);
  };

  const clearHistory = () => {
    localStorage.removeItem(STORAGE_KEY);
    setHistory([]);
  };

  return (
    <div className="search-page page-enter">
      <header className="search-hero">
        <h1 className="display-lg search-hero-title">Search</h1>
        <p className="search-sub">Look up any US equity by ticker symbol.</p>

        <form className="search-form" onSubmit={handleSubmit} role="search" noValidate>
          <div className={`search-field ${focused ? 'focused' : ''}`}>
            <Search size={19} className="search-icon" strokeWidth={2} aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search ticker symbol…"
              aria-label="Ticker symbol"
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'search-error' : undefined}
              value={query}
              onChange={e => { setQuery(e.target.value.toUpperCase()); if (error) setError(''); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={searching}
              autoComplete="off"
              spellCheck={false}
              className="search-input"
            />
            {query && !searching && (
              <button
                type="button"
                className="search-clear"
                onMouseDown={e => { e.preventDefault(); setQuery(''); setError(''); inputRef.current?.focus(); }}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
            <button type="submit" className="search-submit" disabled={!query || searching}>
              {searching ? <Loader2 size={14} className="spinner" aria-hidden="true" /> : 'Go'}
            </button>
          </div>

          {error && (
            <p className="search-error" id="search-error" role="alert">
              <AlertCircle size={14} aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </form>
      </header>

      {history.length > 0 && (
        <section className="search-section">
          <div className="search-section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={13} style={{ color: 'var(--on-surface-variant)' }} aria-hidden="true" />
              <span className="search-section-label">Recent</span>
            </div>
            <button className="search-clear-all" onClick={clearHistory}>Clear history</button>
          </div>
          <div className="ticker-pill-grid">
            {history.map(sym => (
              <button key={sym} className="ticker-pill" onClick={() => doSearch(sym)}>
                {sym}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="search-section">
        <div className="search-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={13} style={{ color: 'var(--on-surface-variant)' }} aria-hidden="true" />
            <span className="search-section-label">Popular</span>
          </div>
        </div>
        <div className="popular-grid">
          {POPULAR_TICKERS.map(({ symbol, name }) => (
            <button
              key={symbol}
              className="popular-card glass-card is-clickable"
              onClick={() => doSearch(symbol)}
            >
              <span className="popular-card-symbol">{symbol}</span>
              <span className="popular-card-name">{name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
