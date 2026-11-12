import os
import sys
from datetime import datetime
import requests

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils import safe_print, is_market_open
import state


def verify_paper_credentials():
    """Fail early with a useful message when Alpaca paper keys are invalid."""
    api_key = os.getenv("VITE_ALPACA_API_KEY")
    api_secret = os.getenv("VITE_ALPACA_SECRET_KEY")
    if not api_key or not api_secret:
        raise RuntimeError(
            "ALPACA_AUTH_ERROR: GitHub paper secrets are missing. "
            "Set VITE_ALPACA_API_KEY and VITE_ALPACA_SECRET_KEY."
        )

    response = requests.get(
        "https://paper-api.alpaca.markets/v2/account",
        headers={
            "Apca-Api-Key-Id": api_key,
            "Apca-Api-Secret-Key": api_secret,
        },
        timeout=10,
    )
    if response.status_code == 401:
        raise RuntimeError(
            "ALPACA_AUTH_ERROR: GitHub paper secrets are invalid or expired. "
            "Regenerate the Paper API key pair, then update both GitHub secrets."
        )
    response.raise_for_status()
    account = response.json()
    if str(account.get("status", "")).lower() != "active":
        raise RuntimeError(
            f"ALPACA_AUTH_ERROR: Paper account is not active ({account.get('status')})."
        )


def main():
    if not is_market_open():
        safe_print(f"[{datetime.now()}] TRADE RUNNER: Market closed. Skipping trade cycle.")
        sys.exit(0)

    safe_print(f"[{datetime.now()}] TRADE RUNNER: Market open. Loading state...")

    # Load persisted research reports and app state from disk
    state.load_reports()
    state.load_longterm_picks()
    state.load_app_state()

    if not state.research_reports and not state.longterm_data.get("picks"):
        safe_print(f"[{datetime.now()}] TRADE RUNNER: No research reports or long-term picks found. Exiting.")
        sys.exit(0)

    # Log what we have
    report_symbols = [k for k in state.research_reports if not k.startswith("_")]
    safe_print(f"[{datetime.now()}] TRADE RUNNER: Loaded {len(report_symbols)} research reports: {report_symbols}")
    safe_print(
        f"[{datetime.now()}] TRADE RUNNER: Loaded "
        f"{len(state.longterm_data.get('picks', []))} long-term picks"
    )
    high_conviction = [(s, state.research_reports[s].get('ai_grade', 0)) for s in report_symbols if state.research_reports[s].get('ai_grade', 0) >= 55]
    safe_print(f"[{datetime.now()}] TRADE RUNNER: High-conviction (grade>=55): {high_conviction}")

    try:
        verify_paper_credentials()
        safe_print(f"[{datetime.now()}] TRADE RUNNER: Paper Alpaca credentials verified.")
        from config import ALPACA_CREDS
        from lumibot.brokers import Alpaca
        from lumibot.traders import Trader
        from strategy import DeepResearchBot

        broker = Alpaca(ALPACA_CREDS)
        strategy = DeepResearchBot(
            name="Autonomous_Alpha_v1",
            broker=broker,
            parameters={"one_shot": True}
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
