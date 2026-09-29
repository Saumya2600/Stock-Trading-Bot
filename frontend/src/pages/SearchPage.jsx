import { useState, useRef, useEffect } from 'react';
import { Search, TrendingUp, Clock, X } from 'lucide-react';
import { useApp } from '../context/AppContext';

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
  const apiKey = import.meta.env.VITE_ALPACA_API_KEY;
  const apiSecret = import.meta.env.VITE_ALPACA_SECRET_KEY;
  const headers = {
    'APCA-API-KEY-ID': apiKey || '',
    'APCA-API-SECRET-KEY': apiSecret || '',
    'accept': 'application/json'
  };

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState(getHistory);
  const inputRef = useRef(null);

  useEffect(() => {
    // Auto-focus on mount — Apple-style: content ready when page loads
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  const doSearch = async (ticker) => {
    if (!ticker.trim()) return;
    setSearching(true);
    const sym = ticker.trim().toUpperCase();
    try {
      const res = await fetch(
        `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${sym}`,
        { headers }
      );
      const data = await res.json();
      const snap = data[sym];
      if (snap) {
        addToHistory(sym);
        setHistory(getHistory());
        openStockModal({
          symbol: sym,
          price: snap?.latestTrade?.p || snap?.dailyBar?.c || 0,
          percent_change: snap.prevDailyBar && snap.dailyBar
            ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
            : 0
        });
        setQuery('');
      } else {
        // Inline error — no alert() per Apple UX
        setQuery('');
      }
    } catch (e) {
      console.error(e);
    }
    setSearching(false);
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
    <div className="search-page">
      {/* Hero search bar */}
      <header className="search-hero">
        <h1 className="display-lg search-hero-title">Search</h1>
        <p className="search-sub">Look up any US equity by ticker symbol</p>

        <form className="search-form" onSubmit={handleSubmit}>
          <div className={`search-field ${focused ? 'focused' : ''}`}>
            <Search
              size={20}
              className="search-icon"
              strokeWidth={2}
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search ticker symbol…"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={searching}
              autoComplete="off"
              spellCheck={false}
              className="search-input"
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                onMouseDown={e => { e.preventDefault(); setQuery(''); inputRef.current?.focus(); }}
                aria-label="Clear"
              >
                <X size={14} />
              </button>
            )}
            <button
              type="submit"
              className="search-submit"
              disabled={!query || searching}
            >
              {searching ? '…' : 'Go'}
            </button>
          </div>
        </form>
      </header>

      {/* Recent searches */}
      {history.length > 0 && (
        <section className="search-section">
          <div className="search-section-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={14} style={{ opacity: 0.5 }} />
              <span className="search-section-label">Recents</span>
            </div>
            <button className="search-clear-all" onClick={clearHistory}>Clear</button>
          </div>
          <div className="ticker-pill-grid">
            {history.map(sym => (
              <button
                key={sym}
                className="ticker-pill recent"
                onClick={() => doSearch(sym)}
              >
                {sym}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Popular stocks */}
      <section className="search-section">
        <div className="search-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={14} style={{ opacity: 0.5 }} />
            <span className="search-section-label">Popular</span>
          </div>
        </div>
        <div className="popular-grid">
          {POPULAR_TICKERS.map(({ symbol, name }) => (
            <button
              key={symbol}
              className="popular-card glass-card"
              onClick={() => doSearch(symbol)}
            >
              <div className="popular-card-symbol">{symbol}</div>
              <div className="popular-card-name">{name}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
