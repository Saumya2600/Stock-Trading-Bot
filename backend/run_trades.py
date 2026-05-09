import os
import sys
from datetime import datetime

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils import safe_print, is_market_open
import state

def main():
    if not is_market_open():
        safe_print(f"[{datetime.now()}] TRADE RUNNER: Market closed. Skipping trade cycle.")
        sys.exit(0)

    safe_print(f"[{datetime.now()}] TRADE RUNNER: Market open. Loading state...")

    # Load persisted research reports and app state from disk
    state.load_reports()
    state.load_app_state()

    if not state.research_reports:
        safe_print(f"[{datetime.now()}] TRADE RUNNER: No research reports found. Run research first. Exiting.")
        sys.exit(0)

    # Log what we have
    report_symbols = [k for k in state.research_reports if not k.startswith("_")]
    safe_print(f"[{datetime.now()}] TRADE RUNNER: Loaded {len(report_symbols)} research reports: {report_symbols}")
    high_conviction = [(s, state.research_reports[s].get('ai_grade', 0)) for s in report_symbols if state.research_reports[s].get('ai_grade', 0) >= 55]
    safe_print(f"[{datetime.now()}] TRADE RUNNER: High-conviction (grade>=55): {high_conviction}")

    try:
        from config import ALPACA_CREDS
        from lumibot.brokers import Alpaca
        from lumibot.traders import Trader
        from strategy import DeepResearchBot

        broker = Alpaca(ALPACA_CREDS)
        strategy = DeepResearchBot(
            name="Autonomous_Alpha_v1",
            broker=broker,
        )
        state.strategy_instance = strategy

        trader = Trader()
        trader.add_strategy(strategy)

        safe_print(f"[{datetime.now()}] TRADE RUNNER: Starting Lumibot trader (single cycle)...")
        # run_all blocks — for GitHub Actions we rely on sleeptime="1M" then a fast exit
        # The strategy's on_trading_iteration will fire once then we let it finish naturally
        trader.run_all()

        safe_print(f"[{datetime.now()}] TRADE RUNNER: Trading cycle completed.")
    except Exception as e:
        safe_print(f"[{datetime.now()}] TRADE RUNNER ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
