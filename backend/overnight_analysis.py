"""Free, read-only overnight earnings analysis.

Finnhub supplies the event calendar, SEC supplies official filing links, and
Alpaca supplies the latest available quote. This module never creates orders.
"""

import os
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone

import pytz
import requests

import state
from config import ALPACA_API_KEY, ALPACA_SECRET_KEY, FINNHUB_KEY
from utils import safe_print

EASTERN = pytz.timezone("US/Eastern")
SEC_TICKER_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
SEC_ARCHIVE_URL = "https://www.sec.gov/Archives/edgar/data"
ALPACA_SNAPSHOTS_URL = "https://data.alpaca.markets/v2/stocks/snapshots"
FINNHUB_CALENDAR_URL = "https://finnhub.io/api/v1/calendar/earnings"
FINNHUB_NEWS_URL = "https://finnhub.io/api/v1/company-news"
FINNHUB_PROFILE_URL = "https://finnhub.io/api/v1/stock/profile2"

_refresh_lock = threading.Lock()
_sec_ticker_cache = {"loaded_at": None, "symbols": {}}
_profile_cache = {}

MID_CAP_MIN_MILLIONS = 2_000
LARGE_CAP_MIN_MILLIONS = 10_000


def _now_utc():
    return datetime.now(timezone.utc)


def _now_iso():
    return _now_utc().isoformat()


