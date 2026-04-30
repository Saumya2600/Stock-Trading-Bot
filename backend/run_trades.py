import os
import sys
from datetime import datetime
import pytz

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from lumibot.brokers import Alpaca
from lumibot.traders import Trader
from bot import DeepResearchBot, ALPACA_CREDS, load_app_state, load_reports
from utils import safe_print

def is_market_open():
    eastern = pytz.timezone("US/Eastern")
    now = datetime.now(tz=pytz.utc).astimezone(eastern)
    if now.weekday() >= 5: return False
    open_time = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_time = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return open_time <= now < close_time

if __name__ == "__main__":
    if not is_market_open():
        safe_print(f"[{datetime.now()}] GITHUB ACTION: Market closed. Skipping trade cycle.")
        sys.exit(0)

    safe_print(f"[{datetime.now()}] GITHUB ACTION: Starting trading cycle...")
    
    # Load state from disk (committed by research or previous trade run)
    load_app_state()
    load_reports()

    try:
        broker = Alpaca(ALPACA_CREDS)
        strategy = DeepResearchBot(broker=broker)
        
        # We manually call the iteration once for a serverless-style execution
        # Lumibot strategies need some internal setup which Trader.run_bot normally does
        # But for a single run, we can trigger the core logic.
        
        # Note: We need to ensure strategy has its internal objects
        strategy.initialize()
        strategy.on_trading_iteration()
        
        safe_print(f"[{datetime.now()}] GITHUB ACTION: Trading cycle completed.")
    except Exception as e:
        safe_print(f"[{datetime.now()}] GITHUB ACTION ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
