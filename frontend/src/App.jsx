import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import { X, PanelLeftClose, PanelLeft, Search, LineChart as ChartIcon, Brain, FileText, Globe, Flag, History, LogOut, Moon } from 'lucide-react';

/* The chart widget is ~half the bundle and only ever appears in the modal. */
const AdvancedRealTimeChart = lazy(() =>
  import('react-ts-tradingview-widgets').then(mod => ({ default: mod.AdvancedRealTimeChart }))
);

import { AppProvider, useApp } from './context/AppContext';
import HubPage from './pages/HubPage';
import MarketPage from './pages/MarketPage';
import HistoryPage from './pages/HistoryPage';
import CanadaPage from './pages/CanadaPage';
import SearchPage from './pages/SearchPage';
import OvernightPage from './pages/OvernightPage';
import ExpandableReportCards from '@/components/ExpandableReportCards';
import DashboardAuthGate from './components/DashboardAuthGate';
import { useDashboardAuth } from './components/dashboardAuthContext';
import PageTransition from './components/motion/PageTransition';
import { gsap, useGSAP, prefersReducedMotion, EASE } from './lib/gsapSetup';

function ReportsPage() {
  const { researchReports } = useApp();
  return <ExpandableReportCards reports={researchReports} />;
}

const ICON = { size: 17, 'aria-hidden': true };

const NAV_ITEMS = [
  { to: '/', icon: <Brain {...ICON} />, label: 'Intelligence Hub' },
  { to: '/search', icon: <Search {...ICON} />, label: 'Search' },
  { to: '/reports', icon: <FileText {...ICON} />, label: 'Deep Research' },
  { to: '/canada', icon: <Flag {...ICON} />, label: 'Canada' },
  { to: '/overnight', icon: <Moon {...ICON} />, label: 'Overnight Earnings' },
  { to: '/market', icon: <Globe {...ICON} />, label: 'Market' },
  { to: '/history', icon: <History {...ICON} />, label: 'History' },
];

