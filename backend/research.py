from google import genai
from google.genai import types
import json
import random
import requests
import pandas as pd
from datetime import datetime, timedelta
import time
import pytz

from config import GEMINI_API_KEYS, RESEARCH_GEMINI_KEY, ALPACA_API_KEY, ALPACA_SECRET_KEY, SUPABASE_URL, SUPABASE_KEY
from utils import (
    safe_print,
    is_market_open,
    is_research_window,
    is_trading_day,
    seconds_until_market_open,
    simple_sma,
    simple_rsi,
    simple_macd,
    simple_atr,
    simple_bollinger_bands,
)
from data import fetch_reddit_trending, fetch_52_week_lows, fetch_fmp_data, fetch_earnings_surprises, fetch_upcoming_earnings, fetch_rvol_breakouts, fetch_news_sentiment
import state

def sync_picks_to_supabase(reports):
    if not SUPABASE_URL or not SUPABASE_KEY:
        safe_print("[SUPABASE] ⚠️ Credentials missing, skipping direct sync.")
        return
    try:
        from supabase import create_client
        sb = create_client(SUPABASE_URL, SUPABASE_KEY)
        picks = []
        for symbol, r in reports.items():
            if symbol.startswith("_"):
                continue
            updated_at_str = r.get("updated_at") or datetime.now().isoformat()
            try:
                run_date = datetime.fromisoformat(updated_at_str).astimezone(
                    pytz.timezone("America/Halifax")
                ).date().isoformat()
            except ValueError:
                run_date = updated_at_str.split("T")[0]
            picks.append({
                "symbol": symbol,
                "name": r.get("name") or symbol,
                "ai_grade": r.get("ai_grade", 50),
                "price": r.get("price"),
                "target_price": r.get("target_price"),
                "entry_price": r.get("entry_price"),
                "reasoning": r.get("reasoning"),
                "risk_level": r.get("risk_level", "Medium"),
                "type": r.get("type"),
                "updated_at": updated_at_str,
                "run_date": run_date,
            })
        if picks:
            res = sb.table("research_picks").upsert(picks, on_conflict="symbol,run_date").execute()
            safe_print(f"[SUPABASE] ✅ Successfully synced {len(picks)} picks to Supabase table research_picks.")
    except Exception as e:
        safe_print(f"[SUPABASE ERROR] Could not sync picks: {e}")

BLACKLIST = ["MSTR", "SGOV", "TLT", "SHY", "IEI"]

# Combine all keys, putting RESEARCH_GEMINI_KEY first if it exists
ALL_KEYS = []
if RESEARCH_GEMINI_KEY:
    ALL_KEYS.append(RESEARCH_GEMINI_KEY)
for k in GEMINI_API_KEYS:
    if k and k not in ALL_KEYS:
        ALL_KEYS.append(k)

CURRENT_GEMINI_KEY_INDEX = 0
client = None
SELECTED_MODEL = "gemini-2.5-flash"
# Set to True when ALL keys are quota-exhausted this cycle; reset each research cycle
_all_keys_exhausted = False

def configure_gemini():
    global client, CURRENT_GEMINI_KEY_INDEX, SELECTED_MODEL
    
    if not ALL_KEYS:
        safe_print("[GEMINI] ⚠️  NO GEMINI API KEYS FOUND — all analysis will use local fallback! Check .env")
        client = None
        return
        
    key = ALL_KEYS[CURRENT_GEMINI_KEY_INDEX]
    safe_print(f"[GEMINI] ✅ Using rotated key index: {CURRENT_GEMINI_KEY_INDEX} ({key[:8]}...)")
        
    try:
        client = genai.Client(api_key=key)
        # Discover best available flash model
        all_models = client.models.list()
        candidates = [m.name for m in all_models if "generateContent" in (m.supported_actions or [])]
        preferred = [m for m in candidates if "flash" in m.lower()]
        SELECTED_MODEL = preferred[0] if preferred else (candidates[0] if candidates else "gemini-2.5-flash")
        safe_print(f"[GEMINI] ✅ Connected. Model: {SELECTED_MODEL}")
    except Exception as e:
        safe_print(f"[GEMINI CONFIG ERROR] {type(e).__name__}: {e}")
        client = None

def switch_gemini_key():
    global CURRENT_GEMINI_KEY_INDEX, client, _all_keys_exhausted
    if CURRENT_GEMINI_KEY_INDEX < len(ALL_KEYS) - 1:
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

