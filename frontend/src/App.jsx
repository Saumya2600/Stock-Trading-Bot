import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { X, Search, LayoutDashboard, LineChart as ChartIcon, Settings, Brain } from 'lucide-react';

const SECTOR_MAP = {
  Technology: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'ADBE', 'CRM', 'AMD', 'QCOM', 'INTC', 'TSM', 'ASML', 'CSCO', 'IBM', 'TXN', 'NOW', 'INTU', 'AMAT', 'MU', 'LRCX', 'PANW'],
  Finance: ['JPM', 'V', 'MA', 'BAC', 'WFC', 'SPGI', 'GS', 'MS', 'AXP', 'C', 'BLK', 'SCHW', 'PGR', 'CB', 'MMC', 'CME', 'BX'],
  Healthcare: ['LLY', 'UNH', 'JNJ', 'MRK', 'ABBV', 'TMO', 'DHR', 'PFE', 'ISRG', 'SYK', 'CVS', 'MDT', 'VRTX', 'REGN', 'BSX', 'ZTS'],
  Consumer: ['AMZN', 'TSLA', 'WMT', 'HD', 'PG', 'COST', 'KO', 'PEP', 'MCD', 'NKE', 'SBUX', 'TGT', 'LVMUY', 'TM', 'F', 'GM'],
  Communications: ['GOOGL', 'GOOG', 'META', 'NFLX', 'CMCSA', 'DIS', 'VZ', 'T', 'TMUS', 'CHTR'],
  Industrial: ['CAT', 'GE', 'UNP', 'HON', 'BA', 'LMT', 'DE', 'UPS', 'RTX', 'MMM', 'CSX', 'ETN']
};