/* ── Sidebar ── */
function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const { botOnline, searchInput, setSearchInput, isSearching, handleSearch } = useApp();
  const { logout } = useDashboardAuth();
  const navRef = useRef(null);
  const glowRef = useRef(null);

  /* One travelling highlight instead of a static background swap. */
  useGSAP(() => {
    const nav = navRef.current;
    const glow = glowRef.current;
    if (!nav || !glow) return undefined;

    const active = nav.querySelector('.nav-item.active');
    if (!active) {
      gsap.set(glow, { autoAlpha: 0 });
      return undefined;
    }

    const target = { y: active.offsetTop, height: active.offsetHeight, autoAlpha: 1 };
    if (prefersReducedMotion()) {
      gsap.set(glow, target);
      return undefined;
    }

    const tween = gsap.to(glow, { ...target, duration: 0.55, ease: EASE.out });
    return () => tween.kill();
  }, { scope: navRef, dependencies: [location.pathname] });

  return (
    <nav className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Primary">
      <div className="sidebar-header">
        <h1 className="sidebar-logo">
          <img className="brand-mark" src="/favicon.svg" alt="" width="26" height="26" />
          <span className="brand-word">Sam&rsquo;s Lab</span>
        </h1>
        <button className="sidebar-close-btn" onClick={onClose} title="Collapse sidebar" aria-label="Collapse sidebar">
          <PanelLeftClose size={19} />
        </button>
      </div>

      <form onSubmit={handleSearch} className="sidebar-search-form" role="search">
        <div className="sidebar-search-field">
          <Search size={14} className="sidebar-search-icon" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search a ticker…"
            aria-label="Search a ticker"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            disabled={isSearching}
            className="sidebar-search-input"
          />
        </div>
      </form>

      <div className="sidebar-nav" ref={navRef}>
        <span className="nav-glow" ref={glowRef} aria-hidden="true" />
        {NAV_ITEMS.map(({ to, icon, label }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`nav-item ${active ? 'active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => window.innerWidth <= 768 && onClose()}
            >
              {icon}
              <span>{label}</span>
            </Link>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="engine-status-card">
          <div className="label-md" style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>Engine</div>
          <div className="engine-status-row">
            <span className={`status-dot ${botOnline ? 'online' : 'offline'}`} aria-hidden="true" />
            <span className="engine-status-label" style={{ color: botOnline ? 'var(--primary)' : 'var(--secondary)' }}>
              {botOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
        </div>
        <button className="apple-btn apple-btn-secondary" onClick={logout} style={{ width: '100%' }}>
          <LogOut size={14} aria-hidden="true" /> Sign out
        </button>
      </div>
    </nav>
  );
}

/* ── Stock detail modal ── */
function StockModal() {
  const { selectedStock, closeModal, chartRange, rangePercentChange, fetchChartDataForRange } = useApp();
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const backdropRef = useRef(null);
  const closeHandlerRef = useRef(() => closeModal());
  const open = Boolean(selectedStock);
  const [closing, setClosing] = useState(false);

  /* Open: depth arrives from the page rather than popping in. */
  useGSAP(() => {
    if (!open || closing || !dialogRef.current || !backdropRef.current) return undefined;
    if (prefersReducedMotion()) {
      gsap.set([dialogRef.current, backdropRef.current], { autoAlpha: 1, clearProps: 'transform,filter' });
      return undefined;
    }

    const tl = gsap.timeline();
    tl.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: EASE.soft })
      .fromTo(
        dialogRef.current,
        { y: 42, scale: 0.965, filter: 'blur(14px)', opacity: 0 },
        { y: 0, scale: 1, filter: 'blur(0px)', opacity: 1, duration: 0.75, ease: EASE.out },
        0
      );

    return () => tl.kill();
  }, { scope: dialogRef, dependencies: [open] });

  const animateClose = () => {
    if (prefersReducedMotion() || !dialogRef.current || !backdropRef.current) {
      closeModal();
      return;
    }
    setClosing(true);
    const tl = gsap.timeline({ onComplete: () => { setClosing(false); closeModal(); } });
    tl.to(dialogRef.current, { y: 26, scale: 0.97, filter: 'blur(10px)', opacity: 0, duration: 0.3, ease: 'power2.in' })
      .to(backdropRef.current, { opacity: 0, duration: 0.24, ease: 'power2.in' }, 0);
  };

  useEffect(() => {
    closeHandlerRef.current = animateClose;
  });

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = event => {
      if (event.key === 'Escape') { closeHandlerRef.current(); return; }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    if (!closing) closeRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, closeModal, closing]);

  if (!open) return null;

  const isPositive = rangePercentChange >= 0;
  const tradingViewRange = {
    '1D': '1D',
    '1W': '5D',
    '1M': '1M',
    '6M': '6M',
    YTD: 'YTD',
  }[chartRange] || '5D';

  const price = parseFloat(selectedStock.price || 0);
  const entry = parseFloat(selectedStock.entry_price || selectedStock.price || 0);
  const target = parseFloat(selectedStock.target_price || price * 1.25);
  const upside = entry > 0 ? ((target / entry - 1) * 100).toFixed(1) : '0.0';
  const riskChip = selectedStock.risk_level === 'High' ? 'negative' : selectedStock.risk_level === 'Low' ? 'positive' : 'hold';

  return (
    <div className="modal-backdrop" ref={backdropRef} onClick={animateClose}>
      <div
        ref={dialogRef}
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={`${selectedStock.symbol} details`}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
      >
        <button ref={closeRef} className="modal-close" onClick={animateClose} aria-label="Close details">
          <X size={19} />
        </button>

        <div className="modal-header">
          <div>
            <div className="modal-symbol-row">
              <h2 className="modal-symbol">{selectedStock.symbol}</h2>
              {selectedStock.name && <span className="modal-company">{selectedStock.name}</span>}
            </div>
            <div className="modal-range-pills" role="group" aria-label="Chart range">
              {['1D', '1W', '1M', '6M', 'YTD'].map(range => (
                <button
                  key={range}
                  className={`range-pill ${chartRange === range ? 'active' : ''}`}
                  aria-pressed={chartRange === range}
                  onClick={() => fetchChartDataForRange(selectedStock, range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="modal-price-block">
            <div className="modal-price">${price.toFixed(2)}</div>
            <div
              className={`chip gain-indicator ${isPositive ? 'positive' : 'negative'}`}
              title={`${chartRange} change`}
            >
              <span style={{ opacity: 0.65, marginRight: '0.35rem' }}>{chartRange}</span>
              {isPositive ? '+' : ''}{parseFloat(rangePercentChange || 0).toFixed(2)}%
            </div>
          </div>
        </div>

        <div className="modal-chart">
          <Suspense fallback={<div className="chart-skeleton skeleton" aria-label="Loading chart" role="status" />}>
            {/* The widget's own interval picker and bottom range bar duplicated the
                pills above; one control set, one window. */}
            <AdvancedRealTimeChart
              theme="dark"
              symbol={selectedStock.symbol}
              range={tradingViewRange}
              width="100%"
              height="100%"
              allow_symbol_change={false}
              hide_top_toolbar={true}
              hide_side_toolbar={true}
              withdateranges={false}
              save_image={false}
              details={false}
              timezone="America/New_York"
              style="1"
            />
          </Suspense>
        </div>

        <div className="modal-intel-grid">
          <div className="glass-card modal-intel-card" style={{ background: 'rgba(63,255,139,0.045)', borderColor: 'rgba(63,255,139,0.16)' }}>
            <h4 className="label-md" style={{ color: 'var(--primary)' }}>AI price targets</h4>
            <div className="modal-fact-row">
              <div>
                <div className="label-md" style={{ fontSize: '0.7rem' }}>Entry</div>
                <div className="modal-fact-value">${entry.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label-md" style={{ fontSize: '0.7rem' }}>Target</div>
                <div className="modal-fact-value" style={{ color: 'var(--primary)' }}>${target.toFixed(2)}</div>
              </div>
            </div>
            <div className="modal-fact-rule">
              <span className="label-md">Est. upside</span>
              <span className="label-md" style={{ color: 'var(--primary)', fontWeight: 800 }}>{upside}%</span>
            </div>
          </div>

          <div className="glass-card modal-intel-card">
            <h4 className="label-md">Bureau of intelligence</h4>
            <div style={{ marginBottom: '0.9rem' }}>
              <div className="label-md" style={{ fontSize: '0.7rem', marginBottom: '0.3rem' }}>Selection logic</div>
              <div style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'var(--on-surface-muted)' }}>
                {selectedStock.reasoning || 'Selected via autonomous multi-factor discovery scan.'}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem' }}>
              <div>
                <div className="label-md" style={{ fontSize: '0.7rem', marginBottom: '0.3rem' }}>Risk</div>
                <div className={`chip ${riskChip}`} style={{ fontSize: '0.7rem' }}>
                  {selectedStock.risk_level || 'Medium'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="label-md" style={{ fontSize: '0.7rem', marginBottom: '0.3rem' }}>Conviction</div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
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
  const { pathname } = useLocation();

  /* The sidebar is an overlay on phones, so picking a destination dismisses it. */
  useEffect(() => {
    if (window.matchMedia('(max-width: 768px)').matches) setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className={`app-container ${!sidebarOpen ? 'sidebar-collapsed' : ''}`}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <button
        className="sidebar-toggle-btn"
        onClick={() => setSidebarOpen(true)}
        title="Expand sidebar"
        aria-label="Expand sidebar"
      >
        <PanelLeft size={19} />
      </button>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {sidebarOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-content" id="main-content" tabIndex={-1}>
        <PageTransition>
        <Routes>
          <Route path="/" element={<HubPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/canada" element={<CanadaPage />} />
          <Route path="/picks" element={<Navigate to="/history?tab=picks" replace />} />
          <Route path="/overnight" element={<OvernightPage />} />
          <Route path="/market" element={<MarketPage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
        </PageTransition>
      </main>

      <StockModal />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <DashboardAuthGate>
        <AppProvider>
          <AppShell />
        </AppProvider>
      </DashboardAuthGate>
    </Router>
  );
}
