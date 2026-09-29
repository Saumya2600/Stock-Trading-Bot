#!/usr/bin/env python
import sys
import os

backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)

print("[DEBUG] Starting trade runner...")
print(f"[DEBUG] Backend path: {backend_path}")
print(f"[DEBUG] Files exist: reports={os.path.exists(os.path.join(backend_path, 'reports.json'))}, state={os.path.exists(os.path.join(backend_path, 'app_state.json'))}")

try:
    from utils import safe_print, is_market_open
    import state
    from datetime import datetime
    
    print(f"[DEBUG] Imports OK. Market open={is_market_open()}")
    
    if not is_market_open():
        print("[DEBUG] Market closed, exiting")
        sys.exit(0)
    
    print("[DEBUG] Loading state...")
    state.load_reports()
    state.load_app_state()
    
    report_symbols = [k for k in state.research_reports if not k.startswith("_")]
    print(f"[DEBUG] Loaded {len(report_symbols)} reports: {report_symbols[:5]}")
    
    if not state.research_reports:
        print("[DEBUG] No reports, exiting")
        sys.exit(0)
    
    print("[DEBUG] Launching trader...")
    from config import ALPACA_CREDS
    from lumibot.brokers import Alpaca
    from lumibot.traders import Trader
    from strategy import DeepResearchBot
    
    broker = Alpaca(ALPACA_CREDS)
    strategy = DeepResearchBot(name="test", broker=broker, parameters={"one_shot": True})
    state.strategy_instance = strategy
    
    trader = Trader()
    trader.add_strategy(strategy)
    
    print("[DEBUG] Running trader...")
    trader.run_all()
    print("[DEBUG] Trader complete")
    
except Exception as e:
    print(f"[ERROR] {type(e).__name__}: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc()
    sys.exit(1)
