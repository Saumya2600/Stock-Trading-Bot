import os
import threading
import time
import uvicorn
from lumibot.brokers import Alpaca
from lumibot.traders import Trader

from config import ALPACA_CREDS
import state
from research import research_scheduler
from overnight_analysis import overnight_scheduler
from strategy import DeepResearchBot
from server import api

def start_bot():
    """Run the Lumibot strategy loop, and restart it if it ever dies.

    A crashed thread used to leave uvicorn serving 200s while no trading
    happened at all, which is indistinguishable from healthy.
    """
    while True:
        try:
            broker = Alpaca(ALPACA_CREDS)
            strategy = DeepResearchBot(
                name="Autonomous_Alpha_v1",
                broker=broker
            )
            state.strategy_instance = strategy
            trader = Trader()
            trader.add_strategy(strategy)
            trader.run_all()
            print("[TRADER] Strategy loop returned; restarting in 60s")
        except Exception as error:
            print(f"[TRADER ERROR] {error}")
        time.sleep(60)

if __name__ == "__main__":
    state.load_reports()
    state.load_fmp_cache()
    state.load_app_state()
    state.load_reddit_cache()
    state.load_low_cache()
    state.load_longterm_picks()
    state.load_overnight_analysis()

    # Render web service handles pre-market and close research scans.
    # The GitHub workflow is the canonical research runner: it commits what it
    # finds, so both the trader and the dashboard see the same reports. Running
    # this scheduler too means paying Gemini twice for one prescan.
    if os.getenv("RESEARCH_SCHEDULER", "on").strip().lower() in ("off", "false", "0"):
        print("[SCHEDULER] In-process research scheduler disabled; GitHub Actions runs it.")
    else:
        threading.Thread(target=research_scheduler, daemon=True).start()
    threading.Thread(target=overnight_scheduler, daemon=True).start()

    # Only one host may submit orders. Both Render and GitHub Actions can run a
    # cycle, and two engines checking "no position yet" at 9:35 can both buy.
    # Default is the Actions path: it commits state, so its trades reach the UI.
    engine = os.getenv("TRADING_ENGINE", "actions").strip().lower()
    if engine == "render":
        print("[TRADER] Lumibot loop enabled on this host")
        threading.Thread(target=start_bot, daemon=True).start()
    else:
        print("[TRADER] Disabled on this host — GitHub Actions runs the trading cycle. Set TRADING_ENGINE=render to enable.")
    print("[ONLINE] Autonomous Research Bot - ONLINE")
    print("[PERFORMANCE] Tracking performance vs SPY...")
    uvicorn.run(api, host="0.0.0.0", port=int(os.getenv("PORT", "8001")))
