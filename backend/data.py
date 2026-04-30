import requests
import random
import time
import yfinance as yf
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type
from datetime import date, timedelta, datetime
from utils import safe_print
from config import ALPACA_API_KEY, ALPACA_SECRET_KEY, FMP_API_KEY, FINNHUB_KEY
from state import reddit_cache, low_cache, fmp_cache, save_reddit_cache, save_low_cache, save_fmp_cache

def fetch_reddit_trending():
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
    random.shuffle(trending)
    return trending[:random.randint(5, 10)]

def fetch_52_week_lows():
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
        
        # Batch requests max 100
        for i in range(0, len(universe), 100):
            chunk = universe[i:i+100]
            try:
                sym_str = ",".join(chunk)
                url = f"https://data.alpaca.markets/v2/stocks/bars?symbols={sym_str}&timeframe=1Day&limit=252"
                res = requests.get(url, headers=headers).json()
                bars_dict = res.get('bars', {})
                
                for symbol, bars in bars_dict.items():
                    if not bars: continue
                    min_low = min([b['l'] for b in bars])
                    current_price = bars[-1]['c']
                    if current_price <= (min_low * 1.03):
                        lows.append({"symbol": symbol, "name": symbol})
                time.sleep(1.0) # Rate limit protection
            except Exception as e:
                safe_print(f"52-wk Low Scanner Error: {e}")

        low_cache["date"] = today
        low_cache["lows"] = lows
        save_low_cache()
    random.shuffle(lows)
    return lows[:random.randint(3, 8)]

@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3), retry=retry_if_exception_type(Exception))
def fetch_fundamentals_yf(symbol):
    tick = yf.Ticker(symbol)
    info = tick.info
    return {
        "sector": info.get("sector", "Unknown"),
        "industry": info.get("industry", "Unknown"),
        "pe": round(info.get("trailingPE", 0), 2),
        "peg": round(info.get("pegRatio", 0), 2),
        "debt_to_equity": round(info.get("debtToEquity", 0) / 100, 2) if info.get("debtToEquity") else 0, # yf gives %, fmp gives ratio
        "description": info.get("longBusinessSummary", "")[:200] + "..."
    }

def fetch_fmp_data(symbol):
    now = datetime.now()
    cached = fmp_cache.get(symbol)
    if cached:
        last_updated = datetime.fromisoformat(cached['updated_at'])
        if now - last_updated < timedelta(hours=48):
            return cached['data']
            
    # Primary: yfinance (free, generous)
    try:
        data = fetch_fundamentals_yf(symbol)
        fmp_cache[symbol] = {"data": data, "updated_at": now.isoformat()}
        save_fmp_cache()
        return data
    except Exception as e:
        safe_print(f"yfinance failed for {symbol}: {e}. Trying FMP.")

    # Fallback: FMP (limited)
    if not FMP_API_KEY: return None
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
    except Exception as e:
        print(f"FMP Fetch Error ({symbol}): {e}")
    return None


# ---------------------------------------------------------------------------
# SCANNER 1: Earnings Surprise — stocks that beat EPS in last 7 days
# Source: Finnhub /stock/earnings (free tier, 60 req/min)
# Why: Post-earnings drift — beat EPS → price keeps rising for days
# ---------------------------------------------------------------------------
_earnings_surprise_cache = {}

