import os
import sys
import time
import threading
import requests
import pandas as pd
import uvicorn
import pytz
from datetime import datetime, timedelta, date
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import random

from lumibot.brokers import Alpaca
from lumibot.strategies.strategy import Strategy
from lumibot.traders import Trader

import google.generativeai as genai

# --- Utility Functions ---

def safe_print(s: str):
    """Print safely on Windows consoles by replacing characters that can't be encoded."""
    try:
        sys.stdout.write(s + "\n")
    except Exception:
        enc = sys.stdout.encoding or 'utf-8'
        try:
            out = s.encode(enc, errors='replace').decode(enc)
            sys.stdout.write(out + "\n")
        except Exception:
            sys.stdout.write(s.encode('utf-8', errors='replace').decode('utf-8') + "\n")


def simple_sma(series, length):
    return series.rolling(length).mean()


def simple_rsi(series, length=14):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(length, min_periods=length).mean()
    avg_loss = loss.rolling(length, min_periods=length).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def is_market_open(now=None):
    """Return True if US market is open (9:30am-4:00pm ET, Mon-Fri)."""
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)
    if now.weekday() >= 5:  # Saturday/Sunday
        return False
    open_time = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_time = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return open_time <= now < close_time

def seconds_until_market_open(now=None):
    """Return seconds until next market open (9:30am ET)."""
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)
    if now.weekday() >= 5:  # Saturday/Sunday
        # Next Monday 9:30am
        days_ahead = 7 - now.weekday()
        next_open = (now + timedelta(days=days_ahead)).replace(hour=9, minute=30, second=0, microsecond=0)
    elif now.hour < 9 or (now.hour == 9 and now.minute < 30):
        next_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
    elif now >= now.replace(hour=16, minute=0, second=0, microsecond=0):
        # After close, next day
        days_ahead = 1 if now.weekday() < 4 else 7 - now.weekday()
        next_open = (now + timedelta(days=days_ahead)).replace(hour=9, minute=30, second=0, microsecond=0)
    else:
        return 0
    return int((next_open - now).total_seconds())

# --- Load Environment ---

