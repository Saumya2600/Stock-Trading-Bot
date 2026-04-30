# Global State and Caching
latest_signals = {}
research_reports = {}
fmp_cache = {}
trade_history = []
reddit_cache = {}
low_cache = {}
portfolio_performance = {
    "bot_roi": 0.0,
    "spy_roi": 0.0,
    "trades_count": 0,
    "bot_start_value": 0.0,
    "spy_start_price": 0.0
}
strategy_instance = None

REPORTS_FILE = "reports.json"
FMP_CACHE_FILE = "fmp_cache.json"
STATE_FILE = "app_state.json"
REDDIT_CACHE_FILE = "reddit_cache.json"
LOW_CACHE_FILE = "low_cache.json"

import os
import json

def save_json(obj, path):
    try:
        with open(path, "w") as f:
            json.dump(obj, f, indent=4)
    except Exception as e:
        print(f"Error saving {path}: {e}")

def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading {path}: {e}")
    return default

def save_app_state():
    save_json({
        "trade_history": trade_history,
        "portfolio_performance": portfolio_performance
    }, STATE_FILE)

def load_app_state():
    global trade_history, portfolio_performance
    state_data = load_json(STATE_FILE, {})
    if isinstance(state_data.get("trade_history"), list):
        trade_history.clear()
        trade_history.extend(state_data.get("trade_history", []))
    if isinstance(state_data.get("portfolio_performance"), dict):
        portfolio_performance.update(state_data.get("portfolio_performance", {}))
    portfolio_performance["trades_count"] = max(portfolio_performance.get("trades_count", 0), len(trade_history))

def save_fmp_cache():
    save_json(fmp_cache, FMP_CACHE_FILE)

def load_fmp_cache():
    global fmp_cache
    fmp_cache.update(load_json(FMP_CACHE_FILE, {}))

def save_reports():
    save_json(research_reports, REPORTS_FILE)

def load_reports():
    global research_reports
    research_reports.update(load_json(REPORTS_FILE, {}))

def save_reddit_cache():
    save_json(reddit_cache, REDDIT_CACHE_FILE)

def load_reddit_cache():
    global reddit_cache
    reddit_cache.update(load_json(REDDIT_CACHE_FILE, {}))

def save_low_cache():
    save_json(low_cache, LOW_CACHE_FILE)

def load_low_cache():
    global low_cache
    low_cache.update(load_json(LOW_CACHE_FILE, {}))
