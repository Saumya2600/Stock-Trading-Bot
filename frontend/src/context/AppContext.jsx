import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { savePicksToSupabase, fetchPicksFromSupabase } from '../lib/supabase';
import { alpacaRequest } from '../lib/alpaca';

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
  const [longtermData, setLongtermData] = useState(null);
  const [longtermLoading, setLongtermLoading] = useState(false);
  const [botOnline, setBotOnline] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);

  const API_BASE_RAW = import.meta.env.VITE_API_BASE_URL || '';
  const isServerless = API_BASE_RAW.includes("githubusercontent.com");
  const API_BASE = API_BASE_RAW;

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
        const fetchFresh = (url) => fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (isServerless || !API_BASE_RAW) {
          const [resReports, resState, resLongterm] = await Promise.all([
            fetchFresh(`${API_BASE}/reports.json`).catch(() => ({ ok: false })),
            fetchFresh(`${API_BASE}/app_state.json`).catch(() => ({ ok: false })),
            fetchFresh(`${API_BASE}/longterm_picks.json`).catch(() => ({ ok: false }))
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
          if (resLongterm && resLongterm.ok) {
            const ltData = await resLongterm.json();
            setLongtermData(ltData);
          }
          setPositions(prev => prev || { positions: [] });
        } else {
          const [resSignals, resResearch, resPerf, resPositions, resStatus, resTrades, resLongterm] = await Promise.all([
            fetchFresh(`${API_BASE}/signals`),
            fetchFresh(`${API_BASE}/research`),
            fetchFresh(`${API_BASE}/performance`),
            fetchFresh(`${API_BASE}/positions`),
            fetchFresh(`${API_BASE}/research_status`),
            fetchFresh(`${API_BASE}/trade_history`),
            fetchFresh(`${API_BASE}/longterm_picks`)
          ].map(p => p.catch(() => ({ ok: false }))));

          if (resSignals.ok) setBotSignals(await resSignals.json());
          if (resResearch.ok) setResearchReports(await resResearch.json());
          if (resPerf.ok) setPerformance(await resPerf.json());
          if (resPositions.ok) {
            const posData = await resPositions.json();
            if (posData && posData.positions) setPositions({ ...posData, is_live_alpaca: false });
          }
          if (resStatus.ok) setResearchStatus(await resStatus.json());
          if (resTrades.ok) {
            const historyData = await resTrades.json();
            setTradeHistory(historyData.history || []);
          }
          if (resLongterm && resLongterm.ok) {
            const ltData = await resLongterm.json();
            setLongtermData(ltData);
          }
          setBotOnline(Boolean(resSignals.ok));

          // If backend was unreachable (e.g. Render waking up), fallback to static JSON so mobile never shows blank
          if (!resResearch.ok) {
            let gotFreshData = false;
            // Tier 1 fallback: static /reports.json (committed by GitHub Actions)
            const fallbackRes = await fetch(`/reports.json${cacheBuster}`).catch(() => ({ ok: false }));
            if (fallbackRes.ok) {
              const fallbackReports = await fallbackRes.json();
              const hasPicks = Object.keys(fallbackReports).filter(k => !k.startsWith('_')).length > 0;
              if (hasPicks) {
                setResearchReports(prev => (Object.keys(prev || {}).length ? prev : fallbackReports));
                setBotSignals(prev => prev || { signals: Object.keys(fallbackReports).filter(k => !k.startsWith('_')) });
                gotFreshData = true;
              }
            }
            // Tier 2 fallback: Supabase DB (Python pushes here after every research cycle)
            if (!gotFreshData) {
              try {
                const { data: sbPicks, error: sbErr } = await fetchPicksFromSupabase({ days: 7, limit: 50 });
                if (!sbErr && sbPicks && sbPicks.length > 0) {
                  // Convert Supabase rows back to reports dict keyed by symbol (latest per symbol)
                  const sbReports = {};
                  sbPicks.forEach(p => {
                    if (!sbReports[p.symbol] || p.run_date > (sbReports[p.symbol].updated_at || '').split('T')[0]) {
                      sbReports[p.symbol] = p;
                    }
                  });
                  setResearchReports(prev => (Object.keys(prev || {}).length ? prev : sbReports));
                  setBotSignals(prev => prev || { signals: Object.keys(sbReports) });
                  console.log('[Supabase fallback] Loaded', Object.keys(sbReports).length, 'picks from Supabase');
                }
              } catch (sbEx) {
                console.warn('[Supabase fallback] Error:', sbEx);
              }
            }
            const fallbackState = await fetch(`/app_state.json${cacheBuster}`).catch(() => ({ ok: false }));
            if (fallbackState.ok) {
              const sData = await fallbackState.json();
              setTradeHistory(prev => (prev && prev.length ? prev : (sData.trade_history || [])));
              setPerformance(prev => prev || sData.portfolio_performance || {});
            }
          }
        }
      } catch (e) {
        console.error("Bot Data Fetch Error:", e);
        setBotOnline(false);
        try {
          const cacheBuster = `?t=${Date.now()}`;
          const fallbackRes = await fetch(`/reports.json${cacheBuster}`).catch(() => ({ ok: false }));
          if (fallbackRes.ok) setResearchReports(await fallbackRes.json());
        } catch (_) {}
      }
    };
    fetchBotData();
    const interval = setInterval(fetchBotData, 5000);
    return () => clearInterval(interval);
  }, [API_BASE, isServerless, API_BASE_RAW]);

  // Auto-save picks to Supabase (debounced 2 s after reports change)
  const saveDebounce = useRef(null);
  useEffect(() => {
    const symbols = Object.keys(researchReports).filter(k => !k.startsWith('_'));
    if (!symbols.length) return;
    clearTimeout(saveDebounce.current);
    saveDebounce.current = setTimeout(async () => {
      const { error } = await savePicksToSupabase(researchReports);
      if (error) console.warn('[Supabase save]', error);
      else console.log('[Supabase] Saved', symbols.length, 'picks');
    }, 2000);
    return () => clearTimeout(saveDebounce.current);
  }, [researchReports]);

  const fetchAlpacaData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch live positions and account
      const dataPos = await alpacaRequest('positions');
      if (Array.isArray(dataPos)) {
        const mappedPositions = dataPos.map(p => ({
          symbol: p.symbol,
          quantity: p.qty,
          avg_price: parseFloat(p.avg_entry_price),
          current_price: parseFloat(p.current_price),
          unrealized_pnl: parseFloat(p.unrealized_intraday_pl ?? p.unrealized_pl),
          unrealized_pnl_pct: parseFloat(p.unrealized_intraday_plpc) * 100,
          invested: parseFloat(p.cost_basis),
          value: parseFloat(p.market_value)
        }));
        const dataAcc = await alpacaRequest('account');
        setPositions({
          positions: mappedPositions,
          total_invested: parseFloat(dataAcc.cash) + parseFloat(dataAcc.portfolio_value),
          total_value: parseFloat(dataAcc.portfolio_value),
          total_unrealized_pnl: parseFloat(dataAcc.equity) - parseFloat(dataAcc.last_equity),
          is_live_alpaca: true
        });
      }

      // 2. Fetch live trade orders from Alpaca as direct sync
      try {
        const ordersData = await alpacaRequest('orders', { status: 'all', limit: 50 });
        if (Array.isArray(ordersData)) {
          const filledOrders = ordersData
            .filter(o => o.status === 'filled' && o.filled_at)
            .map(o => ({
              timestamp: o.filled_at,
              symbol: o.symbol,
              side: (o.side || 'buy').toUpperCase(),
              quantity: parseFloat(o.filled_qty || o.qty || 0),
              price: parseFloat(o.filled_avg_price || 0),
              signal: 'Executed',
              ai_grade: null
            }));
          if (filledOrders.length > 0) {
            setTradeHistory(prev => {
              // Merge with existing state while avoiding duplicate timestamps
              const existingMap = new Map((prev || []).map(t => [`${t.symbol}_${t.timestamp}`, t]));
              filledOrders.forEach(o => {
                const k = `${o.symbol}_${o.timestamp}`;
                if (!existingMap.has(k)) existingMap.set(k, o);
              });
              return Array.from(existingMap.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            });
          }
        }
      } catch (errOrders) {
        console.warn("Could not fetch Alpaca live orders:", errOrders);
      }

      // 3. Fetch Market Screener Movers (top 50)
      try {
        const dataMovers = await alpacaRequest('movers', { top: 50 });
        const allMovers = [...(dataMovers.gainers || []), ...(dataMovers.losers || [])];
        allMovers.sort((a, b) => (b.percent_change || 0) - (a.percent_change || 0));
        setMomentumStocks(allMovers);
      } catch (errMovers) {
        console.warn("Could not fetch market movers:", errMovers);
      }

      // 4. Fetch Market Screener Most Actives (top 50) + snapshots
      try {
        const dataActives = await alpacaRequest('most_actives', { by: 'volume', top: 50 });
        if (dataActives.most_actives && dataActives.most_actives.length > 0) {
          const symbols = dataActives.most_actives.map(s => s.symbol).join(',');
          const dataSnaps = await alpacaRequest('snapshots', { symbols });
          const mappedActives = dataActives.most_actives.map(s => {
            const snap = dataSnaps[s.symbol];
            return {
              symbol: s.symbol,
              volume: s.volume,
              price: snap?.latestTrade?.p || snap?.dailyBar?.c || 0,
              percent_change: snap && snap.prevDailyBar && snap.dailyBar
                ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
                : 0
            };
          });
          setActiveStocks(mappedActives);
        }
      } catch (errActives) {
        console.warn("Could not fetch most actives:", errActives);
      }
    } catch (err) {
      console.error("Error fetching Alpaca data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(fetchAlpacaData);
  }, [fetchAlpacaData]);

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
      const data = await alpacaRequest('bars', {
        symbols: stock.symbol,
        timeframe: '1Day',
        feed: 'iex',
        start: start.toISOString(),
        end: end.toISOString(),
      });
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
      const dataSnaps = await alpacaRequest('snapshots', { symbols: ticker });
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

  const triggerLongtermPicks = async () => {
    setLongtermLoading(true);
    try {
      if (!isServerless && API_BASE_RAW) {
        await fetch(`${API_BASE}/trigger_longterm`, { method: 'POST' });
      }
      const cacheBuster = `?t=${Date.now()}`;
      const url = isServerless || !API_BASE_RAW 
        ? `${API_BASE}/longterm_picks.json${cacheBuster}`
        : `${API_BASE}/longterm_picks`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setLongtermData(data);
      }
    } catch (e) {
      console.error("Error triggering longterm picks:", e);
    } finally {
      setTimeout(() => setLongtermLoading(false), 800);
    }
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
      longtermData, setLongtermData,
      longtermLoading, triggerLongtermPicks,
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
