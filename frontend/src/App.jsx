import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { X, PanelLeftClose, PanelLeft, Search, LineChart as ChartIcon, Brain, FileText, Globe } from 'lucide-react';
import { AdvancedRealTimeChart } from "react-ts-tradingview-widgets";

import { AppProvider, useApp } from './context/AppContext';
import HubPage from './pages/HubPage';
import MarketPage from './pages/MarketPage';
import TradeHistoryPage from './pages/TradeHistoryPage';
import SearchPage from './pages/SearchPage';
import ExpandableReportCards from '@/components/ExpandableReportCards';

function ReportsPage() {
  const { researchReports } = useApp();
  return <ExpandableReportCards reports={researchReports} />;
}

/* ── SVG glass filter ── */
const GlassFilter = () => (
  <svg style={{ display: "none" }}>
    <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
      <feTurbulence type="fractalNoise" baseFrequency="0.001 0.005" numOctaves="1" seed="17" result="turbulence" />
      <feComponentTransfer in="turbulence" result="mapped">
        <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
        <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
        <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
      </feComponentTransfer>
      <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
      <feSpecularLighting in="softMap" surfaceScale="5" specularConstant="1" specularExponent="100" lightingColor="white" result="specLight">
        <fePointLight x="-200" y="-200" z="300" />
      </feSpecularLighting>
      <feComposite in="specLight" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="litImage" />
      <feDisplacementMap in="SourceGraphic" in2="softMap" scale="200" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

/* ── Sidebar ── */
function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const { botOnline, searchInput, setSearchInput, isSearching, handleSearch } = useApp();

  const navItems = [
    { to: '/', icon: <Brain size={18} />, label: 'Intelligence Hub' },
    { to: '/search', icon: <Search size={18} />, label: 'Search' },
    { to: '/reports', icon: <FileText size={18} />, label: 'Deep Research' },
    { to: '/market', icon: <Globe size={18} />, label: 'Market' },
    { to: '/history', icon: <ChartIcon size={18} />, label: 'Trade History' },
  ];

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        <h1 className="sidebar-logo">DEEP TECH</h1>
        <button className="sidebar-close-btn" onClick={onClose} title="Collapse Sidebar">
          <PanelLeftClose size={20} />
        </button>
      </div>

      <form onSubmit={handleSearch} className="sidebar-search-form">
        <div className="sidebar-search-field">
          <Search size={14} className="sidebar-search-icon" />
          <input
            type="text"
            placeholder="Quick Search…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            disabled={isSearching}
            className="sidebar-search-input"
          />
        </div>
      </form>

      <div className="sidebar-nav">
        {navItems.map(({ to, icon, label }) => (
          <Link
            key={to}
            to={to}
            className={`nav-item ${location.pathname === to ? 'active' : ''}`}
            onClick={() => window.innerWidth <= 768 && onClose()}
          >
            {icon}
            <span>{label}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="engine-status-card">
          <div className="label-md" style={{ fontSize: '0.6rem', marginBottom: '0.5rem', opacity: 0.5 }}>ENGINE</div>
          <div className="engine-status-row">
            <div className={`status-dot ${botOnline ? 'online' : 'offline'}`} />
            <span className="engine-status-label" style={{ color: botOnline ? '#3fff8b' : '#ff716c' }}>
              {botOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}

/* ── Stock Detail Modal ── */
function StockModal() {
  const { selectedStock, closeModal, chartRange, rangePercentChange, fetchChartDataForRange } = useApp();
  if (!selectedStock) return null;
  const isPositive = rangePercentChange >= 0;

  return (
    <div className="modal-backdrop" onClick={closeModal}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={closeModal}><X size={20} /></button>

        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-symbol-row">
              <h2 className="modal-symbol">{selectedStock.symbol}</h2>
              {selectedStock.name && (
                <span className="modal-company">{selectedStock.name}</span>
              )}
            </div>
            <div className="modal-range-pills">
              {['1W', '1M', '6M', 'YTD'].map(range => (
                <button
                  key={range}
                  className={`range-pill ${chartRange === range ? 'active' : ''}`}
                  onClick={() => fetchChartDataForRange(selectedStock, range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-price-block">
            <div className="modal-price">${parseFloat(selectedStock.price || 0).toFixed(2)}</div>
            <div className={`chip gain-indicator ${isPositive ? 'positive' : 'negative'}`}>
              {isPositive ? '+' : ''}{parseFloat(rangePercentChange || 0).toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="modal-chart">
          <AdvancedRealTimeChart
            theme="dark"
            symbol={selectedStock.symbol}
            width="100%"
            height="100%"
            allow_symbol_change={false}
            hide_side_toolbar={true}
            timezone="America/New_York"
            style="1"
          />
        </div>

        {/* Intelligence grid */}
        <div className="modal-intel-grid">
          <div className="glass-card" style={{ background: 'rgba(63,255,139,0.04)', border: '1px solid rgba(63,255,139,0.12)' }}>
            <h4 className="label-md" style={{ color: '#3fff8b', marginBottom: '1rem' }}>AI PRICE TARGETS</h4>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div className="label-md" style={{ opacity: 0.5, fontSize: '0.6rem' }}>ENTRY</div>
                <div className="headline-sm" style={{ color: '#fff', fontSize: '1rem', marginTop: '0.25rem' }}>
                  ${parseFloat(selectedStock.entry_price || selectedStock.price).toFixed(2)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label-md" style={{ opacity: 0.5, fontSize: '0.6rem' }}>TARGET</div>
                <div className="headline-sm" style={{ color: '#3fff8b', fontSize: '1rem', marginTop: '0.25rem' }}>
                  ${parseFloat(selectedStock.target_price || (selectedStock.price * 1.25)).toFixed(2)}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(63,255,139,0.1)', display: 'flex', justifyContent: 'space-between' }}>
              <span className="label-md" style={{ opacity: 0.5 }}>EST. UPSIDE</span>
              <span className="label-md" style={{ color: '#3fff8b', fontWeight: '800' }}>
                {(((selectedStock.target_price || (selectedStock.price * 1.25)) / (selectedStock.entry_price || selectedStock.price) - 1) * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="glass-card" style={{ background: 'rgba(255,255,255,0.02)' }}>
            <h4 className="label-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '1rem' }}>BUREAU OF INTELLIGENCE</h4>
            <div style={{ marginBottom: '1rem' }}>
              <div className="label-md" style={{ opacity: 0.4, fontSize: '0.6rem' }}>SELECTION LOGIC</div>
              <div style={{ fontSize: '0.85rem', lineHeight: '1.55', marginTop: '0.35rem' }}>
                {selectedStock.reasoning || "Selected via autonomous multi-factor discovery scan."}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div className="label-md" style={{ opacity: 0.4, fontSize: '0.6rem' }}>RISK</div>
                <div className={`chip ${selectedStock.risk_level === 'High' ? 'negative' : selectedStock.risk_level === 'Low' ? 'positive' : 'hold'}`} style={{ fontSize: '0.65rem', marginTop: '0.25rem' }}>
                  {selectedStock.risk_level || "Medium"}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label-md" style={{ opacity: 0.4, fontSize: '0.6rem' }}>CONVICTION</div>
                <div style={{ fontWeight: '700', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  {(selectedStock.ai_grade || 70) > 85 ? 'HIGH' : 'MODERATE'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── App shell ── */
function AppShell() {
  const { sidebarOpen, setSidebarOpen } = useApp();

  return (
    <div className={`app-container ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
      <GlassFilter />
      <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(true)} title="Expand Sidebar">
        <PanelLeft size={20} />
      </button>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="main-content">
        <Routes>
          <Route path="/" element={<HubPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/history" element={<TradeHistoryPage />} />
        </Routes>
      </main>

      <StockModal />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </Router>
  );
}