def fetch_earnings_surprises():
    """Return stocks that beat EPS estimate in the last 7 days. Cached daily."""
    if not FINNHUB_KEY:
        safe_print("[SCANNER] Finnhub key missing — skipping earnings surprise scan.")
        return []
    today = str(date.today())
    if _earnings_surprise_cache.get("date") == today:
        return _earnings_surprise_cache.get("results", [])

    # Screen a universe for recent earnings beats
    universe = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "AMD", "NFLX", "CRM",
        "ADBE", "PYPL", "INTC", "CSCO", "QCOM", "TXN", "MU", "AVGO", "NOW", "SNOW",
        "JPM", "BAC", "GS", "MS", "V", "MA", "PYPL", "SQ", "COIN", "HOOD",
        "XOM", "CVX", "OXY", "SLB", "COP", "UNH", "LLY", "PFE", "MRNA", "ABBV",
        "PLTR", "UBER", "LYFT", "ABNB", "DASH", "PINS", "SNAP", "RBLX", "U", "NET",
        "DDOG", "ZS", "CRWD", "OKTA", "MDB", "GTLB", "PATH", "AI", "SMCI", "ARM",
    ]
    results = []
    cutoff = date.today() - timedelta(days=7)
    headers = {"X-Finnhub-Token": FINNHUB_KEY}

    for symbol in universe:
        try:
            url = f"https://finnhub.io/api/v1/stock/earnings?symbol={symbol}&limit=2"
            res = requests.get(url, headers=headers, timeout=8).json()
            if not isinstance(res, list) or not res:
                continue
            latest = res[0]
            period_str = latest.get("period", "")
            actual = latest.get("actual")
            estimate = latest.get("estimate")
            if not period_str or actual is None or estimate is None:
                continue
            try:
                period_date = datetime.strptime(period_str, "%Y-%m-%d").date()
            except Exception:
                continue
            if period_date < cutoff:
                continue  # too old
            if estimate == 0:
                continue
            surprise_pct = ((actual - estimate) / abs(estimate)) * 100
            if surprise_pct >= 5:  # beat by 5%+
                safe_print(f"[SCANNER-EARNINGS] {symbol}: beat EPS by {surprise_pct:.1f}% on {period_str}")
                results.append({"symbol": symbol, "name": symbol, "source": f"EPS beat {surprise_pct:.1f}%"})
        except Exception as e:
            safe_print(f"[SCANNER-EARNINGS] {symbol} error: {e}")

    _earnings_surprise_cache["date"] = today
    _earnings_surprise_cache["results"] = results
    safe_print(f"[SCANNER-EARNINGS] Found {len(results)} earnings surprise stocks.")
    return results


# ---------------------------------------------------------------------------
# SCANNER 2: Upcoming Earnings — stocks reporting in next 2 days
# Source: Finnhub /calendar/earnings (free)
# Why: Pre-catalyst play — IV rises, price moves on beat. Buy before event.
# ---------------------------------------------------------------------------
_upcoming_earnings_cache = {}

def fetch_upcoming_earnings():
    """Return stocks with earnings in next 2 days. Cached daily."""
    if not FINNHUB_KEY:
        safe_print("[SCANNER] Finnhub key missing — skipping upcoming earnings scan.")
        return []
    today = str(date.today())
    if _upcoming_earnings_cache.get("date") == today:
        return _upcoming_earnings_cache.get("results", [])

    results = []
    try:
        from_date = date.today().strftime("%Y-%m-%d")
        to_date = (date.today() + timedelta(days=2)).strftime("%Y-%m-%d")
        url = f"https://finnhub.io/api/v1/calendar/earnings?from={from_date}&to={to_date}"
        headers = {"X-Finnhub-Token": FINNHUB_KEY}
        res = requests.get(url, headers=headers, timeout=10).json()
        earnings_list = res.get("earningsCalendar", [])
        # Filter: only well-known liquid symbols (alpha only in names ≤5 chars)
        for entry in earnings_list:
            symbol = entry.get("symbol", "")
            if not symbol or not symbol.isalpha() or len(symbol) > 5:
                continue
            eps_est = entry.get("epsEstimate")
            revenue_est = entry.get("revenueEstimate")
            report_date = entry.get("date", "")
            safe_print(f"[SCANNER-UPCOMING] {symbol}: earnings on {report_date}, EPS est={eps_est}")
            results.append({
                "symbol": symbol,
                "name": symbol,
                "source": f"Earnings {report_date} EPS_est={eps_est}"
            })
    except Exception as e:
        safe_print(f"[SCANNER-UPCOMING] Error: {e}")

    # Limit: too many upcoming earnings dilutes signal — pick top 8 random
    random.shuffle(results)
    results = results[:8]
    _upcoming_earnings_cache["date"] = today
    _upcoming_earnings_cache["results"] = results
    safe_print(f"[SCANNER-UPCOMING] Found {len(results)} upcoming earnings stocks.")
    return results


