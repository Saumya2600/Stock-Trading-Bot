import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Calendar, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Lightbulb, 
  ShieldCheck, 
  Zap,
  Target,
  ArrowRight
} from 'lucide-react';

const ReportCard = ({ symbol, data }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const aiGrade = data.ai_grade || 50;
  const gradeColor = aiGrade > 80 ? 'var(--primary)' : aiGrade < 40 ? 'var(--secondary)' : '#ffd60a';
  const price = typeof data.price === 'number' ? data.price : 0;
  const targetPrice = typeof data.target_price === 'number' ? data.target_price : 0;
  const stopLoss = typeof data.stop_loss === 'number' ? data.stop_loss : 0;
  const catalysts = typeof data.key_catalysts === 'string' ? data.key_catalysts.split(';') : [];
  
  return (
    <div className={`glass-card ${isExpanded ? 'expanded' : ''}`} style={{ 
      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'default',
      marginBottom: '1rem',
      overflow: 'hidden'
    }}>
      <div className="glass-card-inner-shadow" />
      
      {/* Header / Summary View */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsExpanded(!isExpanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1 }}>
          <div style={{ position: 'relative' }}>
             <div className="ticker" style={{ fontSize: '2rem' }}>{symbol}</div>
             <div style={{ 
               position: 'absolute', top: '-10px', right: '-15px', 
               background: gradeColor, color: '#000', fontSize: '0.6rem', 
               padding: '2px 6px', borderRadius: '4px', fontWeight: '900',
               boxShadow: `0 0 10px ${gradeColor}66`
             }}>
               {aiGrade}
             </div>
          </div>
          
          <div style={{ flex: 1 }}>
            <div className="headline-md" style={{ marginBottom: '0.25rem' }}>{data.name || symbol}</div>
            <div className="label-sm" style={{ opacity: 0.6, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={12} /> {data.updated_at ? new Date(data.updated_at).toLocaleDateString() : 'N/A'} at {data.updated_at ? new Date(data.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', marginRight: '2rem' }}>
             <div style={{ textAlign: 'right' }}>
                <div className="label-sm">Current</div>
                <div className="headline-sm" style={{ fontSize: '1rem' }}>${price.toFixed(2)}</div>
             </div>
             <div style={{ textAlign: 'right' }}>
                <div className="label-sm" style={{ color: 'var(--primary)' }}>Target</div>
                <div className="headline-sm" style={{ fontSize: '1rem', color: 'var(--primary)' }}>${targetPrice.toFixed(2)}</div>
             </div>
             <div style={{ textAlign: 'right' }}>
                <div className="label-sm" style={{ color: 'var(--on-surface-variant)' }}>Risk</div>
                <div className={`chip ${data.risk_level === 'High' ? 'negative' : 'positive'}`} style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
                  {data.risk_level || 'Medium'}
                </div>
             </div>
          </div>
        </div>

        <button style={{ 
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', 
          borderRadius: '50%', width: '40px', height: '40px', display: 'flex', 
          alignItems: 'center', justifyContent: 'center', color: '#fff', cursor: 'pointer',
          transition: 'transform 0.3s'
        }}>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {/* Expanded Details */}
      <div style={{ 
        maxHeight: isExpanded ? '1500px' : '0', 
        opacity: isExpanded ? 1 : 0,
        transition: 'all 0.5s ease-in-out',
        marginTop: isExpanded ? '2rem' : '0',
        borderTop: isExpanded ? '1px solid rgba(255,255,255,0.05)' : 'none',
        paddingTop: isExpanded ? '2rem' : '0'
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
          
          {/* Left Column: Analysis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <section>
              <h4 className="label-md" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', color: 'var(--on-surface)' }}>
                <Zap size={14} className="text-primary" /> Executive Reasoning
              </h4>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.6', color: 'var(--on-surface-variant)', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                {data.reasoning}
              </p>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="glass-card" style={{ background: 'rgba(63, 255, 139, 0.03)', border: '1px solid rgba(63, 255, 139, 0.1)' }}>
                <h4 className="label-sm" style={{ color: 'var(--primary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingUp size={12} /> Bull Thesis
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: '1.4' }}>{data.bull_case}</p>
              </div>
              <div className="glass-card" style={{ background: 'rgba(255, 113, 108, 0.03)', border: '1px solid rgba(255, 113, 108, 0.1)' }}>
                <h4 className="label-sm" style={{ color: 'var(--secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <TrendingDown size={12} /> Bear Risks
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: '1.4' }}>{data.bear_case}</p>
              </div>
            </div>
          </div>

          {/* Right Column: Key Metrics & Catalysts */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Fundamentals Block */}
            {data.fundamentals && (
              <div className="glass-card" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <h4 className="label-md" style={{ marginBottom: '1.25rem', color: 'var(--on-surface)' }}>Fundamental Ledger</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <div className="label-sm" style={{ opacity: 0.5 }}>P/E Ratio</div>
                    <div className="headline-sm">{data.fundamentals.pe || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="label-sm" style={{ opacity: 0.5 }}>PEG Ratio</div>
                    <div className="headline-sm">{data.fundamentals.peg || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="label-sm" style={{ opacity: 0.5 }}>Debt / Equity</div>
                    <div className="headline-sm">{data.fundamentals.debt_to_equity || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="label-sm" style={{ opacity: 0.5 }}>Sector</div>
                    <div className="headline-sm" style={{ fontSize: '0.8rem' }}>{data.fundamentals.sector || 'Unknown'}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="glass-card" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <h4 className="label-md" style={{ marginBottom: '1.25rem', color: 'var(--on-surface)' }}>Key Catalysts</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {catalysts.map((catalyst, i) => (
                  <div key={i} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ marginTop: '4px', minWidth: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary)' }} />
                    <span style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)' }}>{catalyst.trim()}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
               <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="label-sm">Entry Limit</div>
                  <div className="headline-md" style={{ marginTop: '0.25rem' }}>${price.toFixed(2)}</div>
               </div>
               <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="label-sm">Stop Loss (ATR)</div>
                  <div className="headline-md" style={{ marginTop: '0.25rem', color: 'var(--secondary)' }}>${stopLoss.toFixed(2)}</div>
               </div>
            </div>

            {(data.support_level || data.resistance_level) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(63,255,139,0.04)', borderRadius: '12px', border: '1px solid rgba(63,255,139,0.12)' }}>
                  <div className="label-sm" style={{ color: '#3fff8b' }}>Support Level</div>
                  <div className="headline-md" style={{ marginTop: '0.25rem', color: '#3fff8b' }}>${(data.support_level || 0).toFixed(2)}</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(255,113,108,0.04)', borderRadius: '12px', border: '1px solid rgba(255,113,108,0.12)' }}>
                  <div className="label-sm" style={{ color: '#ff716c' }}>Resistance Level</div>
                  <div className="headline-md" style={{ marginTop: '0.25rem', color: '#ff716c' }}>${(data.resistance_level || 0).toFixed(2)}</div>
                </div>
              </div>
            )}

            <div style={{ 
              marginTop: 'auto', padding: '1.5rem', 
              background: 'linear-gradient(135deg, rgba(63, 255, 139, 0.1), transparent)', 
              borderRadius: '16px', border: '1px solid rgba(63, 255, 139, 0.2)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <div className="label-sm" style={{ color: 'var(--primary)' }}>Projected Alpha</div>
                <div className="display-lg" style={{ fontSize: '1.75rem', marginTop: '0.25rem' }}>
                  +{price > 0 ? ((targetPrice / price - 1) * 100).toFixed(1) : '0.0'}%
                </div>
              </div>
              <ShieldCheck size={32} style={{ opacity: 0.2, color: 'var(--primary)' }} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

const ExpandableReportCards = ({ reports = {} }) => {
  const symbols = Object.keys(reports).filter(k => !k.startsWith('_'));
  
  if (symbols.length === 0) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', opacity: 0.5 }}>
        <Lightbulb size={48} style={{ marginBottom: '1.5rem' }} />
        <h2 className="headline-sm">No Intelligence Reports Found</h2>
        <p>Run the research engine to generate deep-tech insights.</p>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.8s ease-out' }}>
      <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div className="label-md" style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Market Intelligence</div>
          <h2 className="display-lg" style={{ fontSize: '2.5rem' }}>Neural Research Reports</h2>
          <p className="headline-sm" style={{ marginTop: '0.5rem', opacity: 0.7 }}>Autonomous multi-factor discovery and risk assessment</p>
        </div>
        <div style={{ textAlign: 'right' }}>
           <div className="label-sm">Total Reports</div>
           <div className="headline-md" style={{ fontSize: '1.5rem' }}>{symbols.length}</div>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {symbols.sort((a, b) => (reports[b].ai_grade || 0) - (reports[a].ai_grade || 0)).map(symbol => (
          <ReportCard key={symbol} symbol={symbol} data={reports[symbol]} />
        ))}
      </div>
    </div>
  );
};

export default ExpandableReportCards;