def get_gemini_analysis(symbol, name, news_headlines, news_sentiment, current_price, technicals, is_value_scan=False, fundamentals=None, _retry=0):
    global client, _all_keys_exhausted
    if not client or _all_keys_exhausted:
        reason = "no client configured" if not client else "all keys quota-exhausted"
        safe_print(f"[GEMINI] ⚠️  Skipping AI for {symbol} — {reason}. Using local fallback.")
        return local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals)
    prompt = f"""
You are an elite quantitative analyst specializing in explosive short-term breakouts (1-2 day timeframes).
Your goal: Identify if {symbol} ({name}) will skyrocket within 48 hours based on technical momentum, volume surge, and news FOMO.

1. **Breakout Indicators**:
   - Technicals include MACD, ATR, Bollinger Bands, and SMA.
   - Is there a 'Golden Cross' (SMA9 crossing above SMA21)?
   - Is MACD bullish? Are we breaking Bollinger Bands?
   - Is there a volume spike or "unusual volume" (RVOL)?
2. **FOMO & News**:
   - Analyze headlines. Is sentiment highly positive?
   - News Sentiment Score: {news_sentiment} (Contains Bullish/Bearish % if available).
3. **Risk/Reward & Support/Resistance**:
   - Determine precise Support and Resistance levels from the price history and technicals.
   - Set Stop Loss using ATR (Average True Range) for dynamic volatility-based risk.

**Step-by-step reasoning**: Be aggressive and thorough.
**MANDATORY**: You MUST state the P/E ratio, PEG, Debt-to-Equity, and Sector from the Fundamentals data in your reasoning. Explain how they impact the trade.

**Output ONLY valid JSON** with these fields:
{{
  "grade": 0-100,
  "reasoning": "...(100+ words, chain-of-thought)...",
  "entry_price": float,
  "target_price": float,
  "stop_loss": float,
  "support_level": float,
  "resistance_level": float,
  "risk_level": "Low/Medium/High",
  "key_catalysts": "...",
  "bear_case": "...",
  "bull_case": "..."
}}

**Data**:
- Symbol: {symbol}
- Name: {name}
- Price: {current_price} (CRITICAL: All entry/target/stop prices MUST be relative to this actual market price).
- Technicals: {technicals}
- Fundamentals: {fundamentals}
- News: {news_headlines}
- ValueScan: {is_value_scan}

Return ONLY valid JSON, no prose, no markdown.
"""
    MAX_RETRIES = 2
    try:
        response = client.models.generate_content(model=SELECTED_MODEL, contents=prompt)
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
            return get_gemini_analysis(symbol, name, news_headlines, news_sentiment, current_price, technicals, is_value_scan, fundamentals, _retry + 1)
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
                return get_gemini_analysis(symbol, name, news_headlines, news_sentiment, current_price, technicals, is_value_scan, fundamentals, 0)
        elif is_transient and _retry < MAX_RETRIES:
            wait = 5 * (2 ** _retry)
            safe_print(f"[GEMINI] Transient error for {symbol}. Waiting {wait}s then retrying (attempt {_retry + 1}/{MAX_RETRIES})...")
            time.sleep(wait)
            return get_gemini_analysis(symbol, name, news_headlines, news_sentiment, current_price, technicals, is_value_scan, fundamentals, _retry + 1)
        return local_fallback_analysis(symbol, name, news_headlines, current_price, technicals, fundamentals)