load_dotenv('../.env')
ALPACA_API_KEY = os.getenv("VITE_ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("VITE_ALPACA_SECRET_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_API_KEY_FALLBACK = os.getenv("GOOGLE_API_KEY_FALLBACK")
FMP_API_KEY = os.getenv("fmp")
ALPACA_CREDS = {
    "API_KEY": ALPACA_API_KEY,
    "API_SECRET": ALPACA_SECRET_KEY,
    "PAPER": True,
}

# --- Global State and Caching ---

latest_signals = {}
research_reports = {}
fmp_cache = {}
trade_history = []
reddit_cache = {}
low_cache = {}
REPORTS_FILE = "reports.json"
FMP_CACHE_FILE = "fmp_cache.json"
STATE_FILE = "app_state.json"
REDDIT_CACHE_FILE = "reddit_cache.json"
LOW_CACHE_FILE = "low_cache.json"
strategy_instance = None

# --- Persistence Helpers ---

def save_json(obj, path):
    try:
        import json
        with open(path, "w") as f:
            json.dump(obj, f, indent=4)
    except Exception as e:
        print(f"Error saving {path}: {e}")

def load_json(path, default):
    if os.path.exists(path):
        try:
            import json
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
    state = load_json(STATE_FILE, {})
    if isinstance(state.get("trade_history"), list):
        trade_history.clear()
        trade_history.extend(state.get("trade_history", []))
    if isinstance(state.get("portfolio_performance"), dict):
        portfolio_performance.update(state.get("portfolio_performance", {}))
    portfolio_performance["trades_count"] = max(portfolio_performance.get("trades_count", 0), len(trade_history))
    print(f"[LOADED] Loaded {len(trade_history)} trade history entries from disk.")

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

# --- Gemini Model Setup ---

CURRENT_GEMINI_KEY_INDEX = 0
GEMINI_API_KEYS = [k for k in [GOOGLE_API_KEY, GOOGLE_API_KEY_FALLBACK] if k]
model = None

def configure_gemini():
    global model, CURRENT_GEMINI_KEY_INDEX
    if not GEMINI_API_KEYS:
        model = None
        return
    try:
        genai.configure(api_key=GEMINI_API_KEYS[CURRENT_GEMINI_KEY_INDEX])
        all_models = list(genai.list_models())
        # Prefer flash or flash-lite, fallback to anything with generateContent
        candidates = [m.name for m in all_models if hasattr(m, 'supported_generation_methods') and 'generateContent' in m.supported_generation_methods]
        preferred = [m for m in candidates if "flash" in m.lower()]
        selected = preferred[0] if preferred else (candidates[0] if candidates else None)
        if selected:
            model = genai.GenerativeModel(selected)
            safe_print(f"[GEMINI] Using model: {selected}")
        else:
            model = None
    except Exception as e:
        safe_print(f"[GEMINI CONFIG ERROR] {e}")
        model = None

def switch_gemini_key():
    global CURRENT_GEMINI_KEY_INDEX, model
    if CURRENT_GEMINI_KEY_INDEX < len(GEMINI_API_KEYS) - 1:
        CURRENT_GEMINI_KEY_INDEX += 1
        configure_gemini()
        return True
    return False

configure_gemini()

# --- Market Data and Social Signals ---

def fetch_reddit_trending():
    """Fetch and cache top trending stocks from Reddit via ApeWisdom, daily. Adds randomness for each research cycle."""
    today = str(date.today())
    if reddit_cache.get("date") == today:
        trending = reddit_cache.get("trending", [])
    else:
        try:
            url = "https://apewisdom.io/api/v1.0/filter/all-stocks/page/1"
            response = requests.get(url, timeout=10)
            if response.ok:
                data = response.json()
                trending = [
                    stock['ticker'] for stock in data['results']
                    if stock['ticker'].isalpha() and stock['mentions'] > 10
                ]
                reddit_cache["date"] = today
                reddit_cache["trending"] = trending
                save_reddit_cache()
            else:
                trending = reddit_cache.get("trending", [])
        except Exception as e:
            print(f"Reddit Fetch Error: {e}")
            trending = reddit_cache.get("trending", [])
    # Shuffle and return a random sample for each research cycle
    random.shuffle(trending)
    return trending[:random.randint(5, 10)]


def fetch_52_week_lows():
    """Scan and cache 52-week lows for the day. Adds randomness for each research cycle."""
    today = str(date.today())
    if low_cache.get("date") == today:
        lows = low_cache.get("lows", [])
    else:
        universe = [
            "AAPL", "TSLA", "NVDA", "MSFT", "AMD", "META", "AMZN", "GOOGL", "NFLX", "DIS",
            "ADBE", "PYPL", "INTC", "CSCO", "TSM", "CRM", "SBUX", "NKE", "F", "GM",
            "VZ", "T", "PFE", "JNJ", "WMT", "KO", "PEP", "BA", "CAT", "GE",
            "UAL", "DAL", "AAL", "CCL", "RCL", "NCLH", "MGM", "WYNN", "LVS", "MAR",
            "SQ", "COIN", "HOOD", "PLTR", "U", "SNOW", "NET", "DDOG", "ZS",
            "XOM", "CVX", "SLB", "HAL", "OXY", "DVN", "APA", "MRO", "HES", "COP",
            "JPM", "BAC", "WFC", "C", "GS", "MS", "BLK", "BX", "SCHW", "AXP"
        ]
        lows = []
        headers = {"Apca-Api-Key-Id": ALPACA_API_KEY, "Apca-Api-Secret-Key": ALPACA_SECRET_KEY}
        for symbol in universe:
            try:
                url = f"https://data.alpaca.markets/v2/stocks/{symbol}/bars?timeframe=1Day&limit=252"
                res = requests.get(url, headers=headers).json()
                bars = res.get('bars', [])
                if not bars: continue
                min_low = min([b['l'] for b in bars])
                current_price = bars[-1]['c']
                if current_price <= (min_low * 1.03):
                    asset_url = f"https://api.alpaca.markets/v2/assets/{symbol}"
                    asset_res = requests.get(asset_url, headers=headers).json()
                    company_name = asset_res.get('name', symbol)
                    lows.append({"symbol": symbol, "name": company_name})
            except Exception as e:
                print(f"52-wk Low Scanner Error ({symbol}): {e}")
        low_cache["date"] = today
        low_cache["lows"] = lows
        save_low_cache()
    # Shuffle and return a random sample for each research cycle
    random.shuffle(lows)
    return lows[:random.randint(3, 8)]


def fetch_fmp_data(symbol):
    """Fetch fundamental data from FMP with 48h caching."""
    if not FMP_API_KEY: return None
    now = datetime.now()
    cached = fmp_cache.get(symbol)
    if cached:
        last_updated = datetime.fromisoformat(cached['updated_at'])
        if now - last_updated < timedelta(hours=48):
            return cached['data']
    try:
        profile_url = f"https://financialmodelingprep.com/api/v3/profile/{symbol}?apikey={FMP_API_KEY}"
        metrics_url = f"https://financialmodelingprep.com/api/v3/key-metrics-ttm/{symbol}?apikey={FMP_API_KEY}"
        profile_res = requests.get(profile_url, timeout=10).json()
        metrics_res = requests.get(metrics_url, timeout=10).json()

        if isinstance(profile_res, list) and profile_res and isinstance(metrics_res, list) and metrics_res:
            p = profile_res[0]
            m = metrics_res[0]
            data = {
                "sector": p.get("sector", "Unknown"),
                "industry": p.get("industry", "Unknown"),
                "pe": round(m.get("peRatioTTM", 0), 2),
                "peg": round(m.get("pegRatioTTM", 0), 2),
                "debt_to_equity": round(m.get("debtToEquityTTM", 0), 2),
                "description": p.get("description", "")[:200] + "..."
            }
            fmp_cache[symbol] = {
                "data": data,
                "updated_at": now.isoformat()
            }
            save_fmp_cache()
            return data

        err_msg = None
        if isinstance(profile_res, dict):
            err_msg = profile_res.get("Error Message") or profile_res.get("error") or str(profile_res)
        if isinstance(metrics_res, dict) and not err_msg:
            err_msg = metrics_res.get("Error Message") or metrics_res.get("error") or str(metrics_res)
        if not err_msg:
            err_msg = f"unexpected response types: profile={type(profile_res).__name__}, metrics={type(metrics_res).__name__}"
        print(f"FMP Fetch Error ({symbol}): {err_msg}")
    except Exception as e:
        print(f"FMP Fetch Error ({symbol}): {e}")
    return None

# --- Gemini Deep Research ---

def get_gemini_analysis(symbol, name, news_headlines, current_price, technicals, is_value_scan=False, fundamentals=None):
    """Institutional-grade Gemini research with chain-of-thought and structured output."""
    global model
    if not model:
        return local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals)
    prompt = f"""
You are a senior institutional equity analyst at a top-tier hedge fund. Your job is to produce a deep, multi-step, chain-of-thought research report for {{symbol}} ({{name}}).

1. **Technical Analysis**: 
   - SMA(9), SMA(21), RSI(14), volume trends, recent price action.
   - Is there a golden/death cross? Overbought/oversold? Unusual volume?
2. **Fundamentals**: 
   - Sector/industry, P/E, PEG, debt/equity, business model, recent earnings.
3. **Sector Rotation & Macro**: 
   - Is this sector in/out of favor? Any macro headwinds/tailwinds?
4. **Catalysts**: 
   - Identify key upcoming events, news, or triggers.
5. **Risk Factors**: 
   - What could go wrong? What is the bear case?
6. **Conviction Scoring**: 
   - Assign a 0-100 grade based on all evidence.

**Chain-of-thought reasoning**: Write at least 100 words, step by step, referencing the above.

**Output ONLY valid JSON** with these fields:
{{
  "grade": 0-100,
  "reasoning": "...(100+ words, chain-of-thought)...",
  "entry_price": float,
  "target_price": float,
  "stop_loss": float,
  "risk_level": "Low/Medium/High",
  "key_catalysts": "...",
  "bear_case": "...",
  "bull_case": "..."
}}

**Data**:
- Symbol: {symbol}
- Name: {name}
- Price: {current_price}
- Technicals: {technicals}
- Fundamentals: {fundamentals}
- News: {news_headlines}
- ValueScan: {is_value_scan}

Return ONLY valid JSON, no prose, no markdown.
"""
    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        import json
        data = json.loads(text)
        # Sanity check
        if current_price > 0:
            ratio = data.get('entry_price', current_price) / current_price
            if ratio > 3.0 or ratio < 0.3:
                raise ValueError("AI returned hallucinated price data.")
        return data
    except Exception as e:
        safe_print(f"[GEMINI ERROR] {symbol}: {e}")
        if "429" in str(e) or "quota" in str(e).lower():
            if switch_gemini_key():
                configure_gemini()
                return get_gemini_analysis(symbol, name, news_headlines, current_price, technicals, is_value_scan, fundamentals)
        return local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals)