# ---------------------------------------------------------------------------
# SCANNER 3: RVOL Breakout — Relative Volume > 2x AND near/above 52-week high
# Source: Alpaca bars (already authenticated — zero extra cost)
# Why: Unusual volume = institutional/news-driven buying. At 52wk high = momentum.
# ---------------------------------------------------------------------------
_rvol_cache = {}

def fetch_rvol_breakouts():
    """Scan for stocks with RVOL > 2.0 AND price near 52-week high. Cached daily."""
    today = str(date.today())
    if _rvol_cache.get("date") == today:
        return _rvol_cache.get("results", [])

    universe = [
        "AAPL", "TSLA", "NVDA", "MSFT", "AMD", "META", "AMZN", "GOOGL", "NFLX",
        "PLTR", "SMCI", "ARM", "AI", "CRWD", "DDOG", "NET", "SNOW", "MDB", "GTLB",
        "COIN", "HOOD", "MSTR", "RIOT", "MARA", "HUT", "CLSK",
        "SOFI", "UPST", "LC", "AFRM",
        "RBLX", "U", "TTWO", "EA", "ATVI",
        "LLY", "MRNA", "NVAX", "BNTX", "REGN",
        "XOM", "CVX", "OXY", "SLB", "MPC", "VLO",
        "GS", "MS", "JPM", "BAC", "V", "MA",
        "TSLA", "RIVN", "LCID", "NIO", "LI", "XPEV",
    ]
    results = []
    headers = {"Apca-Api-Key-Id": ALPACA_API_KEY, "Apca-Api-Secret-Key": ALPACA_SECRET_KEY}

    for i in range(0, len(universe), 100):
        chunk = universe[i:i+100]
        try:
            sym_str = ",".join(chunk)
            # Fetch 60 days of daily bars
            url = f"https://data.alpaca.markets/v2/stocks/bars?symbols={sym_str}&timeframe=1Day&limit=60"
            res = requests.get(url, headers=headers, timeout=8).json()
            bars_dict = res.get("bars", {})
            
            for symbol, bars in bars_dict.items():
                if len(bars) < 30:
                    continue

                volumes = [b["v"] for b in bars]
                avg_vol_20 = sum(volumes[-21:-1]) / 20  # 20-day avg excl today
                today_vol = volumes[-1]
                if avg_vol_20 == 0:
                    continue
                rvol = today_vol / avg_vol_20

                closes = [b["c"] for b in bars]
                highs = [b["h"] for b in bars]
                current_price = closes[-1]
                high_52w = max(highs)
                near_high = current_price >= high_52w * 0.95  # within 5% of 52wk high

                if rvol >= 2.0 and near_high:
                    safe_print(f"[SCANNER-RVOL] {symbol}: RVOL={rvol:.1f}x, price={current_price:.2f}, 52wkHigh={high_52w:.2f}")
                    results.append({
                        "symbol": symbol,
                        "name": symbol,
                        "source": f"RVOL {rvol:.1f}x + 52wk breakout"
                    })
            time.sleep(1.0) # Rate limit
        except Exception as e:
            safe_print(f"[SCANNER-RVOL] batch error: {e}")

    random.shuffle(results)
    results = results[:6]  # cap: don't flood research with too many
    _rvol_cache["date"] = today
    _rvol_cache["results"] = results
    safe_print(f"[SCANNER-RVOL] Found {len(results)} RVOL breakout stocks.")
    return results