def run_research_cycle(force=False, manual_reason=None):
    global _all_keys_exhausted
    _all_keys_exhausted = False
    # A holiday is not a quiet weekend: nothing trades, so nothing is worth
    # spending a research cycle on, even when a manual trigger forces it.
    if not is_trading_day():
        safe_print("[RESEARCH] Market holiday. Skipping research.")
        return
    if not force and not is_research_window():
        safe_print("[RESEARCH] Outside research window (8:30am-4pm ET). Skipping.")
        return
    now = datetime.now()
    last_run = state.research_reports.get("_last_run")
    if last_run:
        last_run = datetime.fromisoformat(last_run)
        if not force and (now - last_run).total_seconds() < 3 * 3600:
            safe_print("[RESEARCH] Last research <3h ago. Skipping.")
            return
    safe_print(f"[RESEARCH] Starting deep research cycle. Reason: {manual_reason or 'scheduled'}")
    report_timestamp = datetime.now(tz=pytz.utc).astimezone(
        pytz.timezone("America/Halifax")
    ).isoformat()
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

    def safe_response_json(response, default):
        if not response.ok or not response.content:
            return default
        try:
            payload = response.json()
            return payload if isinstance(payload, dict) else default
        except ValueError:
            return default

    def chunks(items, size=100):
        for start in range(0, len(items), size):
            yield items[start:start + size]

    # ------------------------------------------------------------------
    # Liquidity gate. Trending lists are full of shells and micro-caps that
    # Alpaca has no usable history for. Grading one of those spends a Gemini
    # call to invent numbers nobody can trade, so a symbol now needs a real
    # price and real turnover, measured from its own bars, before it is
    # allowed anywhere near the analyst.
    # ------------------------------------------------------------------
    MIN_PRICE = 5.0                 # no sub-$5 names
    MIN_AVG_DOLLAR_VOLUME = 5e6     # $5M traded per session, 20-day average
    MIN_HISTORY_BARS = 21           # enough bars for SMA21 / RSI14 / MACD
    TARGET_COUNT = 8

    pool = [s for s in target_meta if s not in BLACKLIST]
    # Alpaca silently returns a single bar when `start` is omitted, which is
    # what turned every technical reading into 0.0. Ask for the window.
    bars_start = (datetime.now() - timedelta(days=120)).date().isoformat()
    all_bars = {}
    all_snapshots = {}
    base_bars_url = "https://data.alpaca.markets/v2/stocks/bars"

    def fetch_daily_bars(chunk):
        """Daily bars for a chunk of symbols, following Alpaca page tokens.

        `limit` is the page size across the whole chunk, not per symbol, so a
        single request silently truncates the tail of the list — which is how
        whole symbols ended up with no history at all.
        """
        collected = {}
        page_token = None
        for _ in range(15):
            params = {
                "symbols": ",".join(chunk),
                "timeframe": "1Day",
                "start": bars_start,
                "limit": 1000,
            }
            if page_token:
                params["page_token"] = page_token
            b_res = None
            for attempt in range(3):  # Alpaca 429 retry
                b_res = requests.get(base_bars_url, params=params, headers=headers, timeout=20)
                if b_res.status_code == 200:
                    break
                if b_res.status_code == 429:
                    time.sleep(2.0 * (attempt + 1))
                    continue
                safe_print(f"[RESEARCH] bar batch failed: HTTP {b_res.status_code}")
                return collected
            if b_res is None or b_res.status_code != 200:
                return collected
            payload = safe_response_json(b_res, {})
            for symbol, rows in (payload.get("bars") or {}).items():
                collected.setdefault(symbol, []).extend(rows)
            page_token = payload.get("next_page_token")
            if not page_token:
                break
        return collected

    for chunk in chunks(pool):
        all_bars.update(fetch_daily_bars(chunk))
        s_res = requests.get(
            f"https://data.alpaca.markets/v2/stocks/snapshots?symbols={','.join(chunk)}",
            headers=headers,
            timeout=15,
        )
        if s_res.status_code == 200:
            all_snapshots.update(safe_response_json(s_res, {}))

    def liquidity_of(symbol):
        """(last close, average daily dollar volume) or None when unusable."""
        bars = all_bars.get(symbol) or []
        if len(bars) < MIN_HISTORY_BARS:
            return None
        window = bars[-20:]
        try:
            closes = [float(b["c"]) for b in window if b.get("c")]
            volumes = [float(b.get("v") or 0) for b in window]
        except (KeyError, TypeError, ValueError):
            return None
        if not closes:
            return None
        avg_dollar = sum(c * v for c, v in zip(closes, volumes)) / len(closes)
        return closes[-1], avg_dollar

    qualified = []
    rejected = []
    for symbol in pool:
        stats = liquidity_of(symbol)
        if stats is None:
            rejected.append(f"{symbol}: no history")
            continue
        price, avg_dollar = stats
        if price < MIN_PRICE:
            rejected.append(f"{symbol}: ${price:.2f}")
            continue
        if avg_dollar < MIN_AVG_DOLLAR_VOLUME:
            rejected.append(f"{symbol}: ${avg_dollar / 1e6:.1f}M/day")
            continue
        qualified.append(symbol)

    safe_print(
        f"[RESEARCH] Liquidity gate: pool={len(pool)} kept={len(qualified)} "
        f"dropped={len(rejected)}"
    )
    if rejected:
        safe_print(f"[RESEARCH] Dropped: {', '.join(rejected)}")

    # Prefer names flagged by two or more scanners, then fill from the rest.
    multi_signal = [s for s in qualified if " + " in target_meta[s].get("source", "")]
    single_signal = [s for s in qualified if s not in multi_signal]
    random.shuffle(multi_signal)
    random.shuffle(single_signal)
    # Deduplicate ticker aliases: GOOG and GOOGL are the same company (Class A vs Class C)
    # Prefer GOOGL (voting shares); remove GOOG if both appear
    TICKER_ALIASES = {"GOOG": "GOOGL"}
    seen_canonical = set()
    deduped_targets = []
    for s in (multi_signal + single_signal):
        canonical = TICKER_ALIASES.get(s, s)
        if canonical in seen_canonical:
            safe_print(f"[RESEARCH] Deduped {s} -> same company as {canonical}, skipping")
            continue
        seen_canonical.add(canonical)
        deduped_targets.append(s)
        if len(deduped_targets) >= TARGET_COUNT:
            break

    all_targets = deduped_targets
    if not all_targets:
        safe_print("[RESEARCH] Nothing passed the liquidity gate; keeping existing reports.")
        return
    safe_print(f"[RESEARCH] Targets ({len(all_targets)}): {all_targets}")

    for symbol in all_targets:
        try:
            name = symbol
            try:
                asset_url = f"https://api.alpaca.markets/v2/assets/{symbol}"
                asset_response = requests.get(asset_url, headers=headers, timeout=10)
                asset_res = safe_response_json(asset_response, {})
                name = asset_res.get('name', symbol)
                time.sleep(0.5) # Pace for Alpaca rate limit
            except (requests.RequestException, ValueError):
                pass
            news_url = f"https://data.alpaca.markets/v1beta1/news?symbols={symbol}&limit=8"
            try:
                news_response = requests.get(news_url, headers=headers, timeout=10)
                news_res = safe_response_json(news_response, {})
                headlines = [
                    item.get('headline')
                    for item in news_res.get('news', [])
                    if isinstance(item, dict) and item.get('headline')
                ]
            except requests.RequestException as exc:
                safe_print(f"[RESEARCH] {symbol}: news unavailable ({exc}); continuing without headlines.")
                headlines = []
            
            bars = all_bars.get(symbol, [])
            snap = all_snapshots.get(symbol, {})
            last_price = 0
            technicals = {}

            # 1. Get latest price from Snapshot
            if snap:
                # Use latest trade or daily bar close
                last_price = snap.get('latestTrade', {}).get('p') or snap.get('dailyBar', {}).get('c') or 0

            if bars:
                df_tech = pd.DataFrame(bars)
                if last_price == 0:
                    last_price = df_tech['c'].iloc[-1]
                sma_fast = simple_sma(df_tech['c'], 9).iloc[-1]
                sma_slow = simple_sma(df_tech['c'], 21).iloc[-1]
                rsi = simple_rsi(df_tech['c'], 14).iloc[-1]
                macd, macd_signal, macd_hist = simple_macd(df_tech['c'])
                atr = simple_atr(df_tech['h'], df_tech['l'], df_tech['c'])
                upper, mid, lower = simple_bollinger_bands(df_tech['c'])
                volume_trend = df_tech['v'].rolling(5).mean().iloc[-1]
                technicals = {
                    "sma_fast": safe_float(sma_fast),
                    "sma_slow": safe_float(sma_slow),
                    "rsi": safe_float(rsi),
                    "macd": safe_float(macd.iloc[-1]),
                    "macd_hist": safe_float(macd_hist.iloc[-1]),
                    "atr": safe_float(atr.iloc[-1]),
                    "bb_upper": safe_float(upper.iloc[-1]),
                    "bb_lower": safe_float(lower.iloc[-1]),
                    "volume_trend": safe_float(volume_trend)
                }

            # Zeroed indicators mean the bars did not cover the lookback. A model
            # asked to grade on nothing answers with confident nonsense (grade 90
            # on an all-zero technical block is how that happened), so the symbol
            # is dropped here instead, which also saves the Gemini call.
            required_indicators = ("sma_fast", "sma_slow", "rsi", "macd", "atr", "bb_upper", "bb_lower")
            missing = [k for k in required_indicators if not technicals.get(k)]
            if last_price <= 0 or missing:
                safe_print(
                    f"[RESEARCH] WARNING {symbol}: skipped, incomplete indicators "
                    f"({', '.join(missing) or 'no bars'}, price={last_price}). No Gemini call."
                )
                continue

            fundamentals = fetch_fmp_data(symbol)
            news_sentiment = fetch_news_sentiment(symbol)
            
            meta = target_meta.get(symbol, {})
            safe_print(f"[RESEARCH] {symbol}: price={last_price}, technicals={'ok' if technicals else 'EMPTY'}, fundamentals={'ok' if fundamentals else 'None'}, source={meta.get('source','?')}")
            analysis = get_gemini_analysis(
                symbol, name, headlines, news_sentiment, last_price, technicals,
                meta.get("is_value_scan", False), fundamentals
            )
            if not _all_keys_exhausted:
                time.sleep(GEMINI_CALL_DELAY)
            # Determine pick type label for frontend display
            src = target_meta.get(symbol, {}).get("source", "")
            is_val = target_meta.get(symbol, {}).get("is_value_scan", False)
            if is_val or "52wk_low" in src:
                pick_type = "DEEP VALUE"
            elif "rvol" in src or "breakout" in src.lower():
                pick_type = "BREAKOUT"
            elif "eps_beat" in src or "earnings" in src.lower():
                pick_type = "EARNINGS PLAY"
            else:
                pick_type = "MOMENTUM"
            temp_reports[symbol] = {
                "symbol": symbol,
                "name": name,
                "price": float(last_price),
                "ai_grade": analysis.get("grade", 50),
                "reasoning": analysis.get("reasoning", ""),
                "entry_price": analysis.get("entry_price", float(last_price)),
                "target_price": analysis.get("target_price", float(last_price) * 1.2),
                "stop_loss": analysis.get("stop_loss", float(last_price) * 0.93),
                "support_level": analysis.get("support_level", float(last_price) * 0.95),
                "resistance_level": analysis.get("resistance_level", float(last_price) * 1.05),
                "risk_level": analysis.get("risk_level", "Medium"),
                "key_catalysts": analysis.get("key_catalysts", ""),
                "bear_case": analysis.get("bear_case", ""),
                "bull_case": analysis.get("bull_case", ""),
                "price_history": bars if isinstance(bars, list) else [],
                "updated_at": report_timestamp,
                "type": pick_type,
                "fundamentals": fundamentals
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
                "last_updated": report_timestamp
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
        sync_picks_to_supabase(state.research_reports)
    else:
        safe_print("[RESEARCH] No new research completed this cycle; retaining existing reports.")

    safe_print("[RESEARCH] Deep research cycle complete.")

def research_scheduler():
    last_slot = None
    safe_print(f"[SCHEDULER] Research scheduler starting. Current ET: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}")
    while True:
        try:
            eastern = pytz.timezone("US/Eastern")
            now = datetime.now(tz=pytz.utc).astimezone(eastern)
            slot = None
            if is_trading_day(now.date()):
                minutes = now.hour * 60 + now.minute
                if 8 * 60 + 30 <= minutes < 8 * 60 + 45:
                    slot = "pre_market"
                elif 16 * 60 <= minutes < 16 * 60 + 15:
                    slot = "market_close"

            slot_key = f"{now.date()}:{slot}" if slot else None
            if slot_key and slot_key != last_slot:
                safe_print(f"[SCHEDULER] Running {slot} research at {now.strftime('%Y-%m-%d %I:%M:%S %p %Z')}")
                run_research_cycle(force=True, manual_reason=slot)
                try:
                    from longterm import generate_longterm_picks
                    generate_longterm_picks()
                except Exception as longterm_error:
                    safe_print(f"[SCHEDULER] Long-term refresh failed: {longterm_error}")
                last_slot = slot_key
            elif not slot:
                safe_print(f"[SCHEDULER] Waiting for 8:30 AM or 4:00 PM ET. Current: {now.strftime('%I:%M %p %Z')}")
        except Exception as e:
            safe_print(f"[SCHEDULER ERROR] {e}")
        time.sleep(60)
