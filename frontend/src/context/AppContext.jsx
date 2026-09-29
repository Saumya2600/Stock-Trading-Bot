import { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [momentumStocks, setMomentumStocks] = useState([]);
  const [activeStocks, setActiveStocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedStock, setSelectedStock] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartRange, setChartRange] = useState('1M');
  const [rangePercentChange, setRangePercentChange] = useState(0);

  const [sectorFilter, setSectorFilter] = useState('All');
  const [searchInput, setSearchInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const [botSignals, setBotSignals] = useState(null);
  const [researchReports, setResearchReports] = useState({});
  const [performance, setPerformance] = useState(null);
  const [positions, setPositions] = useState(null);
  const [researchStatus, setResearchStatus] = useState(null);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [manualResearchLoading, setManualResearchLoading] = useState(false);
  const [researchClearing, setResearchClearing] = useState(false);
  const [botOnline, setBotOnline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const apiKey = import.meta.env.VITE_ALPACA_API_KEY;
  const apiSecret = import.meta.env.VITE_ALPACA_SECRET_KEY;

  const headers = {
    'APCA-API-KEY-ID': apiKey || '',
    'APCA-API-SECRET-KEY': apiSecret || '',
    'accept': 'application/json'
  };

  const API_BASE_RAW = import.meta.env.VITE_API_BASE_URL || '';
  const isServerless = API_BASE_RAW.includes("githubusercontent.com");
  const API_BASE = (isServerless || !API_BASE_RAW) ? API_BASE_RAW : "";

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchBotData = async () => {
      try {
        const cacheBuster = `?t=${Date.now()}`;
        if (isServerless || !API_BASE_RAW) {
          const [resReports, resState] = await Promise.all([
            fetch(`${API_BASE}/reports.json${cacheBuster}`).catch(() => ({ ok: false })),
            fetch(`${API_BASE}/app_state.json${cacheBuster}`).catch(() => ({ ok: false }))
          ]);
          if (resReports.ok) {
            const reportsData = await resReports.json();
            setBotSignals({ signals: Object.keys(reportsData).filter(k => !k.startsWith('_')) });
            setResearchReports(reportsData);
            setResearchStatus({ status: "idle" });
            setBotOnline(true);
          }
          if (resState.ok) {
            const stateData = await resState.json();
            setPerformance(stateData.portfolio_performance || {});
            setTradeHistory(stateData.trade_history || []);
          }
          setPositions(prev => prev || { positions: [] });
        } else {
          const [resSignals, resResearch, resPerf, resPositions, resStatus, resTrades] = await Promise.all([
            fetch(`${API_BASE}/signals`),
            fetch(`${API_BASE}/research`),
            fetch(`${API_BASE}/performance`),
            fetch(`${API_BASE}/positions`),
            fetch(`${API_BASE}/research_status`),
            fetch(`${API_BASE}/trade_history`)
          ].map(p => p.catch(() => ({ ok: false }))));

          if (resSignals.ok) setBotSignals(await resSignals.json());
          if (resResearch.ok) setResearchReports(await resResearch.json());
          if (resPerf.ok) setPerformance(await resPerf.json());
          if (resPositions.ok) {
            const posData = await resPositions.json();
            if (posData && posData.positions) setPositions(prev => ({ ...posData, is_live_alpaca: false }));
          }
          if (resStatus.ok) setResearchStatus(await resStatus.json());
          if (resTrades.ok) {
            const historyData = await resTrades.json();
            setTradeHistory(historyData.history || []);
          }
          setBotOnline(resSignals.ok);
        }
      } catch (e) {
        console.error("Bot Data Fetch Error:", e);
        setBotOnline(false);
      }
    };
    fetchBotData();
    const interval = setInterval(fetchBotData, 5000);
    return () => clearInterval(interval);
  }, [API_BASE, isServerless, API_BASE_RAW]);

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
      const resPositions = await fetch('https://paper-api.alpaca.markets/v2/positions', { headers });
      if (resPositions.ok) {
        const dataPos = await resPositions.json();
        const mappedPositions = dataPos.map(p => ({
          symbol: p.symbol,
          quantity: p.qty,
          avg_price: parseFloat(p.avg_entry_price),
          current_price: parseFloat(p.current_price),
          unrealized_pnl: parseFloat(p.unrealized_intraday_pl),
          unrealized_pnl_pct: parseFloat(p.unrealized_intraday_plpc) * 100,
          invested: parseFloat(p.cost_basis),
          value: parseFloat(p.market_value)
        }));
        const resAccount = await fetch('https://paper-api.alpaca.markets/v2/account', { headers });
        const dataAcc = await resAccount.json();
        setPositions({
          positions: mappedPositions,
          total_invested: parseFloat(dataAcc.cash) + parseFloat(dataAcc.portfolio_value),
          total_value: parseFloat(dataAcc.portfolio_value),
          total_unrealized_pnl: parseFloat(dataAcc.equity) - parseFloat(dataAcc.last_equity),
          is_live_alpaca: true
        });
      }
    } catch (err) {
      console.error("Error fetching Alpaca data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartDataForRange = async (stock, range) => {
    setLoadingChart(true);
    setChartRange(range);
    const end = new Date();
    const start = new Date();
    if (range === '1W') start.setDate(end.getDate() - 7);
    if (range === '1M') start.setDate(end.getDate() - 30);
    if (range === '6M') start.setMonth(end.getMonth() - 6);
    if (range === 'YTD') { start.setMonth(0); start.setDate(1); }
    try {
      const res = await fetch(
        `https://data.alpaca.markets/v2/stocks/bars?symbols=${stock.symbol}&timeframe=1Day&feed=iex&start=${start.toISOString()}&end=${end.toISOString()}`,
        { headers }
      );
      const data = await res.json();
      if (data.bars && data.bars[stock.symbol]) {
        const formattedData = data.bars[stock.symbol].map(bar => ({
          name: new Date(bar.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          Price: bar.c
        }));
        setChartData(formattedData);
        if (formattedData.length > 0) {
          const firstPrice = formattedData[0].Price;
          const lastPrice = formattedData[formattedData.length - 1].Price;
          setRangePercentChange(((lastPrice - firstPrice) / firstPrice) * 100);
        } else setRangePercentChange(0);
      } else { setChartData([]); setRangePercentChange(0); }
    } catch (e) {
      console.error("Error fetching chart data", e);
      setChartData([]); setRangePercentChange(0);
    }
    setLoadingChart(false);
  };

  const openStockModal = (stock) => {
    const intelligence = researchReports[stock.symbol];
    const enrichedStock = intelligence ? { ...stock, ...intelligence } : stock;
    setSelectedStock(enrichedStock);
    fetchChartDataForRange(enrichedStock, '1M');
  };

  const closeModal = () => setSelectedStock(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchInput.trim()) return;
    setIsSearching(true);
    const ticker = searchInput.trim().toUpperCase();
    try {
      const resSnaps = await fetch(
        `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${ticker}`,
        { headers }
      );
      const dataSnaps = await resSnaps.json();
      const snap = dataSnaps[ticker];
      if (snap) {
        openStockModal({
          symbol: ticker,
          price: snap?.latestTrade?.p || snap?.dailyBar?.c || 0,
          percent_change: snap.prevDailyBar && snap.dailyBar
            ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
            : 0
        });
      } else {
        alert("Ticker not found or invalid format!");
      }
    } catch (e) {
      console.error(e);
      alert("Error searching for ticker!");
    }
    setIsSearching(false);
    setSearchInput('');
  };

  const getTradeSuggestion = (stock) => {
    if (stock.percent_change > 5) return { text: 'Strong Buy', class: 'buy' };
    if (stock.percent_change > 0) return { text: 'Buy', class: 'buy' };
    if (stock.percent_change < -5) return { text: 'Sell', class: 'sell' };
    if (stock.percent_change < 0) return { text: 'Hold', class: 'hold' };
    return { text: 'Hold', class: 'hold' };
  };

  return (
    <AppContext.Provider value={{
      momentumStocks, setMomentumStocks,
      activeStocks, setActiveStocks,
      loading, error,
      selectedStock, chartData, loadingChart, chartRange, rangePercentChange,
      sectorFilter, setSectorFilter,
      searchInput, setSearchInput, isSearching,
      botSignals, researchReports,
      performance, positions, researchStatus, tradeHistory,
      manualResearchLoading, setManualResearchLoading,
      researchClearing, setResearchClearing,
      setResearchReports,
      botOnline,
      sidebarOpen, setSidebarOpen,
      API_BASE,
      openStockModal, closeModal, fetchChartDataForRange,
      handleSearch, getTradeSuggestion,
    }}>
      {children}
    </AppContext.Provider>
  );
}
