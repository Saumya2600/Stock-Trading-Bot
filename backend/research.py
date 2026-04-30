import google.generativeai as genai
import json
import random
import requests
import pandas as pd
from datetime import datetime
import time

from config import GEMINI_API_KEYS, ALPACA_API_KEY, ALPACA_SECRET_KEY
from utils import safe_print, is_market_open, seconds_until_market_open, simple_sma, simple_rsi
from data import fetch_reddit_trending, fetch_52_week_lows, fetch_fmp_data, fetch_earnings_surprises, fetch_upcoming_earnings, fetch_rvol_breakouts
import state

BLACKLIST = ["MSTR", "SGOV", "TLT", "SHY", "IEI"]

CURRENT_GEMINI_KEY_INDEX = 0
model = None
# Set to True when ALL keys are quota-exhausted this cycle; reset each research cycle
_all_keys_exhausted = False

def configure_gemini():
    global model, CURRENT_GEMINI_KEY_INDEX
    if not GEMINI_API_KEYS:
        safe_print("[GEMINI] ⚠️  NO GEMINI API KEYS FOUND — all analysis will use local fallback! Check GOOGLE_API_KEY in .env")
        model = None
        return
    try:
        genai.configure(api_key=GEMINI_API_KEYS[CURRENT_GEMINI_KEY_INDEX])
        model = genai.GenerativeModel('gemini-1.5-flash')
        safe_print(f"[GEMINI] ✅ Using model: gemini-1.5-flash (key: {GEMINI_API_KEYS[CURRENT_GEMINI_KEY_INDEX][:8]}...)")
    except Exception as e:
        safe_print(f"[GEMINI CONFIG ERROR] {type(e).__name__}: {e}")
        model = None

def switch_gemini_key():
    global CURRENT_GEMINI_KEY_INDEX, model, _all_keys_exhausted
    if CURRENT_GEMINI_KEY_INDEX < len(GEMINI_API_KEYS) - 1:
        CURRENT_GEMINI_KEY_INDEX += 1
        safe_print(f"[GEMINI] Switching to key index {CURRENT_GEMINI_KEY_INDEX}...")
        configure_gemini()
        return True
    safe_print("[GEMINI] ❌ ALL API KEYS QUOTA-EXHAUSTED — falling back to local analysis for this cycle.")
    _all_keys_exhausted = True
    return False

configure_gemini()

def local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals):
    score = 50
    reasons = []
    try:
        # --- Fundamentals ---
        if fundamentals:
            pe = fundamentals.get('pe') or 0
            debt = fundamentals.get('debt_to_equity') or 0
            if pe and pe > 0 and pe < 15:
                score += 10
                reasons.append('Attractive P/E')
            elif pe and pe > 30:
                score -= 5
                reasons.append('High P/E')
            if debt and debt < 1:
                score += 5
                reasons.append('Low debt')
            elif debt and debt > 2:
                score -= 5
                reasons.append('High leverage')

        # --- Technicals (fix: use is not None, not truthiness — 0.0 is valid!) ---
        fast = technicals.get('sma_fast')
        slow = technicals.get('sma_slow')
        rsi  = technicals.get('rsi')
        vol  = technicals.get('volume_trend')

        if fast is not None and slow is not None and fast > 0 and slow > 0:
            if fast > slow:
                score += 8
                reasons.append(f'Bullish SMA ({fast:.2f}>{slow:.2f})')
            else:
                score -= 8
                reasons.append(f'Bearish SMA ({fast:.2f}<{slow:.2f})')

        if rsi is not None and rsi > 0:
            if rsi > 70:
                score -= 6
                reasons.append(f'Overbought RSI={rsi:.1f}')
            elif rsi < 30:
                score += 8
                reasons.append(f'Oversold RSI={rsi:.1f}')
            elif 40 <= rsi <= 60:
                score += 3
                reasons.append(f'Neutral RSI={rsi:.1f}')

        # --- News sentiment ---
        nh = ' '.join(news_headlines).lower()
        if 'upgrade' in nh:   score += 6;  reasons.append('Analyst upgrade')
        if 'downgrade' in nh: score -= 6;  reasons.append('Analyst downgrade')
        if 'beat' in nh or 'record' in nh: score += 4; reasons.append('Positive news')
        if 'miss' in nh or 'warning' in nh or 'layoff' in nh: score -= 4; reasons.append('Negative news')

        score = max(20, min(90, int(score)))
    except Exception as ex:
        reasons.append(f"Fallback error: {ex}")

    reason_str = ', '.join(reasons) if reasons else "No signals (Gemini down, data limited)"
    if not reasons:
        safe_print(
            f"[FALLBACK] ⚠️  {symbol}: Score=50, NO signals computed. "
            f"news={len(news_headlines)}."
        )
    else:
        safe_print(f"[FALLBACK] {symbol}: Score={score} — {reason_str}")
    return {
        "grade": score,
        "reasoning": "Local fallback: " + reason_str,
        "entry_price": float(current_price),
        "target_price": float(current_price) * (1 + (score - 50) / 200),
        "stop_loss": float(current_price) * 0.93,
        "risk_level": "Low" if score >= 65 else "Medium" if score >= 50 else "High",
        "key_catalysts": "N/A",
        "bear_case": "N/A",
        "bull_case": "N/A"
    }

