import { useApp } from '../context/AppContext';

const SECTOR_MAP = {
  Technology: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'ADBE', 'CRM', 'AMD', 'QCOM', 'INTC', 'TSM', 'ASML', 'CSCO', 'IBM', 'TXN', 'NOW', 'INTU', 'AMAT', 'MU', 'LRCX', 'PANW'],
  Finance: ['JPM', 'V', 'MA', 'BAC', 'WFC', 'SPGI', 'GS', 'MS', 'AXP', 'C', 'BLK', 'SCHW', 'PGR', 'CB', 'MMC', 'CME', 'BX'],
  Healthcare: ['LLY', 'UNH', 'JNJ', 'MRK', 'ABBV', 'TMO', 'DHR', 'PFE', 'ISRG', 'SYK', 'CVS', 'MDT', 'VRTX', 'REGN', 'BSX', 'ZTS'],
  Consumer: ['AMZN', 'TSLA', 'WMT', 'HD', 'PG', 'COST', 'KO', 'PEP', 'MCD', 'NKE', 'SBUX', 'TGT', 'LVMUY', 'TM', 'F', 'GM'],
  Communications: ['GOOGL', 'GOOG', 'META', 'NFLX', 'CMCSA', 'DIS', 'VZ', 'T', 'TMUS', 'CHTR'],
  Industrial: ['CAT', 'GE', 'UNP', 'HON', 'BA', 'LMT', 'DE', 'UPS', 'RTX', 'MMM', 'CSX', 'ETN'],
};

const SECTORS = ['All', ...Object.keys(SECTOR_MAP)];

function StockCard({ stock }) {
  const { getTradeSuggestion, openStockModal } = useApp();
  const suggestion = getTradeSuggestion(stock);
  const isPositive = stock.percent_change >= 0;

  return (
    <div className="glass-card" onClick={() => openStockModal(stock)} style={{ cursor: 'pointer' }}>
      <div className="card-header">
        <div style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <div className="ticker">{stock.symbol}</div>
          <div className="label-md" style={{ marginTop: '0.25rem', fontSize: '0.65rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {stock.name || 'US Equity'}
          </div>
        </div>
        <div className={`chip gain-indicator ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '+' : ''}{parseFloat(stock.percent_change || 0).toFixed(2)}%
        </div>
      </div>
      <div className="price">${parseFloat(stock.price || 0).toFixed(2)}</div>
      <div className={`chip trade-suggestion ${suggestion.class}`}>{suggestion.text}</div>
      {stock.volume && (
        <div className="label-md" style={{ marginTop: '1rem', fontSize: '0.65rem' }}>
          Vol: {(stock.volume / 1000000).toFixed(1)}M
        </div>
      )}
    </div>
  );
}

export default function MarketPage() {
  const { loading, error, activeStocks, momentumStocks, sectorFilter, setSectorFilter } = useApp();

  if (loading) return <div className="loading">Connecting to Alpaca...</div>;

  const filteredActives = activeStocks.filter(s => sectorFilter === 'All' || SECTOR_MAP[sectorFilter]?.includes(s.symbol));
  const filteredMomentum = momentumStocks.filter(s => sectorFilter === 'All' || SECTOR_MAP[sectorFilter]?.includes(s.symbol));

  return (
    <>
      <header style={{ marginBottom: '2rem' }}>
        <h2 className="display-lg">Global Market</h2>
        <p className="headline-sm" style={{ marginTop: '0.5rem', opacity: 0.7 }}>Real-time US Movers &amp; Sector Analysis</p>
      </header>

      {/* Sector filters — pill strip */}
      <div className="sector-strip">
        {SECTORS.map(sector => (
          <button
            key={sector}
            onClick={() => setSectorFilter(sector)}
            className={`sector-pill ${sectorFilter === sector ? 'active' : ''}`}
          >
            {sector}
          </button>
        ))}
      </div>

      {error ? (
        <div style={{ padding: '1.5rem', background: 'rgba(255,113,108,0.1)', borderLeft: '4px solid #ff716c', borderRadius: '0 12px 12px 0' }}>
          <p className="headline-sm" style={{ color: '#ff716c', marginBottom: '0.5rem' }}>Authentication Failed</p>
          <p style={{ color: 'var(--on-surface-variant)' }}>{error}</p>
        </div>
      ) : (
        <>
          <section style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 1.5rem 0', gap: '1rem' }}>
              <h3 className="headline-sm" style={{ color: 'var(--on-surface)' }}>Highest Volume Active</h3>
              <span className="label-md" style={{ color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 8px', borderRadius: '6px' }}>Most Traded</span>
            </div>
            <div className="stock-grid">
              {filteredActives.slice(0, 15).map(stock => <StockCard key={stock.symbol} stock={stock} />)}
              {filteredActives.length === 0 && <p style={{ color: 'var(--on-surface-variant)' }}>No {sectorFilter} stocks in this pool right now.</p>}
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(72,72,71,0.3)', margin: '2rem 0' }} />

          <section style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 1.5rem 0', gap: '1rem' }}>
              <h3 className="headline-sm" style={{ color: 'var(--on-surface)' }}>Best Momentum</h3>
              <span className="label-md" style={{ color: 'var(--secondary)', border: '1px solid var(--secondary)', padding: '2px 8px', borderRadius: '6px' }}>Top Gainers</span>
            </div>
            <div className="stock-grid">
              {filteredMomentum.slice(0, 15).map(stock => <StockCard key={stock.symbol} stock={stock} />)}
              {filteredMomentum.length === 0 && <p style={{ color: 'var(--on-surface-variant)' }}>No {sectorFilter} stocks in this pool right now.</p>}
            </div>
          </section>
        </>
      )}
    </>
  );
}
