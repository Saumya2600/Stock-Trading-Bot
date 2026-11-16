import { useSearchParams } from 'react-router-dom';
import { LineChart as ChartIcon, Database } from 'lucide-react';
import TradeHistoryPage from './TradeHistoryPage';
import PicksHistoryPage from './PicksHistoryPage';

/* Picks and executions were two sidebar entries for one question: what happened?
   They live together now, with the old /picks URL redirecting into the picks tab. */
export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'picks' ? 'picks' : 'trades';

  const select = next => {
    const draft = new URLSearchParams(params);
    if (next === 'trades') draft.delete('tab');
    else draft.set('tab', next);
    setParams(draft, { replace: true });
  };

  return (
    <div className="page-enter">
      <header className="page-head">
        <div>
          <h1 className="display-lg">History</h1>
          <p className="headline-sm" style={{ marginTop: '0.4rem' }}>
            Research picks and executed trades, in one place
          </p>
        </div>
      </header>

      <div className="segmented" role="tablist" aria-label="History view">
        <button
          role="tab"
          className="segmented__item"
          aria-selected={tab === 'trades'}
          onClick={() => select('trades')}
        >
          <ChartIcon size={13} aria-hidden="true" /> Trades
        </button>
        <button
          role="tab"
          className="segmented__item"
          aria-selected={tab === 'picks'}
          onClick={() => select('picks')}
        >
          <Database size={13} aria-hidden="true" /> Picks
        </button>
      </div>

      {tab === 'picks' ? <PicksHistoryPage embedded /> : <TradeHistoryPage embedded />}
    </div>
  );
}