def local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals):
    """Heuristic fallback for research if Gemini is unavailable."""
    score = 50
    reasons = []
    try:
        # Fundamentals
        if fundamentals:
            pe = fundamentals.get('pe') or 0
            debt = fundamentals.get('debt_to_equity') or 0
            if pe and pe > 0 and pe < 15:
                score += 10
                reasons.append('Attractive P/E')
            if pe and pe > 30:
                score -= 5
                reasons.append('High P/E')
            if debt and debt < 1:
                score += 5
                reasons.append('Low debt')
            if debt and debt > 2:
                score -= 5
                reasons.append('High leverage')
        # Technicals
        fast = technicals.get('sma_fast')
        slow = technicals.get('sma_slow')
        rsi = technicals.get('rsi')
        if fast and slow:
            if fast > slow:
                score += 7
                reasons.append('Bullish SMA crossover')
            else:
                score -= 7
                reasons.append('Bearish SMA crossover')
        if rsi:
            if rsi > 70:
                score -= 5
                reasons.append('Overbought')
            elif rsi < 30:
                score += 5
                reasons.append('Oversold')
        # News
        nh = ' '.join(news_headlines).lower()
        if "upgrade" in nh: score += 5
        if "downgrade" in nh: score -= 5
        # Clamp
        score = max(20, min(90, int(score)))
    except Exception as ex:
        reasons.append(f"Fallback error: {ex}")
    reason_str = ', '.join(reasons) if reasons else "Standard analysis"
    return {
        "grade": score,
        "reasoning": "Local fallback: " + reason_str,
        "entry_price": float(current_price),
        "target_price": float(current_price) * (1 + (score - 50) / 200),
        "stop_loss": float(current_price) * 0.93,
        "risk_level": "Medium" if score >= 50 else "High",
        "key_catalysts": "N/A",
        "bear_case": "N/A",
        "bull_case": "N/A"
    }

