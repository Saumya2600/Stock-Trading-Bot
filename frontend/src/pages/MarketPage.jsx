import { AlertCircle, TrendingUp, Activity } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Reveal from '../components/motion/Reveal';

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
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${stock.symbol} details`}
      className="glass-card stock-card is-clickable tilt-card"
      onClick={() => openStockModal(stock)}
      onMouseMove={event => {
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width;
        const py = (event.clientY - rect.top) / rect.height;
        target.style.setProperty('--rx', `${(0.5 - py) * 7}deg`);
        target.style.setProperty('--ry', `${(px - 0.5) * 9}deg`);
        target.style.setProperty('--mx', `${px * 100}%`);
        target.style.setProperty('--my', `${py * 100}%`);
      }}
      onMouseLeave={event => {
        const target = event.currentTarget;
        target.style.setProperty('--rx', '0deg');
        target.style.setProperty('--ry', '0deg');
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openStockModal(stock);
        }
      }}
    >
      <span className="tilt-card__shine" aria-hidden="true" />
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <div className="ticker">{stock.symbol}</div>
          <div className="label-md" style={{ marginTop: '0.3rem', fontSize: '0.7rem', letterSpacing: '0.06em', textTransform: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {stock.name || 'US Equity'}
          </div>
        </div>
        <div className={`chip gain-indicator ${isPositive ? 'positive' : 'negative'}`}>
          {isPositive ? '+' : ''}{parseFloat(stock.percent_change || 0).toFixed(2)}%
        </div>
      </div>
      <div className="price">${parseFloat(stock.price || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div className={`chip trade-suggestion ${suggestion.class}`}>{suggestion.text}</div>
      {stock.volume && (
        <div className="label-md" style={{ marginTop: '0.9rem', fontSize: '0.7rem' }}>
          Vol {(stock.volume / 1000000).toLocaleString('en-US', { maximumFractionDigits: 1 })}M
        </div>
      )}
    </div>
  );
}

export default function MarketPage() {
  const { loading, error, activeStocks, momentumStocks, sectorFilter, setSectorFilter } = useApp();

  if (loading) return <div className="loading" role="status">Connecting to Alpaca…</div>;

  const filteredActives = activeStocks.filter(s => sectorFilter === 'All' || SECTOR_MAP[sectorFilter]?.includes(s.symbol));
  const filteredMomentum = momentumStocks.filter(s => sectorFilter === 'All' || SECTOR_MAP[sectorFilter]?.includes(s.symbol));

  return (
    <div className="page-enter">
      <header className="page-head">
        <div>
          <h1 className="display-lg">Global Market</h1>
          <p className="headline-sm" style={{ marginTop: '0.4rem' }}>Live US movers and sector rotation</p>
        </div>
      </header>

      <div className="sector-strip" role="group" aria-label="Filter by sector">
        {SECTORS.map(sector => (
          <button
            key={sector}
            onClick={() => setSectorFilter(sector)}
            className={`sector-pill ${sectorFilter === sector ? 'active' : ''}`}
            aria-pressed={sectorFilter === sector}
          >
            {sector}
          </button>
        ))}
      </div>

      {error ? (
        <div className="inline-alert" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <div>
            <p className="inline-alert__title">Market data is unavailable</p>
            <p className="inline-alert__body">
              Alpaca rejected the request. {error} Check the API credentials in your server environment, then reload.
            </p>
          </div>
        </div>
      ) : (
        <>
          <section>
            <div className="market-section-head">
              <h2>Highest volume</h2>
              <span className="market-tag" style={{ color: 'var(--primary)' }}>Most traded</span>
              <span className="section-rule" style={{ flex: 1 }} />
              <span className="label-sm">{filteredActives.length} symbols</span>
            </div>
            <Reveal className="stock-grid" y={30} stagger={0.045}>
              {filteredActives.slice(0, 15).map(stock => <StockCard key={stock.symbol} stock={stock} />)}
              {filteredActives.length === 0 && (
                <div className="state-block">
                  <Activity size={26} aria-hidden="true" />
                  <p className="state-block__title">No symbols in this pool</p>
                  <p className="state-block__body">
                    The Alpaca feed returned no {sectorFilter === 'All' ? '' : sectorFilter.toLowerCase() + ' '}movers.
                    Try another sector, or reload if the feed is still warming up.
                  </p>
                  <button className="apple-btn apple-btn-secondary" onClick={() => setSectorFilter('All')}>Show all sectors</button>
                </div>
              )}
            </Reveal>
          </section>

          <hr className="market-divider" />

          <section>
            <div className="market-section-head">
              <h2>Best momentum</h2>
              <span className="market-tag" style={{ color: 'var(--secondary)' }}>Top gainers</span>
              <span className="section-rule" style={{ flex: 1 }} />
              <span className="label-sm">{filteredMomentum.length} symbols</span>
            </div>
            <Reveal className="stock-grid" y={30} stagger={0.045}>
              {filteredMomentum.slice(0, 15).map(stock => <StockCard key={stock.symbol} stock={stock} />)}
              {filteredMomentum.length === 0 && (
                <div className="state-block">
                  <TrendingUp size={26} aria-hidden="true" />
                  <p className="state-block__title">No momentum names</p>
                  <p className="state-block__body">The gainers pool is empty for this filter. Widen it to see the full market.</p>
                  <button className="apple-btn apple-btn-secondary" onClick={() => setSectorFilter('All')}>Show all sectors</button>
                </div>
              )}
            </Reveal>
          </section>
        </>
      )}
    </div>
  );
}
