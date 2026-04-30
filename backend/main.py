import threading
import uvicorn
from lumibot.brokers import Alpaca
from lumibot.traders import Trader

from config import ALPACA_CREDS
import state
from research import research_scheduler
from strategy import DeepResearchBot
from server import api

def start_bot():
    broker = Alpaca(ALPACA_CREDS)
    strategy = DeepResearchBot(
        name="Autonomous_Alpha_v1",
        broker=broker
    )
    state.strategy_instance = strategy
    trader = Trader()
    trader.add_strategy(strategy)
    trader.run_all()

if __name__ == "__main__":
    state.load_reports()
    state.load_fmp_cache()
    state.load_app_state()
    state.load_reddit_cache()
    state.load_low_cache()

    threading.Thread(target=research_scheduler, daemon=True).start()
    threading.Thread(target=start_bot, daemon=True).start()
    print("[ONLINE] Autonomous Research Bot - ONLINE")
    print("[PERFORMANCE] Tracking performance vs SPY...")
    uvicorn.run(api, host="0.0.0.0", port=8001)