function App() {
  const [momentumStocks, setMomentumStocks] = useState([]);
  const [activeStocks, setActiveStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('dashboard');
  
  const [selectedStock, setSelectedStock] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartRange, setChartRange] = useState('1M'); 
  const [rangePercentChange, setRangePercentChange] = useState(0);

  // New States
  const [sectorFilter, setSectorFilter] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const apiKey = import.meta.env.VITE_ALPACA_API_KEY;
  const apiSecret = import.meta.env.VITE_ALPACA_SECRET_KEY;

  const [botSignals, setBotSignals] = useState(null);
  const [researchReports, setResearchReports] = useState({});
  const [performance, setPerformance] = useState(null);
  const [positions, setPositions] = useState(null);
  const [researchStatus, setResearchStatus] = useState(null);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [manualResearchLoading, setManualResearchLoading] = useState(false);
  const [researchClearing, setResearchClearing] = useState(false);
  const [botOnline, setBotOnline] = useState(false);

  const headers = {
    'APCA-API-KEY-ID': apiKey || '',
    'APCA-API-SECRET-KEY': apiSecret || '',
    'accept': 'application/json'
  };

  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

  // Poll the Python Bot API (Serverless via GitHub)
  useEffect(() => {
    const fetchBotData = async () => {
      try {
        const isServerless = API_BASE.includes("githubusercontent.com");
        
        if (isServerless) {
          // Fetch raw JSON from GitHub repository directly
          const cacheBuster = `?t=${Date.now()}`;
          const [resReports, resState] = await Promise.all([
            fetch(`${API_BASE}/reports.json${cacheBuster}`),
            fetch(`${API_BASE}/app_state.json${cacheBuster}`)
          ]);

          if (resReports.ok) {
            const reportsData = await resReports.json();
            setBotSignals({ signals: Object.keys(reportsData) });
            setResearchReports(reportsData);
            setResearchStatus({ status: "idle" });
          }

          if (resState.ok) {
            const stateData = await resState.json();
            setPerformance(stateData.portfolio_performance || {});
            setTradeHistory(stateData.trade_history || []);
          }
          
          setBotOnline(resReports.ok && resState.ok);
          // Note: In Serverless mode, live positions are fetched directly from Alpaca in fetchAlpacaData below.
          setPositions({ positions: [] }); 
        } else {
          // Fallback to active backend server
          const [resSignals, resResearch, resPerf, resPositions, resStatus, resTrades] = await Promise.all([
            fetch(`${API_BASE}/signals`),
            fetch(`${API_BASE}/research`),
            fetch(`${API_BASE}/performance`),
            fetch(`${API_BASE}/positions`),
            fetch(`${API_BASE}/research_status`),
            fetch(`${API_BASE}/trade_history`)
          ]);
          
          if (resSignals.ok) setBotSignals(await resSignals.json());
          if (resResearch.ok) setResearchReports(await resResearch.json());
          if (resPerf.ok) setPerformance(await resPerf.json());
          if (resPositions.ok) setPositions(await resPositions.json());
          if (resStatus.ok) setResearchStatus(await resStatus.json());
          if (resTrades.ok) setTradeHistory((await resTrades.json()).history || []);
          
          setBotOnline(resSignals.ok);
        }
      } catch (e) {
        setBotOnline(false);
      }
    };

    fetchBotData();
    const interval = setInterval(fetchBotData, 5000); // Poll every 5s
    return () => clearInterval(interval);
  }, [API_BASE]);

  useEffect(() => {
    fetchAlpacaData();
  }, [apiKey, apiSecret]);

  const fetchAlpacaData = async () => {
    if (!apiKey || !apiSecret) {
      setLoading(false);
      setError("Please add your Alpaca API credentials to the .env file.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Movers (top 50 so sectors actually catch something, 50 is max limit)
      const resMovers = await fetch('https://data.alpaca.markets/v1beta1/screener/stocks/movers?top=50', { headers });
      if (!resMovers.ok) throw new Error(`Alpaca API Error: ${resMovers.status} ${resMovers.statusText}`);
      const dataMovers = await resMovers.json();
      
      const allMovers = [...(dataMovers.gainers || []), ...(dataMovers.losers || [])];
      allMovers.sort((a, b) => b.percent_change - a.percent_change); 
      setMomentumStocks(allMovers);

      // 2. Fetch Most Actives (top 50)
      const resActives = await fetch('https://data.alpaca.markets/v1beta1/screener/stocks/most-actives?by=volume&top=50', { headers });
      const dataActives = await resActives.json();
      
      if (dataActives.most_actives && dataActives.most_actives.length > 0) {
        const symbols = dataActives.most_actives.map(s => s.symbol).join(',');
        const resSnaps = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbols}`, { headers });
        const dataSnaps = await resSnaps.json();
        
        const mappedActives = dataActives.most_actives.map(s => {
          const snap = dataSnaps[s.symbol];
          return {
            symbol: s.symbol,
            volume: s.volume,
            price: snap?.latestTrade?.p || snap?.dailyBar?.c || 0,
            percent_change: snap && snap.prevDailyBar && snap.dailyBar ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100 : 0
          };
        });
        setActiveStocks(mappedActives);
      }
    } catch (err) {
      console.error("Error fetching Alpaca data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if(!searchInput.trim()) return;
    
    setIsSearching(true);
    const ticker = searchInput.trim().toUpperCase();

    try {
      const resSnaps = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${ticker}`, { headers });
      const dataSnaps = await resSnaps.json();
      
      const snap = dataSnaps[ticker];
      if (snap) {
        const stockProxy = {
          symbol: ticker,
          price: snap?.latestTrade?.p || snap?.dailyBar?.c || 0,
          percent_change: snap.prevDailyBar && snap.dailyBar ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100 : 0
        };
        openStockModal(stockProxy);
      } else {
        alert("Ticker not found or invalid format!");
      }
    } catch(e) { 
      console.error(e);
      alert("Error searching for ticker!");
    }
    
    setIsSearching(false);
    setSearchInput('');
  };

  const fetchChartDataForRange = async (stock, range) => {
    setLoadingChart(true);
    setChartRange(range);
    
    const end = new Date();
    const start = new Date();
    
    if (range === '1W') start.setDate(end.getDate() - 7);
    if (range === '1M') start.setDate(end.getDate() - 30);
    if (range === '6M') start.setMonth(end.getMonth() - 6);
    if (range === 'YTD') {
      start.setMonth(0);
      start.setDate(1);
    }

    const startStr = start.toISOString();
    const endStr = end.toISOString();

    try {
      const res = await fetch(`https://data.alpaca.markets/v2/stocks/bars?symbols=${stock.symbol}&timeframe=1Day&feed=iex&start=${startStr}&end=${endStr}`, { headers });
      const data = await res.json();
      
      if (data.bars && data.bars[stock.symbol]) {
        const formattedData = data.bars[stock.symbol].map(bar => {
          const dateStr = new Date(bar.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return {
            name: dateStr,
            Price: bar.c 
          };
        });
        setChartData(formattedData);
        
        if (formattedData.length > 0) {
          const firstPrice = formattedData[0].Price;
          const lastPrice = formattedData[formattedData.length - 1].Price;
          setRangePercentChange(((lastPrice - firstPrice) / firstPrice) * 100);
        } else {
          setRangePercentChange(0);
        }
      } else {
        setChartData([]);
        setRangePercentChange(0);
      }
    } catch (e) {
      console.error("Error fetching chart data", e);
      setChartData([]);
      setRangePercentChange(0);
    }
    setLoadingChart(false);
  };

  const openStockModal = (stock) => {
    // 🔗 DEEP RESEARCH MERGE: Find stored intelligence for this ticker
    const intelligence = researchReports[stock.symbol];
    const enrichedStock = intelligence ? { ...stock, ...intelligence } : stock;
    
    setSelectedStock(enrichedStock);
    fetchChartDataForRange(enrichedStock, '1M'); 
  };

  const closeModal = () => {
    setSelectedStock(null);
  };

  const getTradeSuggestion = (stock) => {
    if (stock.percent_change > 5) return { text: 'Strong Buy', class: 'buy' };
    if (stock.percent_change > 0) return { text: 'Buy', class: 'buy' };
    if (stock.percent_change < -5) return { text: 'Sell', class: 'sell' };
    if (stock.percent_change < 0) return { text: 'Hold', class: 'hold' };
    return { text: 'Hold', class: 'hold' };
  };

  const StockCard = ({ stock }) => {
    const suggestion = getTradeSuggestion(stock);
    const isPositive = stock.percent_change >= 0;
    
    return (
      <div className="glass-card" onClick={() => openStockModal(stock)}>
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
        
        <div className={`chip trade-suggestion ${suggestion.class}`}>
          {suggestion.text}
        </div>
        {stock.volume && <div className="label-md" style={{ marginTop: '1rem', fontSize: '0.65rem' }}>Vol: {(stock.volume / 1000000).toFixed(1)}M</div>}
      </div>
    );
  };

  const renderResearchStatus = () => {
    if (!researchStatus) return null;

    const lastRun = researchStatus.last_run ? new Date(researchStatus.last_run).toLocaleString() : 'None yet';
    const currentWindow = researchStatus.market_open ? 'OPEN' : 'CLOSED';
    const nextOpen = researchStatus.next_market_open_sec != null ? `${Math.floor(researchStatus.next_market_open_sec / 3600)}h ${Math.floor((researchStatus.next_market_open_sec % 3600) / 60)}m` : 'Unknown';
    const count = researchStatus.research_count || 0;
    const symbols = researchStatus.research_symbols || [];
    const symbolPreview = symbols.length ? symbols.slice(0, 8).join(', ') : 'No stocks researched yet';

    return (
      <div className="glass-card" style={{ marginBottom: '3rem', padding: '1.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 className="headline-sm">Research Status</h3>
            <p className="label-md" style={{ color: 'var(--on-surface-variant)' }}>
              Bot is currently {currentWindow.toLowerCase()}.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="chip positive"
              style={{ cursor: 'pointer', padding: '0.7rem 1rem' }}
              disabled={manualResearchLoading || researchClearing}
              onClick={async () => {
                setManualResearchLoading(true);
                setResearchReports({});
                try {
                  await fetch(`${API_BASE}/trigger_research`, { method: 'POST' });
                } catch (e) {
                  console.error('Manual research failed', e);
                }
                setManualResearchLoading(false);
              }}
            >
              {manualResearchLoading ? 'Triggering…' : 'Run Now'}
            </button>
            <button
              className="chip hold"
              style={{ cursor: 'pointer', padding: '0.7rem 1rem' }}
              disabled={researchClearing || manualResearchLoading}
              onClick={async () => {
                setResearchClearing(true);
                setResearchReports({});
                try {
                  await fetch(`${API_BASE}/clear_research`, { method: 'POST' });
                } catch (e) {
                  console.error('Clear research failed', e);
                }
                setResearchClearing(false);
              }}
            >
              {researchClearing ? 'Clearing…' : 'Clear Old Research'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Last Research Run</div>
            <div className="headline-sm">{lastRun}</div>
          </div>
          <div>
            <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Stocks in latest cycle</div>
            <div className="headline-sm">{count}</div>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Latest research symbols</div>
          <div className="label-md" style={{ marginTop: '0.3rem' }}>{symbolPreview}</div>
        </div>

        <div className="label-md" style={{ color: 'var(--on-surface-variant)' }}>
          Next market open in: {nextOpen}
        </div>
      </div>
    );
  };

  const renderTradeTimeline = () => {
    if (!tradeHistory || tradeHistory.length === 0) {
      return (
        <div className="glass-card" style={{ marginBottom: '3rem', padding: '2rem' }}>
          <h3 className="headline-sm">Bot Trade Timeline</h3>
          <p className="label-md" style={{ color: 'var(--on-surface-variant)', marginTop: '0.5rem' }}>
            No trade events yet. Trades will appear here after the bot buys or sells.
          </p>
        </div>
      );
    }

    return (
      <div className="glass-card" style={{ marginBottom: '3rem', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h3 className="headline-sm">Bot Trade Timeline</h3>
            <p className="label-md" style={{ color: 'var(--on-surface-variant)' }}>
              Recent buys and sells by the bot, newest first.
            </p>
          </div>
        </div>

        <div style={{ position: 'relative', paddingLeft: '1rem', borderLeft: '2px solid rgba(255,255,255,0.12)' }}>
          {tradeHistory.slice(0, 10).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map((trade, index) => (
            <div key={`${trade.symbol}-${trade.timestamp}-${index}`} style={{ position: 'relative', marginBottom: '1.75rem', paddingLeft: '1.5rem' }}>
              <div style={{ position: 'absolute', left: '-10px', top: '0.4rem', width: '16px', height: '16px', borderRadius: '50%', background: trade.side === 'BUY' ? '#3fff8b' : '#ff716c', border: '2px solid rgba(255,255,255,0.15)' }} />
              <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                  <div>
                    <div className="headline-md" style={{ marginBottom: '0.25rem' }}>{trade.symbol} • {trade.side}</div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>
                      {trade.quantity} shares @ ${trade.price.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="label-sm" style={{ color: trade.side === 'BUY' ? '#3fff8b' : '#ff716c', fontWeight: '700' }}>{trade.side}</div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{new Date(trade.timestamp).toLocaleString()}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.85rem', gap: '0.75rem' }}>
                  <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>AI Grade: {trade.ai_grade}</div>
                  {trade.signal && <div className="chip" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.7rem' }}>{trade.signal}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBotSignals = () => {
    if (!botOnline) {
      return (
        <div className="glass-card" style={{ border: '1px dashed rgba(255,255,255,0.1)', opacity: 0.7 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div className="headline-sm">Intelligence Engine Offline</div>
              <div className="label-md" style={{ color: 'var(--on-surface-variant)' }}>Start backend/bot.py to activate AI Research & Discovery</div>
            </div>
            <div className="chip hold">OFFLINE</div>
          </div>
        </div>
      );
    }

    const symbols = Object.keys(researchReports).filter((key) => !key.startsWith("_"));
    if (symbols.length === 0) return <div className="loading" style={{ padding: '2rem' }}>AI Researcher initializing data... run the bot or click Run Now to kick off research.</div>;

    return (
      <div className="stock-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
        {symbols.map((ticker) => {
          const research = researchReports[ticker];
          const tech = botSignals?.[ticker];
          const aiGrade = research?.ai_grade || 50;
          const gradeColor = aiGrade > 80 ? '#3fff8b' : aiGrade < 40 ? '#ff716c' : '#ffd60a';

          return (
            <div key={ticker} className="glass-card" style={{ 
              background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
              border: `1px solid ${aiGrade > 80 || aiGrade < 40 ? gradeColor + '44' : 'rgba(255,255,255,0.1)'}`,
              position: 'relative',
              overflow: 'hidden',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}>
              {/* Dynamic Aura */}
              <div style={{ 
                position: 'absolute', top: '-40px', right: '-40px', width: '120px', height: '120px', 
                background: gradeColor, filter: 'blur(70px)', opacity: 0.1, borderRadius: '50%' 
              }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div className="ticker" style={{ fontSize: '1.5rem' }}>{ticker}</div>
                    <div className="chip" style={{ 
                      fontSize: '0.6rem', padding: '2px 6px', 
                      background: research.type === 'DEEP VALUE' ? 'rgba(63, 255, 139, 0.1)' : 'rgba(255, 214, 10, 0.1)',
                      color: research.type === 'DEEP VALUE' ? '#3fff8b' : '#ffd60a',
                      border: '1px solid currentColor'
                    }}>
                      {research.type}
                    </div>
                  </div>
                  <div style={{ marginTop: '0.25rem', color: '#fff', fontSize: '0.85rem', fontWeight: '500' }}>
                    {research.name || ticker}
                  </div>
                  <div style={{ marginTop: '0.25rem', color: 'var(--on-surface-variant)', fontSize: '0.75rem' }}>
                    Price: ${research.price.toFixed(2)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="label-md" style={{ color: gradeColor, fontWeight: '800' }}>AI GRADE</div>
                  <div className="headline-md" style={{ color: gradeColor }}>{aiGrade}</div>
                </div>
              </div>

              <div className="glass-card" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                <div className="label-md" style={{ fontSize: '0.65rem', marginBottom: '0.5rem', opacity: 0.5 }}>AI RESEARCH BRIEF</div>
                <div style={{ fontSize: '0.85rem', lineHeight: '1.4', color: 'var(--on-surface)' }}>
                  {research.reasoning || "Analyzing latest news catalysts..."}
                </div>
              </div>

              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                   {tech?.signal && <div className={`chip ${tech.signal.includes('BUY') ? 'positive' : 'hold'}`} style={{ fontSize: '0.6rem' }}>{tech.signal}</div>}
                   <button 
                     className="chip hold" 
                     style={{ fontSize: '0.6rem', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                     onClick={() => openStockModal(research)}
                   >
                     DETAILS ↗
                   </button>
                </div>
                <div className="label-md" style={{ fontSize: '0.6rem', opacity: 0.3 }}>
                  Updated: {new Date(research.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPerformanceChart = () => {
    if (!performance) return null;
    const isWinning = performance.bot_roi > performance.spy_roi;

    return (
      <div className="glass-card" style={{ marginBottom: '3rem', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h3 className="headline-sm">Performance vs. Benchmark</h3>
            <p className="label-md" style={{ color: 'var(--on-surface-variant)' }}>Your Bot vs S&P 500 (SPY)</p>
          </div>
          <div style={{ textAlign: 'right' }}>
             <div className="display-lg" style={{ color: isWinning ? '#3fff8b' : '#ff716c', fontSize: '2.5rem' }}>
               {isWinning ? '+' : ''}{(performance.bot_roi - performance.spy_roi).toFixed(2)}%
             </div>
             <div className="label-md">ALPHA VS SPY</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
           <div style={{ padding: '1.5rem', background: 'rgba(63, 255, 139, 0.05)', borderRadius: '12px', border: '1px solid rgba(63, 255, 139, 0.1)' }}>
              <div className="label-md" style={{ color: '#3fff8b' }}>AI BOT ROI</div>
              <div className="headline-md" style={{ marginTop: '0.5rem' }}>{performance.bot_roi.toFixed(2)}%</div>
           </div>
           <div style={{ padding: '1.5rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div className="label-md" style={{ color: 'var(--on-surface-variant)' }}>SPY ROI</div>
              <div className="headline-md" style={{ marginTop: '0.5rem' }}>{performance.spy_roi.toFixed(2)}%</div>
           </div>
        </div>

        <div style={{ marginTop: '1.5rem', color: 'var(--on-surface-variant)', fontSize: '0.75rem', textAlign: 'center' }}>
          Autonomous Execution active. {(performance.trades_count || tradeHistory.length)} trades placed by the bot since inception.
        </div>
      </div>
    );
  };

  const renderPortfolioPositions = () => {
    if (!positions || !positions.positions || positions.positions.length === 0) {
      return (
        <div className="glass-card" style={{ marginBottom: '3rem', padding: '2rem' }}>
          <h3 className="headline-sm">Bot Portfolio Positions</h3>
          <p className="label-md" style={{ color: 'var(--on-surface-variant)', marginTop: '0.5rem' }}>
            No active positions. Bot is waiting for high-conviction opportunities.
          </p>
        </div>
      );
    }

    const totalInvested = positions.total_invested || 0;
    const totalValue = positions.total_value || 0;
    const totalPnL = positions.total_unrealized_pnl || 0;
    const totalPnLPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;

    return (
      <div className="glass-card" style={{ marginBottom: '3rem', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h3 className="headline-sm">Bot Portfolio Positions</h3>
            <p className="label-md" style={{ color: 'var(--on-surface-variant)' }}>
              Current holdings and sell targets to beat SPY
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="display-lg" style={{ color: totalPnL >= 0 ? '#3fff8b' : '#ff716c', fontSize: '2rem' }}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </div>
            <div className="label-md" style={{ color: totalPnL >= 0 ? '#3fff8b' : '#ff716c' }}>
              {totalPnLPct >= 0 ? '+' : ''}{totalPnLPct.toFixed(2)}% P&L
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          {positions.positions.map((position) => {
            const isPositive = position.unrealized_pnl >= 0;
            const sellTargetMet = position.current_price >= position.sell_target_price;
            
            return (
              <div 
                key={position.symbol}
                style={{
                  padding: '1.5rem',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '12px',
                  border: `1px solid ${sellTargetMet ? 'rgba(63, 255, 139, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
                  position: 'relative'
                }}
              >
                {sellTargetMet && (
                  <div style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: '#3fff8b',
                    color: '#000',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '0.7rem',
                    fontWeight: '700'
                  }}>
                    SELL TARGET MET
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <div className="headline-md" style={{ fontSize: '1.2rem' }}>{position.symbol}</div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>{position.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="label-md" style={{ color: isPositive ? '#3fff8b' : '#ff716c' }}>
                      {isPositive ? '+' : ''}${position.unrealized_pnl.toFixed(2)}
                    </div>
                    <div className="label-sm" style={{ color: isPositive ? '#3fff8b' : '#ff716c' }}>
                      {isPositive ? '+' : ''}{position.unrealized_pnl_pct.toFixed(2)}%
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Quantity</div>
                    <div className="headline-sm">{position.quantity}</div>
                  </div>
                  <div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Avg Price</div>
                    <div className="headline-sm">${position.avg_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Current</div>
                    <div className="headline-sm">${position.current_price.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Invested</div>
                    <div className="headline-sm">${position.invested.toFixed(2)}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Sell Target (Beat SPY)</div>
                      <div className="headline-sm" style={{ color: sellTargetMet ? '#3fff8b' : '#ff716c' }}>
                        ${position.sell_target_price.toFixed(2)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>SPY ROI</div>
                      <div className="label-md">{position.spy_roi >= 0 ? '+' : ''}{position.spy_roi.toFixed(2)}%</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>
                    AI Grade: {position.ai_grade}/100 • {position.risk_level} Risk
                  </div>
                  {!sellTargetMet && (
                    <div className="label-sm" style={{ color: '#ff716c' }}>
                      Need +{position.sell_target_pct.toFixed(2)}% to sell
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '2rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="label-md">Portfolio Summary</div>
            <div style={{ display: 'flex', gap: '2rem' }}>
              <div>
                <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Total Invested</div>
                <div className="headline-sm">${totalInvested.toFixed(2)}</div>
              </div>
              <div>
                <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Current Value</div>
                <div className="headline-sm">${totalValue.toFixed(2)}</div>
              </div>
              <div>
                <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Unrealized P&L</div>
                <div className="headline-sm" style={{ color: totalPnL >= 0 ? '#3fff8b' : '#ff716c' }}>
                  {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const HubPage = () => (
    <>
      <header style={{ marginBottom: '2rem' }}>
        <h2 className="display-lg">Intelligence Hub</h2>
        <p className="headline-sm" style={{ marginTop: '0.5rem', opacity: 0.7 }}>Autonomous Deep Research & SPY Alpha Tracking</p>
      </header>

      {/* Benchmark Section */}
      {renderPerformanceChart()}

      {/* Research Status */}
      {renderResearchStatus()}

      {/* Portfolio Positions */}
      {renderPortfolioPositions()}

      {/* Trade Timeline */}
      {renderTradeTimeline()}

      {/* AI Strategy Bot Signals */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 1rem 0', gap: '1rem' }}>
          <h3 className="label-lg" style={{ color: 'var(--on-surface-variant)', letterSpacing: '0.1em' }}>DEEP RESEARCH INTELLIGENCE</h3>
        </div>
        {renderBotSignals()}
      </div>
    </>
  );

  const MarketPage = () => {
    if (loading) return <div className="loading">Connecting to Alpaca...</div>;
    
    const filteredActives = activeStocks.filter(s => sectorFilter === 'All' || SECTOR_MAP[sectorFilter].includes(s.symbol));
    const filteredMomentum = momentumStocks.filter(s => sectorFilter === 'All' || SECTOR_MAP[sectorFilter].includes(s.symbol));

    return (
      <>
        <header style={{ marginBottom: '2rem' }}>
          <h2 className="display-lg">Global Market</h2>
          <p className="headline-sm" style={{ marginTop: '0.5rem', opacity: 0.7 }}>Real-time US Movers & Sector Analysis</p>
        </header>

        {/* Sector Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2.5rem', flexWrap: 'wrap' }}>
          {['All', 'Technology', 'Finance', 'Healthcare', 'Consumer', 'Communications', 'Industrial'].map(sector => (
            <button 
              key={sector}
              onClick={() => setSectorFilter(sector)}
              style={{
                background: sectorFilter === sector ? 'var(--on-surface)' : 'var(--surface-container-highest)',
                color: sectorFilter === sector ? 'var(--surface)' : 'var(--on-surface-variant)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '99px',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s',
                boxShadow: sectorFilter === sector ? '0 4px 12px rgba(255,255,255,0.2)' : 'none'
              }}
            >
              {sector}
            </button>
          ))}
        </div>

        {error ? (
          <div style={{ padding: '1.5rem', background: 'rgba(255, 113, 108, 0.1)', borderLeft: '4px solid #ff716c', borderRadius: '0 8px 8px 0' }}>
            <p className="headline-sm" style={{ color: '#ff716c', marginBottom: '0.5rem' }}>Authentication Failed</p>
            <p style={{ color: 'var(--on-surface-variant)' }}>{error}</p>
          </div>
        ) : (
          <>
            <section style={{ marginBottom: '3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 1.5rem 0', gap: '1rem' }}>
                <h3 className="headline-sm" style={{ color: 'var(--on-surface)'}}>Highest Volume Active</h3>
                <span className="label-md" style={{ color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 6px', borderRadius: '4px' }}>Most Traded</span>
              </div>
              <div className="stock-grid">
                {filteredActives.slice(0, 15).map(stock => <StockCard key={stock.symbol} stock={stock} />)}
                {filteredActives.length === 0 && <p style={{ color: 'var(--on-surface-variant)' }}>No {sectorFilter} stocks in this pool right now.</p>}
              </div>
            </section>

            <hr style={{ border: 'none', borderTop: '1px solid rgba(72, 72, 71, 0.3)', margin: '3rem 0' }} />

            <section style={{ marginBottom: '3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', margin: '0 0 1.5rem 0', gap: '1rem' }}>
                <h3 className="headline-sm" style={{ color: 'var(--on-surface)'}}>Best Momentum</h3>
                <span className="label-md" style={{ color: 'var(--secondary)', border: '1px solid var(--secondary)', padding: '2px 6px', borderRadius: '4px' }}>Top Gainers</span>
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
  };

  const renderStockModal = () => {
    if (!selectedStock) return null;
    
    const isPositive = rangePercentChange >= 0;
    const strokeColor = isPositive ? '#3fff8b' : '#ff716c';

    return (
      <div className="modal-backdrop" onClick={closeModal}>
        <div className="modal-content" style={{ maxWidth: '1000px' }} onClick={e => e.stopPropagation()}>
          <button className="modal-close" onClick={closeModal}><X size={24} /></button>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
            <div style={{ maxWidth: '60%' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
                <h2 className="display-lg" style={{ fontSize: '2.5rem' }}>{selectedStock.symbol}</h2>
                <div style={{ color: 'var(--on-surface-variant)', fontSize: '1.2rem', fontWeight: '500' }}>{selectedStock.name}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                {['1W', '1M', '6M', 'YTD'].map(range => (
                  <button 
                    key={range}
                    onClick={() => fetchChartDataForRange(selectedStock, range)}
                    style={{
                      background: chartRange === range ? 'rgba(255,255,255,0.1)' : 'transparent',
                      border: '1px solid ' + (chartRange === range ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)'),
                      color: chartRange === range ? '#fff' : 'var(--on-surface-variant)',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      transition: 'all 0.2s',
                    }}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="price" style={{ fontSize: '2.5rem', margin: 0 }}>${parseFloat(selectedStock.price || 0).toFixed(2)}</div>
              <div className={`chip gain-indicator ${isPositive ? 'positive' : 'negative'}`} style={{ marginTop: '0.5rem' }}>
                {isPositive ? '+' : ''}{parseFloat(rangePercentChange || 0).toFixed(2)}%
              </div>
            </div>
          </div>

          <div style={{ width: '100%', height: '350px', marginBottom: '2rem' }}>
            {loadingChart ? (
              <div className="loading" style={{ height: '100%' }}>Fetching {chartRange} Data...</div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="name" stroke="var(--on-surface-variant)" tick={{ fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false} dy={10} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} stroke="var(--on-surface-variant)" tick={{ fill: 'var(--on-surface-variant)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} dx={-10} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--surface-container-highest)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', backdropFilter: 'blur(20px)' }}
                    itemStyle={{ color: 'var(--on-surface)' }}
                    labelStyle={{ color: 'var(--on-surface-variant)', marginBottom: '4px' }}
                  />
                  <Line type="monotone" dataKey="Price" stroke={strokeColor} strokeWidth={3} dot={false} activeDot={{ r: 6, fill: strokeColor, stroke: 'var(--surface)', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="loading" style={{ height: '100%' }}>No historical data available.</div>
            )}
          </div>

          {/* New Intelligence Section */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
             <div className="glass-card" style={{ background: 'rgba(63, 255, 139, 0.05)', border: '1px solid rgba(63, 255, 139, 0.1)' }}>
                <h4 className="label-md" style={{ color: '#3fff8b', marginBottom: '1rem' }}>AI PRICE TARGETS</h4>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div>
                      <div className="label-md" style={{ opacity: 0.6, fontSize: '0.65rem' }}>ENTRY ZONE</div>
                      <div className="headline-sm">${parseFloat(selectedStock.entry_price || selectedStock.price).toFixed(2)}</div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <div className="label-md" style={{ opacity: 0.6, fontSize: '0.65rem' }}>TARGET PRICE</div>
                      <div className="headline-sm" style={{ color: '#3fff8b' }}>${parseFloat(selectedStock.target_price || (selectedStock.price * 1.25)).toFixed(2)}</div>
                   </div>
                </div>
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(63, 255, 139, 0.1)', display: 'flex', justifyContent: 'space-between' }}>
                   <span className="label-md" style={{ opacity: 0.6 }}>EST. UPSIDE</span>
                   <span className="label-md" style={{ color: '#3fff8b', fontWeight: '800' }}>
                     {(((selectedStock.target_price || (selectedStock.price * 1.25)) / (selectedStock.entry_price || selectedStock.price) - 1) * 100).toFixed(1)}%
                   </span>
                </div>
             </div>

             <div className="glass-card" style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                <h4 className="label-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '1rem' }}>BUREAU OF INTELLIGENCE</h4>
                <div style={{ marginBottom: '1rem' }}>
                   <div className="label-md" style={{ opacity: 0.5, fontSize: '0.65rem' }}>SELECTION LOGIC</div>
                   <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>{selectedStock.reasoning || "Selected via autonomous multi-factor discovery scan."}</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                   <div>
                      <div className="label-md" style={{ opacity: 0.5, fontSize: '0.65rem' }}>RISK LEVEL</div>
                      <div className={`chip ${selectedStock.risk_level === 'High' ? 'negative' : selectedStock.risk_level === 'Low' ? 'positive' : 'hold'}`} style={{ fontSize: '0.7rem' }}>
                         {selectedStock.risk_level || "Medium"}
                      </div>
                   </div>
                   <div style={{ textAlign: 'right' }}>
                      <div className="label-md" style={{ opacity: 0.5, fontSize: '0.65rem' }}>CONVICTION</div>
                      <div className="headline-sm" style={{ fontSize: '1rem' }}>{(selectedStock.ai_grade || 70) > 85 ? 'HIGH' : 'MODERATE'}</div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>
    );
  };

  const renderSettings = () => (
    <div>
      <h2 className="display-lg">Settings</h2>
      <div className="glass-card" style={{ marginTop: '2rem', maxWidth: '600px', display: 'block' }}>
        <h3 className="headline-sm">Alpaca API Status</h3>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.9rem', margin: '1rem 0' }}>
          The app is configured and pulling data right from `data.alpaca.markets`.
        </p>
      </div>
    </div>
  );

  const Sidebar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    return (
      <nav className="sidebar">
        <div style={{ padding: '1rem 0', marginBottom: '1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '800', background: 'linear-gradient(90deg, #fff, #3fff8b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            DEEP TECH
          </h1>
        </div>

        {/* Global Search Box */}
        <form onSubmit={handleSearch} style={{ position: 'relative', marginBottom: '2rem' }}>
          <input 
            type="text" 
            placeholder="Quick Search..." 
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            disabled={isSearching}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '10px 12px 10px 36px',
              color: '#fff',
              fontSize: '0.8rem',
              outline: 'none'
            }}
          />
          <Search size={14} color="var(--on-surface-variant)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
        </form>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
             <Brain size={18} /> Intelligence Hub
          </Link>
          <Link to="/market" className={`nav-item ${location.pathname === '/market' ? 'active' : ''}`}>
             <LayoutDashboard size={18} /> Global Market
          </Link>
          <Link to="/settings" className={`nav-item ${location.pathname === '/settings' ? 'active' : ''}`}>
             <Settings size={18} /> Settings
          </Link>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
           <div className="glass-card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
              <div className="label-md" style={{ fontSize: '0.65rem', marginBottom: '0.5rem' }}>ENGINE STATUS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                 <div style={{ width: '8px', height: '8px', background: botOnline ? '#3fff8b' : '#ff716c', borderRadius: '50%', boxShadow: botOnline ? '0 0 10px #3fff8b' : 'none' }} />
                 <span style={{ fontSize: '0.7rem', fontWeight: '700' }}>{botOnline ? 'ONLINE' : 'OFFLINE'}</span>
              </div>
           </div>
        </div>
      </nav>
    );
  };

  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<HubPage />} />
            <Route path="/market" element={<MarketPage />} />
            <Route path="/settings" element={renderSettings()} />
          </Routes>
        </main>

        {/* Render Modal Overlay securely above everything */}
        {renderStockModal()}
      </div>
    </Router>
  );
}

export default App;