def _number(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _surprise_percent(actual, estimate):
    actual_value = _number(actual)
    estimate_value = _number(estimate)
    if actual_value is None or estimate_value in (None, 0):
        return None
    return round(((actual_value - estimate_value) / abs(estimate_value)) * 100, 2)


def _clean_symbol(value):
    symbol = str(value or "").strip().upper()
    if not symbol or len(symbol) > 8 or not re.fullmatch(r"[A-Z][A-Z0-9.\-]*", symbol):
        return None
    return symbol


def _session_label(entry):
    raw = str(entry.get("hour") or entry.get("reportTime") or "").lower()
    if raw in {"bmo", "before market open", "before_open"}:
        return "BMO"
    if raw in {"amc", "after market close", "after_close"}:
        return "AMC"
    return "UNKNOWN"


def _request_json(url, headers=None, params=None, timeout=15):
    response = requests.get(url, headers=headers or {}, params=params, timeout=timeout)
    response.raise_for_status()
    return response.json()


def _sec_headers():
    user_agent = os.getenv(
        "SEC_USER_AGENT",
        "Stock-Trading-Bot/1.0",
    )
    return {"User-Agent": user_agent, "Accept-Encoding": "gzip, deflate"}


def fetch_company_profile(symbol):
    """Return free Finnhub name and market-cap data, cached for one day."""
    cached = _profile_cache.get(symbol)
    if cached and _now_utc() - cached["loaded_at"] < timedelta(days=1):
        return cached["data"]
    if not FINNHUB_KEY:
        return {}
    try:
        data = _request_json(
            FINNHUB_PROFILE_URL,
            headers={"X-Finnhub-Token": FINNHUB_KEY},
            params={"symbol": symbol},
            timeout=10,
        )
        profile = {
            "name": str(data.get("name") or symbol).strip(),
            # Finnhub reports marketCapitalization in millions of USD.
            "market_cap_millions": _number(data.get("marketCapitalization")),
        }
    except requests.RequestException as exc:
        safe_print(f"[OVERNIGHT] Profile request failed for {symbol}: {exc}")
        profile = {}
    _profile_cache[symbol] = {"loaded_at": _now_utc(), "data": profile}
    return profile


def _market_cap_category(market_cap_millions):
    if market_cap_millions is None:
        return None
    if market_cap_millions >= LARGE_CAP_MIN_MILLIONS:
        return "Large Cap"
    if market_cap_millions >= MID_CAP_MIN_MILLIONS:
        return "Mid Cap"
    return None


def fetch_earnings_calendar():
    """Fetch recent releases plus next seven days of scheduled earnings."""
    if not FINNHUB_KEY:
        raise RuntimeError("FINNHUB_KEY missing; free earnings calendar unavailable")

    today = datetime.now(EASTERN).date()
    params = {
        "from": (today - timedelta(days=1)).isoformat(),
        "to": (today + timedelta(days=7)).isoformat(),
    }
    data = _request_json(
        FINNHUB_CALENDAR_URL,
        headers={"X-Finnhub-Token": FINNHUB_KEY},
        params=params,
    )
    entries = data.get("earningsCalendar", []) if isinstance(data, dict) else []
    normalized = []
    for entry in entries:
        symbol = _clean_symbol(entry.get("symbol"))
        earnings_date = str(entry.get("date") or "")
        if not symbol or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", earnings_date):
            continue
        eps_actual = _number(entry.get("epsActual"))
        revenue_actual = _number(entry.get("revenueActual"))
        normalized.append({
            "symbol": symbol,
            "earnings_date": earnings_date,
            "session": _session_label(entry),
            "eps_estimate": _number(entry.get("epsEstimate")),
            "eps_actual": eps_actual,
            "eps_surprise_pct": _surprise_percent(
                eps_actual, entry.get("epsEstimate")
            ),
            "revenue_estimate": _number(entry.get("revenueEstimate")),
            "revenue_actual": revenue_actual,
            "revenue_surprise_pct": _surprise_percent(
                revenue_actual, entry.get("revenueEstimate")
            ),
            "finnhub_surprise_pct": _number(entry.get("surprisePercent")),
        })

    eligible = []
    for event in normalized:
        profile = fetch_company_profile(event["symbol"])
        market_cap_millions = profile.get("market_cap_millions")
        market_cap_category = _market_cap_category(market_cap_millions)
        if not market_cap_category:
            continue
        event.update({
            "name": profile.get("name") or event["symbol"],
            "market_cap_millions": market_cap_millions,
            "market_cap_category": market_cap_category,
        })
        eligible.append(event)

    deduped = {}
    for event in eligible:
        deduped[f"{event['symbol']}:{event['earnings_date']}"] = event
    return list(deduped.values())


def _load_sec_tickers():
    loaded_at = _sec_ticker_cache.get("loaded_at")
    if loaded_at and _now_utc() - loaded_at < timedelta(hours=24):
        return _sec_ticker_cache["symbols"]

    data = _request_json(SEC_TICKER_URL, headers=_sec_headers())
    symbols = {}
    for item in data.values() if isinstance(data, dict) else []:
        symbol = _clean_symbol(item.get("ticker"))
        cik = str(item.get("cik_str") or "").strip()
        if symbol and cik:
            symbols[symbol] = cik.zfill(10)
    _sec_ticker_cache["loaded_at"] = _now_utc()
    _sec_ticker_cache["symbols"] = symbols
    return symbols


def fetch_sec_filing(symbol, earnings_date):
    """Return nearest recent 8-K/10-Q/10-K filing and official archive URL."""
    try:
        cik = _load_sec_tickers().get(symbol)
        if not cik:
            return {"status": "not_found", "url": None}

        data = _request_json(
            SEC_SUBMISSIONS_URL.format(cik=cik),
            headers=_sec_headers(),
        )
        recent = data.get("filings", {}).get("recent", {})
        forms = recent.get("form", [])
        filing_dates = recent.get("filingDate", [])
        accessions = recent.get("accessionNumber", [])
        documents = recent.get("primaryDocument", [])
        target_date = date.fromisoformat(earnings_date)
        candidates = []
        for index, form in enumerate(forms):
            if form not in {"8-K", "10-Q", "10-K"}:
                continue
            try:
                filed_date = date.fromisoformat(filing_dates[index])
            except (IndexError, TypeError, ValueError):
                continue
            if target_date - timedelta(days=3) <= filed_date <= target_date + timedelta(days=3):
                candidates.append((filed_date, index))
        if not candidates:
            return {"status": "not_found", "url": None}

        _, index = sorted(candidates, reverse=True)[0]
        accession = accessions[index]
        accession_path = accession.replace("-", "")
        document = documents[index]
        url = f"{SEC_ARCHIVE_URL}/{int(cik)}/{accession_path}/{document}"
        return {
            "status": "found",
            "form": forms[index],
            "filed_at": filing_dates[index],
            "accession": accession,
            "url": url,
        }
    except requests.RequestException as exc:
        safe_print(f"[OVERNIGHT] SEC request failed for {symbol}: {exc}")
        return {"status": "error", "url": None, "error": str(exc)}
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        safe_print(f"[OVERNIGHT] SEC response invalid for {symbol}: {exc}")
        return {"status": "error", "url": None, "error": str(exc)}


def fetch_news(symbol, earnings_date):
    if not FINNHUB_KEY:
        return []
    try:
        today = datetime.now(EASTERN).date()
        data = _request_json(
            FINNHUB_NEWS_URL,
            headers={"X-Finnhub-Token": FINNHUB_KEY},
            params={
                "symbol": symbol,
                "from": earnings_date,
                "to": today.isoformat(),
            },
            timeout=10,
        )
        headlines = []
        for item in data if isinstance(data, list) else []:
            headline = str(item.get("headline") or "").strip()
            if headline:
                headlines.append({
                    "headline": headline,
                    "source": item.get("source"),
                    "url": item.get("url"),
                    "published_at": item.get("datetime"),
                })
        return headlines[:5]
    except requests.RequestException as exc:
        safe_print(f"[OVERNIGHT] News request failed for {symbol}: {exc}")
        return []


def fetch_after_hours_snapshots(symbols):
    if not ALPACA_API_KEY or not ALPACA_SECRET_KEY or not symbols:
        return {}
    try:
        data = _request_json(
            ALPACA_SNAPSHOTS_URL,
            headers={
                "Apca-Api-Key-Id": ALPACA_API_KEY,
                "Apca-Api-Secret-Key": ALPACA_SECRET_KEY,
            },
            params={"symbols": ",".join(symbols), "feed": "iex"},
            timeout=15,
        )
        return data if isinstance(data, dict) else {}
    except requests.RequestException as exc:
        safe_print(f"[OVERNIGHT] Alpaca snapshot request failed: {exc}")
        return {}


def _snapshot_metrics(snapshot):
    if not isinstance(snapshot, dict):
        return {}
    latest_trade = snapshot.get("latestTrade") or {}
    daily_bar = snapshot.get("dailyBar") or {}
    previous_bar = snapshot.get("prevDailyBar") or {}
    latest_price = _number(latest_trade.get("p"))
    close_price = _number(daily_bar.get("c"))
    previous_close = _number(previous_bar.get("c"))
    baseline = close_price or previous_close
    change = ((latest_price - baseline) / baseline * 100) if latest_price and baseline else None
    current_volume = _number(daily_bar.get("v"))
    previous_volume = _number(previous_bar.get("v"))
    volume_ratio = (
        current_volume / previous_volume
        if current_volume is not None and previous_volume
        else None
    )
    return {
        "after_hours_price": latest_price,
        "regular_close_price": close_price,
        "after_hours_change_pct": round(change, 2) if change is not None else None,
        "volume": current_volume,
        "volume_ratio": round(volume_ratio, 2) if volume_ratio is not None else None,
        "quote_timestamp": latest_trade.get("t"),
    }


def _guidance_from_headlines(headlines):
    text = " ".join(item.get("headline", "") for item in headlines).lower()
    if re.search(r"\b(raises?|raised|increases?|increased|boosts?|boosted)\b.{0,30}\b(guidance|outlook|forecast)\b", text):
        return "RAISED"
    if re.search(r"\b(lowers?|lowered|cuts?|cut|reduces?|reduced)\b.{0,30}\b(guidance|outlook|forecast)\b", text):
        return "LOWERED"
    if "maintains guidance" in text or "reaffirms guidance" in text:
        return "MAINTAINED"
    return "UNKNOWN"


def _score_event(event):
    if event.get("status") == "upcoming":
        event["score"] = None
        event["signal"] = "SCHEDULED"
        event["summary"] = "Upcoming earnings; no released results yet."
        return

    score = 50.0
    reasons = []
    eps_surprise = event.get("eps_surprise_pct")
    revenue_surprise = event.get("revenue_surprise_pct")
    price_change = event.get("after_hours_change_pct")
    guidance = event.get("guidance_direction")
    has_evidence = any((
        eps_surprise is not None,
        revenue_surprise is not None,
        guidance in {"RAISED", "LOWERED", "MAINTAINED"},
        price_change is not None,
    ))
    if not has_evidence:
        event["score"] = None
        event["signal"] = "INSUFFICIENT DATA"
        event["summary"] = "Released event has no verified result or price data yet."
        return

    if eps_surprise is not None:
        contribution = max(-25, min(25, eps_surprise * 2))
        score += contribution
        reasons.append(f"EPS surprise {eps_surprise:+.1f}%")
    if revenue_surprise is not None:
        contribution = max(-25, min(25, revenue_surprise * 2))
        score += contribution
        reasons.append(f"revenue surprise {revenue_surprise:+.1f}%")
    if guidance == "RAISED":
        score += 20
        reasons.append("guidance raised")
    elif guidance == "LOWERED":
        score -= 20
        reasons.append("guidance lowered")
    elif guidance == "MAINTAINED":
        score += 3
        reasons.append("guidance maintained")
    if price_change is not None:
        score += max(-10, min(10, price_change))
        reasons.append(f"extended move {price_change:+.1f}%")

    score = int(max(0, min(100, round(score))))
    if score >= 75:
        signal = "STRONG BULLISH"
    elif score >= 60:
        signal = "BULLISH"
    elif score >= 40:
        signal = "MIXED"
    elif score >= 25:
        signal = "BEARISH"
    else:
        signal = "STRONG BEARISH"
    event["score"] = score
    event["signal"] = signal
    event["summary"] = (
        "Upcoming earnings; no released results yet."
        if event["status"] == "upcoming"
        else "; ".join(reasons) if reasons else "Released earnings data incomplete."
    )


def _build_event(calendar_event, snapshot, sec_filing, headlines):
    today = datetime.now(EASTERN).date()
    event_date = date.fromisoformat(calendar_event["earnings_date"])
    released = (
        calendar_event.get("eps_actual") is not None
        or calendar_event.get("revenue_actual") is not None
        or event_date < today
    )
    event = {
        **calendar_event,
        "status": "released" if released else "upcoming",
        "detected_at": _now_iso(),
        "sec_filing": sec_filing,
        "news": headlines,
        "guidance_direction": _guidance_from_headlines(headlines) if released else "UNKNOWN",
        **_snapshot_metrics(snapshot),
    }
    _score_event(event)
    return event


def run_overnight_refresh():
    """Refresh analysis state. This function is read-only with respect to brokers."""
    if not _refresh_lock.acquire(blocking=False):
        return {"status": "refreshing", "message": "Refresh already running"}

    state.overnight_analysis["status"] = "refreshing"
    state.overnight_analysis["last_attempt"] = _now_iso()
    state.overnight_analysis["error"] = None
    state.save_overnight_analysis()
    try:
        calendar = fetch_earnings_calendar()
        # Calendar rows do not carry status; limit expensive enrichment to reported rows.
        today = datetime.now(EASTERN).date()
        released = [
            item for item in calendar
            if item.get("eps_actual") is not None
            or item.get("revenue_actual") is not None
            or date.fromisoformat(item["earnings_date"]) < today
        ][:15]
        released_keys = {
            (item["symbol"], item["earnings_date"]) for item in released
        }
        upcoming = [
            item for item in calendar
            if date.fromisoformat(item["earnings_date"]) >= today
            and (item["symbol"], item["earnings_date"]) not in released_keys
        ][:40]
        enriched_rows = released + upcoming
        snapshots = fetch_after_hours_snapshots([item["symbol"] for item in released])
        events = []
        for item in enriched_rows:
            is_released = (item["symbol"], item["earnings_date"]) in released_keys
            sec_filing = fetch_sec_filing(item["symbol"], item["earnings_date"]) if is_released else {
                "status": "not_checked",
                "url": None,
            }
            headlines = fetch_news(item["symbol"], item["earnings_date"]) if is_released else []
            event = _build_event(
                item,
                snapshots.get(item["symbol"], {}),
                sec_filing,
                headlines,
            )
            events.append(event)

        events.sort(key=lambda item: (item["status"] != "released", item["earnings_date"], item["symbol"]))
        state.overnight_analysis.update({
            "events": events,
            "status": "complete",
            "last_refresh": _now_iso(),
            "error": None,
            "sources": {
                "finnhub": "earnings calendar and headlines",
                "sec": "official filing links",
                "alpaca": "latest available quote and daily volume",
                "scoring": "local deterministic rules; no trade execution",
            },
        })
        state.save_overnight_analysis()
        safe_print(f"[OVERNIGHT] Refresh complete: {len(events)} events")
        return state.overnight_analysis
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        message = f"{type(exc).__name__}: {exc}"
        state.overnight_analysis.update({
            "status": "error",
            "error": message,
        })
        state.save_overnight_analysis()
        safe_print(f"[OVERNIGHT] Refresh failed: {message}")
        return state.overnight_analysis
    finally:
        _refresh_lock.release()


def overnight_scheduler():
    """Poll during after-hours and pre-market windows on weekdays."""
    last_slot = None
    safe_print("[OVERNIGHT] Scheduler started")
    while True:
        try:
            now = datetime.now(tz=pytz.utc).astimezone(EASTERN)
            minutes = now.hour * 60 + now.minute
            in_after_hours = 16 * 60 <= minutes < 20 * 60
            in_pre_market = 4 * 60 <= minutes < 9 * 60
            if now.weekday() < 5 and (in_after_hours or in_pre_market):
                slot = f"{now.date()}:{now.hour}:{now.minute // 10}"
                if slot != last_slot:
                    threading.Thread(target=run_overnight_refresh, daemon=True).start()
                    last_slot = slot
        except Exception as exc:
            safe_print(f"[OVERNIGHT] Scheduler error: {type(exc).__name__}: {exc}")
        time.sleep(60)
