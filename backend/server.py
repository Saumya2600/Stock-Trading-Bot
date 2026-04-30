from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading
from datetime import datetime
import state
from utils import is_market_open, seconds_until_market_open
from research import run_research_cycle

api = FastAPI()
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api.get("/signals")
def get_signals():
    return state.latest_signals

@api.get("/research")
def get_research():
    return state.research_reports

@api.get("/research_status")
def get_research_status():
    symbol_keys = [key for key in state.research_reports.keys() if not key.startswith("_")]
    return {
        "last_run": state.research_reports.get("_last_run"),
        "market_open": is_market_open(),
        "next_market_open_sec": seconds_until_market_open(),
        "research_symbols": symbol_keys,
        "research_count": len(symbol_keys),
    }

@api.post("/trigger_research")
def trigger_research():
    threading.Thread(target=run_research_cycle, kwargs={"force": True, "manual_reason": "manual"}, daemon=True).start()
    return {"status": "research triggered", "timestamp": datetime.now().isoformat()}

@api.post("/clear_research")
def clear_research():
    keys = [key for key in state.research_reports.keys() if not key.startswith("_")]
    for key in keys:
        state.research_reports.pop(key, None)
    state.latest_signals.clear()
    state.research_reports["_last_run"] = datetime.now().isoformat()
    state.save_reports()
    return {"status": "research cleared", "cleared_symbols": len(keys), "timestamp": datetime.now().isoformat()}

@api.post("/clear_history")
def clear_history():
    state.trade_history.clear()
    state.portfolio_performance["trades_count"] = 0
    state.save_app_state()
    return {"status": "trade history cleared", "timestamp": datetime.now().isoformat()}

@api.get("/trade_history")
def get_trade_history():
    return {"history": state.trade_history[-20:][::-1]}

@api.get("/performance")
def get_performance():
    state.portfolio_performance["trades_count"] = max(state.portfolio_performance.get("trades_count", 0), len(state.trade_history))
    return state.portfolio_performance

@api.get("/positions")
def get_positions():
    if not state.strategy_instance:
        return {"error": "Bot not initialized"}
    try:
        positions_data = []
        positions = state.strategy_instance.get_positions()
        for position in positions:
            symbol = position.symbol
            quantity = position.quantity
            avg_price = position.avg_fill_price or 0
            current_price = state.strategy_instance.get_last_price(symbol)
            if current_price > 0:
                invested = quantity * avg_price
                current_value = quantity * current_price
                unrealized_pnl = current_value - invested
                unrealized_pnl_pct = (unrealized_pnl / invested) * 100 if invested > 0 else 0
                spy_price = state.strategy_instance.get_last_price("SPY")
                spy_start = state.portfolio_performance.get("spy_start_price", spy_price)
                spy_roi = ((spy_price - spy_start) / spy_start) * 100 if spy_start > 0 else 0
                sell_target_pct = spy_roi + 5
                sell_target_price = current_price * (1 + sell_target_pct / 100)
                research = state.research_reports.get(symbol, {})
                positions_data.append({
                    "symbol": symbol,
                    "name": str(research.get("name", symbol)),
                    "quantity": float(quantity),
                    "avg_price": float(round(avg_price, 2)),
                    "current_price": float(round(current_price, 2)),
                    "invested": float(round(invested, 2)),
                    "current_value": float(round(current_value, 2)),
                    "unrealized_pnl": float(round(unrealized_pnl, 2)),
                    "unrealized_pnl_pct": float(round(unrealized_pnl_pct, 2)),
                    "sell_target_price": float(round(sell_target_price, 2)),
                    "sell_target_pct": float(round(sell_target_pct, 2)),
                    "spy_roi": float(round(spy_roi, 2)),
                    "ai_grade": int(research.get("ai_grade", 50)),
                    "risk_level": str(research.get("risk_level", "Medium")),
                    "stop_loss": float(research.get("stop_loss")) if research.get("stop_loss") is not None else None
                })
        return {
            "positions": positions_data,
            "total_invested": float(sum(p["invested"] for p in positions_data)),
            "total_value": float(sum(p["current_value"] for p in positions_data)),
            "total_unrealized_pnl": float(sum(p["unrealized_pnl"] for p in positions_data))
        }
    except Exception as e:
        return {"error": str(e)}
