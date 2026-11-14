import hmac
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import threading
from datetime import datetime
import requests
import state
from config import ALPACA_API_KEY, ALPACA_SECRET_KEY, RESEARCH_TRIGGER_TOKEN
from utils import is_market_open, seconds_until_market_open
from research import run_research_cycle
from longterm import generate_longterm_picks, trigger_longterm_async, DEFAULT_PICKS_DATA
from overnight_analysis import run_overnight_refresh

# Initialize longterm picks if empty
state.load_longterm_picks()
if not state.longterm_data or not state.longterm_data.get("picks"):
    state.longterm_data = dict(DEFAULT_PICKS_DATA)
    state.save_longterm_picks()

api = FastAPI()
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@api.middleware("http")
async def disable_api_cache(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    return response

@api.get("/")
def health_check():
    return {"status": "online", "message": "Autonomous Alpha Trading Bot API"}

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

@api.get("/longterm_picks")
def get_longterm_picks():
    if not state.longterm_data or not state.longterm_data.get("picks"):
        state.longterm_data = dict(DEFAULT_PICKS_DATA)
        state.save_longterm_picks()
    return state.longterm_data

@api.get("/overnight_analysis")
def get_overnight_analysis():
    return state.overnight_analysis

@api.get("/overnight_analysis/status")
def get_overnight_analysis_status():
    analysis = state.overnight_analysis
    return {
        "status": analysis.get("status", "idle"),
        "last_refresh": analysis.get("last_refresh"),
        "last_attempt": analysis.get("last_attempt"),
        "error": analysis.get("error"),
        "event_count": len(analysis.get("events", [])),
    }

@api.post("/overnight_analysis/refresh")
def trigger_overnight_analysis():
    threading.Thread(target=run_overnight_refresh, daemon=True).start()
    return {"status": "overnight refresh triggered", "timestamp": datetime.now().isoformat()}

@api.post("/trigger_longterm")
def trigger_longterm():
    trigger_longterm_async()
    return {"status": "longterm research triggered", "timestamp": datetime.now().isoformat()}

@api.post("/trigger_research")
def trigger_research(reason: str = "manual"):
    threading.Thread(
        target=run_research_cycle,
        kwargs={"force": True, "manual_reason": reason},
        daemon=True,
    ).start()
    return {"status": "research triggered", "timestamp": datetime.now().isoformat()}

@api.post("/scheduled/trigger_research")
def trigger_scheduled_research(
    x_research_trigger_token: str | None = Header(default=None),
):
    if not RESEARCH_TRIGGER_TOKEN:
        raise HTTPException(status_code=503, detail="Scheduled research trigger is not configured.")
    if not x_research_trigger_token or not hmac.compare_digest(
        x_research_trigger_token,
        RESEARCH_TRIGGER_TOKEN,
    ):
        raise HTTPException(status_code=401, detail="Invalid research trigger token.")
    return trigger_research(reason="cron_job_org")

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
    try:
        if not ALPACA_API_KEY or not ALPACA_SECRET_KEY:
            return {"error": "Alpaca credentials missing", "positions": []}

        headers = {
            "Apca-Api-Key-Id": ALPACA_API_KEY,
            "Apca-Api-Secret-Key": ALPACA_SECRET_KEY,
        }
        account_response = requests.get(
            "https://paper-api.alpaca.markets/v2/account",
            headers=headers,
            timeout=10,
        )
        account_response.raise_for_status()
        account = account_response.json()

        positions_response = requests.get(
            "https://paper-api.alpaca.markets/v2/positions",
            headers=headers,
            timeout=10,
        )
        positions_response.raise_for_status()
        positions = positions_response.json()
        positions_data = []
        for position in positions:
            symbol = str(position.get("symbol", "")).strip()
            quantity = float(position.get("qty", 0) or 0)
            avg_price = float(position.get("avg_entry_price", 0) or 0)
            current_price = float(position.get("current_price", 0) or 0)
            invested = float(position.get("cost_basis", 0) or 0)
            current_value = float(position.get("market_value", 0) or 0)
            unrealized_pnl = float(position.get("unrealized_pl", 0) or 0)
            unrealized_pnl_pct = float(position.get("unrealized_plpc", 0) or 0) * 100
            research = state.research_reports.get(symbol, {})
            positions_data.append({
                "symbol": symbol,
                "name": str(research.get("name", symbol)),
                "quantity": quantity,
                "avg_price": float(round(avg_price, 2)),
                "current_price": float(round(current_price, 2)),
                "invested": float(round(invested, 2)),
                "current_value": float(round(current_value, 2)),
                "unrealized_pnl": float(round(unrealized_pnl, 2)),
                "unrealized_pnl_pct": float(round(unrealized_pnl_pct, 2)),
                "ai_grade": int(research.get("ai_grade", 50)),
                "risk_level": str(research.get("risk_level", "Medium")),
                "stop_loss": float(research.get("stop_loss")) if research.get("stop_loss") is not None else None,
            })
        return {
            "positions": positions_data,
            "total_invested": float(sum(p["invested"] for p in positions_data)),
            "total_value": float(account.get("portfolio_value", account.get("equity", 0)) or 0),
            "cash": float(account.get("cash", 0) or 0),
            "total_unrealized_pnl": float(sum(p["unrealized_pnl"] for p in positions_data)),
            "is_live_alpaca": True,
        }
    except requests.RequestException as exc:
        return {"error": f"Alpaca positions request failed: {exc}", "positions": []}
    except (TypeError, ValueError, KeyError) as exc:
        return {"error": f"Alpaca positions response invalid: {exc}", "positions": []}