# --- Research Cycle ---

def run_research_cycle(force=False, manual_reason=None):
    """Run deep research, respecting all quotas and market hours. Each cycle picks a new random sample."""
    if not is_market_open():
        safe_print("[RESEARCH] Market closed. Skipping research.")
        return
    now = datetime.now()
    last_run = research_reports.get("_last_run")
    if last_run:
        last_run = datetime.fromisoformat(last_run)
        if not force and (now - last_run).total_seconds() < 3 * 3600:
            safe_print("[RESEARCH] Last research <3h ago. Skipping.")
            return
    safe_print(f"[RESEARCH] Starting deep research cycle. Reason: {manual_reason or 'scheduled'}")
    trending = fetch_reddit_trending()
    deep_value_hits = fetch_52_week_lows()
    # Always pick a new random sample for each cycle
    all_targets = list({s['symbol'] for s in deep_value_hits} | set(trending))
    random.shuffle(all_targets)
    all_targets = all_targets[:random.randint(5, 8)]  # Limit for FMP quota, randomize count
    headers = {"Apca-Api-Key-Id": ALPACA_API_KEY, "Apca-Api-Secret-Key": ALPACA_SECRET_KEY}
    temp_reports = {}
    temp_signals = {}

    for symbol in all_targets:
        try:
            # Get name
            name = symbol
            try:
                asset_url = f"https://api.alpaca.markets/v2/assets/{symbol}"
                asset_res = requests.get(asset_url, headers=headers).json()
                name = asset_res.get('name', symbol)
            except: pass
            # News
            news_url = f"https://data.alpaca.markets/v1beta1/news?symbols={symbol}&limit=8"
            news_res = requests.get(news_url, headers=headers).json()
            headlines = [n['headline'] for n in news_res.get('news', [])]
            # Technicals
            bars = requests.get(f"https://data.alpaca.markets/v2/stocks/{symbol}/bars?timeframe=1Day&limit=30", headers=headers).json()
            if 'bars' in bars and bars['bars']:
                df_tech = pd.DataFrame(bars['bars'])
                last_price = df_tech['c'].iloc[-1]
                sma_fast = simple_sma(df_tech['c'], 9).iloc[-1]
                sma_slow = simple_sma(df_tech['c'], 21).iloc[-1]
                rsi = simple_rsi(df_tech['c'], 14).iloc[-1]
                volume_trend = df_tech['v'].rolling(5).mean().iloc[-1]
                import math
                def safe_float(val):
                    try:
                        v = float(val)
                        return 0.0 if math.isnan(v) else v
                    except:
                        return 0.0
                
                technicals = {
                    "sma_fast": safe_float(sma_fast),
                    "sma_slow": safe_float(sma_slow),
                    "rsi": safe_float(rsi),
                    "volume_trend": safe_float(volume_trend)
                }
            else:
                last_price = 0
                technicals = {}
            fundamentals = fetch_fmp_data(symbol)
            analysis = get_gemini_analysis(symbol, name, headlines, last_price, technicals, symbol in [d['symbol'] for d in deep_value_hits], fundamentals)
            temp_reports[symbol] = {
                "symbol": symbol,
                "name": name,
                "price": float(last_price),
                "ai_grade": analysis.get("grade", 50),
                "reasoning": analysis.get("reasoning", ""),
                "entry_price": analysis.get("entry_price", float(last_price)),
                "target_price": analysis.get("target_price", float(last_price) * 1.2),
                "stop_loss": analysis.get("stop_loss", float(last_price) * 0.93),
                "risk_level": analysis.get("risk_level", "Medium"),
                "key_catalysts": analysis.get("key_catalysts", ""),
                "bear_case": analysis.get("bear_case", ""),
                "bull_case": analysis.get("bull_case", ""),
                "updated_at": now.isoformat()
            }
            temp_signals[symbol] = {
                "symbol": symbol,
                "name": name,
                "last_price": float(last_price),
                "fast_sma": technicals.get("sma_fast"),
                "slow_sma": technicals.get("sma_slow"),
                "rsi": technicals.get("rsi"),
                "signal": "BUY (Golden Cross)" if technicals.get("sma_fast", 0) > technicals.get("sma_slow", 0) else "SELL (Death Cross)" if technicals.get("sma_fast", 0) < technicals.get("sma_slow", 0) else "Hold",
                "status": "DEEP VALUE" if symbol in [d['symbol'] for d in deep_value_hits] else "TRENDING",
                "last_updated": now.isoformat()
            }
        except Exception as e:
            safe_print(f"[RESEARCH ERROR] {symbol}: {e}")

    if temp_reports:
        research_reports.clear()
        research_reports.update(temp_reports)
        latest_signals.clear()
        latest_signals.update(temp_signals)
        research_reports["_last_run"] = now.isoformat()
        save_reports()
    else:
        safe_print("[RESEARCH] No new research completed this cycle; retaining existing reports.")

    safe_print("[RESEARCH] Deep research cycle complete.")