def get_gemini_analysis(symbol, name, news_headlines, current_price, technicals, is_value_scan=False, fundamentals=None, _retry=0):
    global model, _all_keys_exhausted
    if not model or _all_keys_exhausted:
        reason = "no model configured" if not model else "all keys quota-exhausted"
        safe_print(f"[GEMINI] ⚠️  Skipping AI for {symbol} — {reason}. Using local fallback.")
        return local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals)
    prompt = f"""
You are a senior institutional equity analyst at a top-tier hedge fund. Your job is to produce a deep, multi-step, chain-of-thought research report for {symbol} ({name}).

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
    MAX_RETRIES = 2
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
        data = json.loads(text)
        if current_price > 0:
            ratio = data.get('entry_price', current_price) / current_price
            if ratio > 3.0 or ratio < 0.3:
                safe_print(f"[GEMINI] ⚠️  {symbol}: AI returned hallucinated entry_price {data.get('entry_price')} vs current {current_price} — clamping to current price.")
                data['entry_price'] = float(current_price)
        safe_print(f"[GEMINI] ✅ {symbol}: AI grade={data.get('grade')} risk={data.get('risk_level')}")
        return data
    except json.JSONDecodeError as e:
        safe_print(f"[GEMINI ERROR] {symbol}: JSON parse failed — {e}. Raw response snippet: {text[:200] if 'text' in dir() else 'N/A'}")
        if _retry < MAX_RETRIES:
            safe_print(f"[GEMINI] Retrying {symbol} (attempt {_retry + 1}/{MAX_RETRIES})...")
            time.sleep(2 ** _retry)  # exponential backoff: 1s, 2s
            return get_gemini_analysis(symbol, name, news_headlines, current_price, technicals, is_value_scan, fundamentals, _retry + 1)
        return local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals)
    except Exception as e:
        err_str = str(e)
        err_type = type(e).__name__
        is_quota = "429" in err_str or "quota" in err_str.lower() or "ResourceExhausted" in err_type
        is_transient = "500" in err_str or "503" in err_str or "timeout" in err_str.lower() or "ServiceUnavailable" in err_type
        safe_print(f"[GEMINI ERROR] {symbol}: {err_type}: {err_str[:300]}")
        if is_quota:
            safe_print(f"[GEMINI] ⚠️  Quota/rate-limit hit for {symbol}. Switching key...")
            time.sleep(2)  # brief pause before key switch
            if switch_gemini_key():
                time.sleep(3)  # pause after switch before retry
                return get_gemini_analysis(symbol, name, news_headlines, current_price, technicals, is_value_scan, fundamentals, 0)
        elif is_transient and _retry < MAX_RETRIES:
            wait = 5 * (2 ** _retry)
            safe_print(f"[GEMINI] Transient error for {symbol}. Waiting {wait}s then retrying (attempt {_retry + 1}/{MAX_RETRIES})...")
            time.sleep(wait)
            return get_gemini_analysis(symbol, name, news_headlines, current_price, technicals, is_value_scan, fundamentals, _retry + 1)
        return local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals)

def run_research_cycle(force=False, manual_reason=None):
    global _all_keys_exhausted
    _all_keys_exhausted = False
    if not force and not is_market_open():
        safe_print("[RESEARCH] Market closed. Skipping research (use force=True to override).")
        return
    now = datetime.now()
    last_run = state.research_reports.get("_last_run")
    if last_run:
        last_run = datetime.fromisoformat(last_run)
        if not force and (now - last_run).total_seconds() < 3 * 3600:
            safe_print("[RESEARCH] Last research <3h ago. Skipping.")
            return
    safe_print(f"[RESEARCH] Starting deep research cycle. Reason: {manual_reason or 'scheduled'}")
    trending = fetch_reddit_trending()           # Reddit/ApeWisdom momentum
    deep_value_hits = fetch_52_week_lows()       # Deep value contrarian
    earnings_beats = fetch_earnings_surprises()  # Post-earnings drift
    upcoming_earns = fetch_upcoming_earnings()   # Pre-catalyst plays
    rvol_breaks = fetch_rvol_breakouts()         # Unusual volume + 52wk high breakout

    # Build unified target list — symbol → metadata (source wins if seen multiple times)
    target_meta = {}  # symbol -> {name, source, is_value_scan}
    for item in deep_value_hits:
        s = item['symbol']
        target_meta[s] = {"name": item.get('name', s), "source": "52wk_low", "is_value_scan": True}
    for sym in trending:
        if sym not in target_meta:
            target_meta[sym] = {"name": sym, "source": "reddit_trending", "is_value_scan": False}
    for item in earnings_beats:
        s = item['symbol']
        if s not in target_meta:
            target_meta[s] = {"name": item.get('name', s), "source": item.get('source', 'eps_beat'), "is_value_scan": False}
        else:
            target_meta[s]["source"] += " + " + item.get('source', 'eps_beat')  # multi-signal bonus
    for item in upcoming_earns:
        s = item['symbol']
        if s not in target_meta:
            target_meta[s] = {"name": item.get('name', s), "source": item.get('source', 'upcoming_earnings'), "is_value_scan": False}
    for item in rvol_breaks:
        s = item['symbol']
        if s not in target_meta:
            target_meta[s] = {"name": item.get('name', s), "source": item.get('source', 'rvol_breakout'), "is_value_scan": False}
        else:
            target_meta[s]["source"] += " + " + item.get('source', 'rvol_breakout')

    # Prioritize multi-signal stocks (appear in 2+ sources)
    multi_signal = [s for s, m in target_meta.items() if " + " in m.get("source", "")]
    single_signal = [s for s in target_meta if s not in multi_signal]
    random.shuffle(multi_signal)
    random.shuffle(single_signal)
    # Always include all multi-signal, fill rest from single up to 8 total
    all_targets = [s for s in (multi_signal + single_signal) if s not in BLACKLIST][:8]
    safe_print(f"[RESEARCH] Targets ({len(all_targets)}): blacklisted={len(BLACKLIST)}, pool={len(target_meta)} unique")
    headers = {"Apca-Api-Key-Id": ALPACA_API_KEY, "Apca-Api-Secret-Key": ALPACA_SECRET_KEY}
    temp_reports = {}
    temp_signals = {}
    GEMINI_CALL_DELAY = 3  # seconds between Gemini calls to avoid RPM quota exhaustion
    import math
    def safe_float(val):
        try:
            v = float(val)
            return 0.0 if math.isnan(v) else v
        except:
            return 0.0

    sym_str = ",".join(all_targets)
    all_bars = {}
    for _ in range(3): # 3 retries for Alpaca rate limit
        res = requests.get(f"https://data.alpaca.markets/v2/stocks/bars?symbols={sym_str}&timeframe=1Day&limit=30", headers=headers)
        if res.status_code == 200:
            all_bars = res.json().get('bars', {})
            break
        elif res.status_code == 429:
            time.sleep(2.0)
        else:
            break

    for symbol in all_targets:
        try:
            name = symbol
            try:
                asset_url = f"https://api.alpaca.markets/v2/assets/{symbol}"
                asset_res = requests.get(asset_url, headers=headers).json()
                name = asset_res.get('name', symbol)
                time.sleep(0.5) # Pace for Alpaca rate limit
            except: pass
            news_url = f"https://data.alpaca.markets/v1beta1/news?symbols={symbol}&limit=8"
            news_res = requests.get(news_url, headers=headers).json()
            headlines = [n['headline'] for n in news_res.get('news', [])]
            
            bars = all_bars.get(symbol, [])
            if bars:
                df_tech = pd.DataFrame(bars)
                last_price = df_tech['c'].iloc[-1]
                sma_fast = simple_sma(df_tech['c'], 9).iloc[-1]
                sma_slow = simple_sma(df_tech['c'], 21).iloc[-1]
                rsi = simple_rsi(df_tech['c'], 14).iloc[-1]
                volume_trend = df_tech['v'].rolling(5).mean().iloc[-1]
                technicals = {
                    "sma_fast": safe_float(sma_fast),
                    "sma_slow": safe_float(sma_slow),
                    "rsi": safe_float(rsi),
                    "volume_trend": safe_float(volume_trend)
                }
            else:
                safe_print(f"[RESEARCH] ⚠️  {symbol}: bars fetch empty/failed. Response: {str(bars)[:200]}")
                last_price = 0
                technicals = {}
            fundamentals = fetch_fmp_data(symbol)
            meta = target_meta.get(symbol, {})
            safe_print(f"[RESEARCH] {symbol}: price={last_price}, technicals={'ok' if technicals else 'EMPTY'}, fundamentals={'ok' if fundamentals else 'None'}, source={meta.get('source','?')}")
            analysis = get_gemini_analysis(
                symbol, name, headlines, last_price, technicals,
                meta.get("is_value_scan", False), fundamentals
            )
            if not _all_keys_exhausted:
                time.sleep(GEMINI_CALL_DELAY)
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
                "price_history": bars if isinstance(bars, list) else [],
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
                "status": target_meta.get(symbol, {}).get("source", "TRENDING").upper().replace(" ", "_"),
                "last_updated": now.isoformat()
            }
        except Exception as e:
            safe_print(f"[RESEARCH ERROR] {symbol}: {type(e).__name__}: {e}")

    if temp_reports:
        state.research_reports.clear()
        state.research_reports.update(temp_reports)
        state.latest_signals.clear()
        state.latest_signals.update(temp_signals)
        state.research_reports["_last_run"] = now.isoformat()
        state.save_reports()
    else:
        safe_print("[RESEARCH] No new research completed this cycle; retaining existing reports.")

    safe_print("[RESEARCH] Deep research cycle complete.")

def research_scheduler():
    safe_print("[SCHEDULER] Manual mode active. Waiting for button trigger.")
    while True:
        # User requested manual button trigger only.
        # We still keep the thread alive for background tasks if needed,
        # but skip the auto-run research.
        time.sleep(3600)