# --- Trading Strategy ---

portfolio_performance = {
    "bot_roi": 0.0,
    "spy_roi": 0.0,
    "trades_count": 0,
    "bot_start_value": 0.0,
    "spy_start_price": 0.0
}
load_reports()
load_fmp_cache()
load_app_state()
load_reddit_cache()
load_low_cache()

class DeepResearchBot(Strategy):
    def initialize(self):
        self.sleeptime = "2M"
        self.fast_period = 9
        self.slow_period = 21
        self.symbols = []
        self.benchmark_initialized = False

    def on_filled_order(self, position, order, price, quantity, multiplier):
        symbol = order.asset.symbol
        side = "BUY" if order.side == "buy" else "SELL"
        report = research_reports.get(symbol, {})
        signal_data = latest_signals.get(symbol, {})
        stop_loss = float(report.get("stop_loss", 0.0))
        trade_history.append({
            "timestamp": datetime.now().isoformat(),
            "symbol": symbol,
            "side": side,
            "quantity": float(quantity),
            "price": float(round(price, 2)),
            "ai_grade": int(report.get("ai_grade", 50)),
            "signal": str(signal_data.get("signal", "Hold")),
            "stop_loss": stop_loss
        })
        portfolio_performance["trades_count"] += 1
        save_app_state()

    def on_trading_iteration(self):
        # --- Market Hours Enforcement ---
        if not is_market_open():
            safe_print("[BOT] Market closed. Sleeping until open.")
            sleep_sec = max(60, seconds_until_market_open())
            time.sleep(sleep_sec)
            return

        # --- Benchmark Sync (first run only) ---
        if not self.benchmark_initialized:
            try:
                portfolio_performance["bot_start_value"] = float(self.get_portfolio_value())
                portfolio_performance["spy_start_price"] = float(self.get_last_price("SPY"))
                self.benchmark_initialized = True
                self.log_message(f"[BENCHMARK INIT] Starting value: ${portfolio_performance['bot_start_value']:.2f} | SPY: ${portfolio_performance['spy_start_price']:.2f}")
            except Exception as e:
                self.log_message(f"[BENCHMARK ERROR] {e}")
                return

        # --- Use latest research ---
        if not research_reports:
            self.log_message("[WAITING] Research engine still scanning... will trade once reports arrive.")
            return

        current_value = self.get_portfolio_value()
        # Risk 1.5% of portfolio per trade
        risk_per_trade = 0.015
        traded_this_cycle = 0

        for symbol, report in list(research_reports.items()):
            if symbol.startswith("_"):  # skip meta
                continue
            try:
                ai_grade = report.get("ai_grade", 50)
                last_price = report.get("price", 0)
                stop_loss = report.get("stop_loss", last_price * 0.93)
                if last_price <= 0:
                    continue

                # Get technicals
                signal_data = latest_signals.get(symbol, {})
                fast_sma = signal_data.get("fast_sma", 0)
                slow_sma = signal_data.get("slow_sma", 0)
                golden_cross = fast_sma > slow_sma > 0

                # Position sizing: risk 1.5% of portfolio, stop-loss based
                max_risk = current_value * risk_per_trade
                risk_per_share = max(last_price - stop_loss, 0.01)
                quantity = int(max_risk / risk_per_share)

                # BUY: High grade and golden cross
                existing_pos = self.get_position(symbol)
                if (ai_grade >= 60 and golden_cross) or ai_grade >= 70:
                    if not existing_pos and quantity > 0:
                        current_price = self.get_last_price(symbol)
                        
                        # Stop if price pumped over 2% since AI analysis
                        if current_price > last_price * 1.02:
                            self.log_message(f"⏭️ SKIPPING {symbol}: Price pumped to ${current_price:.2f} (Research: ${last_price:.2f})")
                            # Cancel any open orders for it
                            for o in self.get_orders():
                                if o.asset.symbol == symbol and o.side == "buy":
                                    self.cancel_order(o)
                            continue

                        cash = self.get_cash()
                        cost = quantity * current_price
                        if cost > cash * 0.95:  # ensure cash with 5% buffer
                            quantity = int((cash * 0.95) / current_price)
                        
                        pending_match = False
                        for o in self.get_orders():
                            if o.asset.symbol == symbol and o.side == "buy":
                                pending_match = True
                                break
                                
                        if quantity > 0 and not pending_match:
                            self.log_message(f"🟢 BUY ORDER: {symbol} x{quantity} @ ~${current_price:.2f} (Grade {ai_grade})")
                            order = self.create_order(symbol, quantity, "buy")
                            self.submit_order(order)
                            traded_this_cycle += 1

                # SELL: Grade <= 40, death cross, or stop-loss hit
                elif existing_pos:
                    current_price = self.get_last_price(symbol)
                    if ai_grade <= 40 or (fast_sma > 0 and slow_sma > 0 and fast_sma < slow_sma) or (current_price <= stop_loss):
                        pending_match = False
                        for o in self.get_orders():
                            if o.asset.symbol == symbol and o.side == "sell":
                                pending_match = True
                                break
                                
                        if not pending_match:
                            self.log_message(f"🔴 SELL ORDER: {symbol} — Exit (Grade {ai_grade})")
                            self.sell_all(symbol)
                            traded_this_cycle += 1

            except Exception as e:
                self.log_message(f"[TRADE ERROR] {symbol}: {e}")

        # --- Update ROI vs SPY benchmark ---
        try:
            current_bot_val = self.get_portfolio_value()
            current_spy = self.get_last_price("SPY")
            bot_roi = ((current_bot_val - portfolio_performance["bot_start_value"]) / portfolio_performance["bot_start_value"]) * 100 if portfolio_performance["bot_start_value"] else 0.0
            spy_roi = ((current_spy - portfolio_performance["spy_start_price"]) / portfolio_performance["spy_start_price"]) * 100 if portfolio_performance["spy_start_price"] else 0.0
            portfolio_performance["bot_roi"] = float(bot_roi)
            portfolio_performance["spy_roi"] = float(spy_roi)
            self.log_message(f"📊 ALPHA PULSE | Bot: {bot_roi:+.2f}% | SPY: {spy_roi:+.2f}% | Alpha: {bot_roi - spy_roi:+.2f}% | Trades: {portfolio_performance['trades_count']}")
        except Exception as e:
            self.log_message(f"[ROI ERROR] {e}")

# --- Research Scheduler Thread ---

def research_scheduler():
    while True:
        try:
            if is_market_open():
                run_research_cycle()
            else:
                safe_print("[SCHEDULER] Market closed. Sleeping until open.")
                time.sleep(max(60, seconds_until_market_open()))
        except Exception as scheduler_error:
            safe_print(f"[RESEARCH SCHEDULER ERROR] {scheduler_error}")
        time.sleep(60 * 10)  # Check every 10 minutes

# --- FastAPI Dashboard ---

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
    return latest_signals

@api.get("/research")
def get_research():
    return research_reports

@api.get("/research_status")
def get_research_status():
    symbol_keys = [key for key in research_reports.keys() if not key.startswith("_")]
    return {
        "last_run": research_reports.get("_last_run"),
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
    keys = [key for key in research_reports.keys() if not key.startswith("_")]
    for key in keys:
        research_reports.pop(key, None)
    latest_signals.clear()
    research_reports["_last_run"] = datetime.now().isoformat()
    save_reports()
    return {"status": "research cleared", "cleared_symbols": len(keys), "timestamp": datetime.now().isoformat()}

@api.get("/trade_history")
def get_trade_history():
    return {"history": trade_history[-20:][::-1]}

@api.get("/performance")
def get_performance():
    portfolio_performance["trades_count"] = max(portfolio_performance.get("trades_count", 0), len(trade_history))
    return portfolio_performance

@api.get("/positions")
def get_positions():
    if not strategy_instance:
        return {"error": "Bot not initialized"}
    try:
        positions_data = []
        positions = strategy_instance.get_positions()
        for position in positions:
            symbol = position.symbol
            quantity = position.quantity
            avg_price = position.avg_fill_price or 0
            current_price = strategy_instance.get_last_price(symbol)
            if current_price > 0:
                invested = quantity * avg_price
                current_value = quantity * current_price
                unrealized_pnl = current_value - invested
                unrealized_pnl_pct = (unrealized_pnl / invested) * 100 if invested > 0 else 0
                spy_price = strategy_instance.get_last_price("SPY")
                spy_start = portfolio_performance.get("spy_start_price", spy_price)
                spy_roi = ((spy_price - spy_start) / spy_start) * 100 if spy_start > 0 else 0
                sell_target_pct = spy_roi + 5
                sell_target_price = current_price * (1 + sell_target_pct / 100)
                research = research_reports.get(symbol, {})
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

def start_bot():
    global strategy_instance
    broker = Alpaca(ALPACA_CREDS)
    strategy = DeepResearchBot(
        name="Autonomous_Alpha_v1",
        broker=broker
    )
    strategy_instance = strategy
    trader = Trader()
    trader.add_strategy(strategy)
    trader.run_all()

if __name__ == "__main__":
    # Start research scheduler in background
    threading.Thread(target=research_scheduler, daemon=True).start()
    # Start bot in background
    threading.Thread(target=start_bot, daemon=True).start()
    print("[ONLINE] Autonomous Research Bot - ONLINE")
    print("[PERFORMANCE] Tracking performance vs SPY...")
    uvicorn.run(api, host="0.0.0.0", port=8001)