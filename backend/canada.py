"""Canadian research snapshot — free data only, no model calls.

Everything here comes from Yahoo Finance through yfinance: prices, NAV, yield,
holdings, and the technical levels used for buy zones. That matters because the
Gemini free tier allows roughly twenty requests per day per project, and the US
research cycle already spends most of it.

Symbols carry their exchange suffix (.TO for TSX, .V for TSX Venture). A bare
ticker is always the US listing, which is a different instrument.

The levels are mechanical: a moving-average pullback zone, an ATR-sized stop,
nearest resistance and an ATR projection. They are structure, not advice, and
they say nothing about whether the business is worth owning.
"""

import json
import os
from datetime import datetime, timezone

import yfinance as yf

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "frontend", "public")
OUTPUT_NAME = "canada.json"

CANADIAN_EQUITIES = [
    # Financials
    "RY.TO",     # Royal Bank of Canada
    "TD.TO",     # Toronto-Dominion
    "BNS.TO",    # Bank of Nova Scotia
    "BMO.TO",    # Bank of Montreal
    "NA.TO",     # National Bank of Canada
    "MFC.TO",    # Manulife
    "IFC.TO",    # Intact Financial
    # Energy
    "CNQ.TO",    # Canadian Natural Resources
    "SU.TO",     # Suncor
    "CVE.TO",    # Cenovus
    "ENB.TO",    # Enbridge
    "TRP.TO",    # TC Energy
    # Rail and industrials
    "CP.TO",     # Canadian Pacific Kansas City
    "CNR.TO",    # Canadian National Railway
    "WCN.TO",    # Waste Connections
    # Consumer
    "ATD.TO",    # Alimentation Couche-Tard
    "QSR.TO",    # Restaurant Brands International
    "L.TO",      # Loblaw
    # Technology
    "SHOP.TO",   # Shopify
    "CSU.TO",    # Constellation Software
    "TRI.TO",    # Thomson Reuters
    # Materials and telecom
    "NTR.TO",    # Nutrien
    "AEM.TO",    # Agnico Eagle Mines
    "BCE.TO",    # BCE
    "T.TO",      # Telus
]

CANADIAN_ETFS = [
    "XEQT.TO",   # iShares all-equity
    "VFV.TO",    # Vanguard S&P 500, CAD
    "QQC.TO",    # Invesco NASDAQ 100
    "XGRO.TO",   # iShares growth (80/20)
    "XBAL.TO",   # iShares balanced (60/40)
    "XIC.TO",    # iShares S&P/TSX composite
    "XAW.TO",    # iShares all-country ex-Canada
    "VUN.TO",    # Vanguard US total market, CAD
    "ZSP.TO",    # BMO S&P 500
    "ZQQ.TO",    # BMO NASDAQ 100
    "XEI.TO",    # iShares TSX high dividend
    "VDY.TO",    # Vanguard FTSE Canadian high dividend
    "ZWC.TO",    # BMO covered call high dividend
    "ZEB.TO",    # BMO equal-weight banks
    "XIT.TO",    # iShares TSX capped info tech
    "XEG.TO",    # iShares TSX capped energy
    "ZAG.TO",    # BMO aggregate bond
    "CASH.TO",   # Global X high-interest savings
]


def _pct(current, previous):
    try:
        if not previous:
            return None
        return round((float(current) / float(previous) - 1) * 100, 2)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _rsi(closes, length=14):
    if len(closes) < length + 1:
        return None
    delta = closes.diff()
    gain = delta.clip(lower=0).rolling(length).mean()
    loss = (-delta.clip(upper=0)).rolling(length).mean()
    last_loss = float(loss.iloc[-1])
    if last_loss == 0:
        return 100.0
    rs = float(gain.iloc[-1]) / last_loss
    return round(100 - (100 / (1 + rs)), 1)


def _atr(frame, length=14):
    try:
        high = frame["High"]
        low = frame["Low"]
        close = frame["Close"]
        previous_close = close.shift()
        true_range = (high - low).to_frame("a")
        true_range["b"] = (high - previous_close).abs()
        true_range["c"] = (low - previous_close).abs()
        tr = true_range.max(axis=1)
        value = float(tr.rolling(length).mean().iloc[-1])
        return round(value, 2) if value == value else None
    except Exception:
        return None


def _levels(frame, price):
    """Mechanical buy structure. Zones are entries, not predictions."""
    try:
        closes = frame["Close"].dropna()
        highs = frame["High"].dropna()
        lows = frame["Low"].dropna()
    except Exception:
        return None

    if len(closes) < 30:
        return None

    sma20 = float(closes.rolling(20).mean().iloc[-1])
    sma50 = float(closes.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else None
    atr = _atr(frame)
    if not atr or atr <= 0:
        return None

    support = float(lows.tail(20).min())
    resistance = float(highs.tail(20).max())
    rsi = _rsi(closes)

    zone_low = round(sma20 - 0.5 * atr, 2)
    zone_high = round(sma20 + 0.3 * atr, 2)
    stop = round(min(support - 0.25 * atr, zone_low - 0.75 * atr), 2)

    target_one = round(resistance, 2)
    if target_one <= price:
        target_one = round(price + 2 * atr, 2)
    target_two = round(price + 4 * atr, 2)

    entry_mid = round((zone_low + zone_high) / 2, 2)
    reward = target_one - entry_mid
    risk = entry_mid - stop
    reward_risk = round(reward / risk, 2) if risk > 0 else None

    distance_atr = (price - sma20) / atr if atr else 0
    if zone_low <= price <= zone_high:
        state, tone = "in_zone", "positive"
        detail = "Price is inside the pullback zone."
    elif price < zone_low:
        state, tone = "below_zone", "negative"
        detail = "Price is under its 20-day average, below the zone. Wait for it to reclaim the average."
    elif distance_atr >= 2:
        state, tone = "stretched", "negative"
        detail = f"Price sits {distance_atr:.1f} ATR above the 20-day average. Chasing here is late."
    else:
        state, tone = "wait", "warning"
        detail = "Above the zone but not stretched. A pullback toward the 20-day is the better entry."

    return {
        "sma20": round(sma20, 2),
        "sma50": round(sma50, 2) if sma50 else None,
        "rsi14": rsi,
        "atr14": atr,
        "support": round(support, 2),
        "resistance": round(resistance, 2),
        "zone_low": zone_low,
        "zone_high": zone_high,
        "stop": stop,
        "target_one": target_one,
        "target_two": target_two,
        "reward_risk": reward_risk,
        "state": state,
        "tone": tone,
        "detail": detail,
    }


def _trade_score(row):
    """Short-term entry score, 0-100, from the mechanical levels only."""
    levels = row.get("levels") or {}
    if not levels:
        return None

    score = 50
    score += {"in_zone": 20, "wait": 5, "below_zone": -10, "stretched": -25}.get(
        levels.get("state"), 0
    )

    reward_risk = levels.get("reward_risk")
    if reward_risk is not None:
        if reward_risk >= 2:
            score += 20
        elif reward_risk >= 1.5:
            score += 12
        elif reward_risk >= 1:
            score += 5
        else:
            score -= 10

    rsi = levels.get("rsi14")
    if rsi is not None:
        if 40 <= rsi <= 60:
            score += 10
        elif rsi > 70:
            score -= 15
        elif rsi < 30:
            score -= 5

    return max(0, min(100, round(score)))


def _long_score(row):
    """Hold score, 0-100: trend first, then volatility, drawdown and cost."""
    plan = row.get("long_term") or {}
    if not plan:
        return None

    score = 50
    score += 30 if plan.get("above_sma200") else -30
    score += 15 if plan.get("above_sma50") else -10

    gain = plan.get("return_1y_pct")
    if gain is not None:
        score += max(-15, min(15, gain / 2))

    vol = plan.get("volatility_pct")
    if vol is not None:
        if vol < 12:
            score += 15
        elif vol < 18:
            score += 8
        elif vol < 25:
            score += 0
        else:
            score -= 10

    drawdown = plan.get("drawdown_from_high_pct")
    if drawdown is not None:
        if drawdown > -10:
            score += 10
        elif drawdown <= -20:
            score -= 5

    mer = row.get("mer_pct")
    if mer is not None:
        if mer <= 0.15:
            score += 10
        elif mer <= 0.3:
            score += 5
        elif mer > 0.5:
            score -= 5

    return max(0, min(100, round(score)))


def _entry_call(row):
    """Plain sentence for today: buy, wait, or do not buy, with real prices."""
    levels = row.get("levels") or {}
    ticker = row["ticker"]
    price = row["price"]
    state = levels.get("state")
    low = levels.get("zone_low")
    high = levels.get("zone_high")

    if state == "in_zone":
        call = "Buy now"
        sentence = (
            f"Buy {ticker} at ${price:.2f} — inside its ${low:.2f}–${high:.2f} buy zone. "
            f"Stop ${levels['stop']:.2f}, first target ${levels['target_one']:.2f}."
        )
    elif state == "wait":
        call = "Wait"
        sentence = (
            f"Wait on {ticker} at ${price:.2f} — already above the ${low:.2f} buy zone. "
            f"Buy only if it dips to ${low:.2f}–${high:.2f}."
        )
    elif state == "below_zone":
        call = "Don't buy yet"
        sentence = (
            f"Don't buy {ticker} yet — ${price:.2f} sits under its 20-day average "
            f"(${levels['sma20']:.2f}). Wait for a close back above ${low:.2f}."
        )
    elif state == "stretched":
        call = "Too late"
        sentence = (
            f"Don't chase {ticker} — ${price:.2f} is stretched above its 20-day "
            f"(${levels['sma20']:.2f}). Wait for a pullback to ${low:.2f}–${high:.2f}."
        )
    else:
        call = "No setup"
        sentence = f"No clean setup on {ticker} at ${price:.2f}."

    return call, sentence


def _hold_call(row):
    """Plain sentence for the long hold: keep buying, pause, or go slow."""
    plan = row.get("long_term") or {}
    ticker = row["ticker"]
    price = row["price"]
    verdict = plan.get("verdict")
    sma200 = plan.get("sma200")
    mer = row.get("mer_pct")
    fee = f", MER {mer:.2f}%" if mer is not None else ""

    if verdict == "accumulate" and plan.get("above_sma50"):
        call = "Keep buying"
        sentence = (
            f"Keep buying {ticker} monthly at ${price:.2f} — above its 200-day "
            f"(${sma200:.2f}){fee}. Daily noise does not change a long hold."
        )
    elif verdict == "accumulate":
        call = "Keep buying"
        sentence = (
            f"Keep buying {ticker} monthly at ${price:.2f} — long trend intact, "
            f"short term soft{fee}. No reason to pause contributions."
        )
    elif verdict == "wait":
        call = "Pause"
        line = f" (${sma200:.2f})" if sma200 else ""
        sentence = (
            f"Hold new money on {ticker} for now — ${price:.2f} is under its 200-day"
            f"{line}{fee}. Resume when it reclaims that line."
        )
    else:
        call = "Small chunks"
        sentence = (
            f"Buy {ticker} in small, even chunks at ${price:.2f} — not enough history "
            f"for a 200-day trend{fee}."
        )

    return call, sentence


def _picks(equities, etfs):
    """Top names per question, from the same arithmetic as the cards."""
    entries = []
    for kind, rows in (("equity", equities), ("etf", etfs)):
        for row in rows:
            entries.append(
                {
                    "kind": kind,
                    "row": row,
                    "trade": _trade_score(row),
                    "hold": _long_score(row),
                }
            )

    def brief(entry, score, reason):
        row = entry["row"]
        return {
            "ticker": row["ticker"],
            "kind": entry["kind"],
            "price": row["price"],
            "change_1d": row.get("change_1d"),
            "score": score,
            "reason": reason,
            "state": (row.get("levels") or {}).get("state"),
            "verdict": (row.get("long_term") or {}).get("verdict"),
        }

    today = []
    for entry in entries:
        if entry["trade"] is None:
            continue
        call, sentence = _entry_call(entry["row"])
        pick = brief(entry, entry["trade"], sentence)
        pick["call"] = call
        today.append(pick)
    today = sorted(today, key=lambda pick: pick["score"], reverse=True)[:3]

    holds = []
    for entry in entries:
        if entry["hold"] is None:
            continue
        call, sentence = _hold_call(entry["row"])
        pick = brief(entry, entry["hold"], sentence)
        pick["call"] = call
        holds.append(pick)
    # Score ties are common near the ceiling; one-year return breaks them.
    holds = sorted(
        holds,
        key=lambda pick: (
            pick["score"],
            next(
                (e["row"].get("long_term") or {}).get("return_1y_pct") or 0
                for e in entries
                if e["row"]["ticker"] == pick["ticker"]
            ),
        ),
        reverse=True,
    )[:3]

    buy_today = [pick["ticker"] for pick in today if pick["call"] == "Buy now"]
    headline = (
        f"Buy {', '.join(buy_today)} today — price sits inside the buy zone."
        if buy_today
        else "Nothing is a buy today — the best setups are still a wait."
    )

    return {
        "headline": headline,
        "today": today,
        "long_term": holds,
        "note": (
            "Rankings, not recommendations. Entry score weighs the 20-day zone, "
            "reward/risk and RSI; hold score weighs the 50/200-day trend, one-year "
            "return, volatility, drawdown and MER. All of it is arithmetic on the "
            "same free daily bars, so nothing here is a model opinion."
        ),
    }


def _long_term(frame, price, details):
    """Long-hold read: trend, drawdown, cost.

    The levels answer where a pullback entry sits. This adds whether the long
    trend is intact, how deep the worst recent hole was, and what the fund
    charges. Everything here is arithmetic on the same free bars, so it adds no
    model calls.
    """
    try:
        closes = frame["Close"].dropna()
    except Exception:
        return None
    if len(closes) < 60:
        return None

    sma50 = float(closes.rolling(50).mean().iloc[-1]) if len(closes) >= 50 else None
    sma200 = float(closes.rolling(200).mean().iloc[-1]) if len(closes) >= 200 else None

    year_high = float(closes.max())
    drawdown = round((price / year_high - 1) * 100, 1) if year_high else None

    peak = closes.cummax()
    max_drawdown = round(float((closes / peak - 1).min()) * 100, 1)

    daily = closes.pct_change().dropna()
    volatility = round(float(daily.std()) * (252 ** 0.5) * 100, 1) if len(daily) > 20 else None

    year_ago = float(closes.iloc[0])
    return_1y = round((price / year_ago - 1) * 100, 1) if year_ago else None

    above50 = bool(sma50 and price >= sma50)
    above200 = bool(sma200 and price >= sma200)

    if sma200 is None:
        verdict, tone = "hold", "warning"
        action = "Not enough history for a 200-day trend. Buy in small, even chunks instead of one lump."
    elif above200 and above50:
        verdict, tone = "accumulate", "positive"
        action = "Above both averages. Keep buying on your normal schedule."
    elif above200:
        verdict, tone = "accumulate", "positive"
        action = "Long trend intact, short term soft. No reason to pause contributions."
    else:
        verdict, tone = "wait", "warning"
        action = "Trading under its 200-day average. New money waits, or goes in smaller chunks until it reclaims."

    reasons = []
    if sma200:
        gap = (price / sma200 - 1) * 100
        reasons.append(f"{abs(gap):.1f}% {'above' if gap >= 0 else 'below'} its 200-day average.")
    if sma50:
        gap50 = (price / sma50 - 1) * 100
        reasons.append(f"{abs(gap50):.1f}% {'above' if gap50 >= 0 else 'below'} its 50-day average.")
    if drawdown is not None:
        reasons.append(f"{abs(drawdown):.1f}% off its one-year high.")
    if volatility is not None:
        reasons.append(f"About {volatility:.0f}% annualized volatility over the past year.")
    if details.get("mer_pct") is not None:
        reasons.append(f"MER {details['mer_pct']:.2f}% — that cost compounds against a long hold.")

    return {
        "verdict": verdict,
        "tone": tone,
        "action": action,
        "sma50": round(sma50, 2) if sma50 else None,
        "sma200": round(sma200, 2) if sma200 else None,
        "above_sma50": above50,
        "above_sma200": above200,
        "drawdown_from_high_pct": drawdown,
        "max_drawdown_1y_pct": max_drawdown,
        "volatility_pct": volatility,
        "return_1y_pct": return_1y,
        "reasons": reasons[:4],
    }


def _history_map():
    """One batched download for every symbol — a request per symbol invites 429s."""
    symbols = CANADIAN_EQUITIES + CANADIAN_ETFS
    return yf.download(
        tickers=" ".join(symbols),
        period="1y",
        interval="1d",
        group_by="ticker",
        progress=False,
        threads=True,
        auto_adjust=True,
    )


def _frame_for(frames, symbol):
    try:
        frame = frames[symbol] if hasattr(frames.columns, "levels") else frames
        frame = frame.dropna(subset=["Close"])
        return frame if len(frame) else None
    except Exception:
        return None


def _fund_details(symbol, with_fund_data):
    details = {
        "nav": None,
        "yield_pct": None,
        "name": None,
        "mer_pct": None,
        "aum": None,
        "holdings": [],
        "mix": {},
    }
    try:
        info = yf.Ticker(symbol).info or {}
        details["name"] = info.get("longName") or info.get("shortName")
        nav = info.get("navPrice")
        details["nav"] = round(float(nav), 2) if nav else None
        distribution = info.get("yield")
        if distribution:
            details["yield_pct"] = round(float(distribution) * 100, 2)
        # Cost matters more than any entry point when the hold is decades long.
        mer = info.get("netExpenseRatio") or info.get("annualReportExpenseRatio")
        details["mer_pct"] = round(float(mer), 2) if mer else None
        assets = info.get("totalAssets")
        details["aum"] = int(assets) if assets else None
    except Exception as error:
        print(f"[CANADA] info failed for {symbol}: {error}")

    if not with_fund_data:
        return details

    try:
        funds = yf.Ticker(symbol).funds_data
        holdings = funds.top_holdings
        if holdings is not None and len(holdings):
            for name, row in holdings.head(6).iterrows():
                weight = row.get("Holding Percent")
                details["holdings"].append({
                    "symbol": str(name),
                    "name": str(row.get("Name") or name),
                    "weight_pct": round(float(weight) * 100, 2) if weight == weight else None,
                })
        mix = funds.asset_classes or {}
        for key, label in (("stockPosition", "stock"), ("bondPosition", "bond"), ("cashPosition", "cash")):
            value = mix.get(key)
            if value:
                details["mix"][label] = round(float(value) * 100, 1)
    except Exception as error:
        print(f"[CANADA] holdings failed for {symbol}: {error}")

    return details


def _row(symbol, frame, is_etf):
    if frame is None or len(frame) < 2:
        return None

    closes = frame["Close"].dropna()
    price = float(closes.iloc[-1])
    previous = float(closes.iloc[-2])
    month_ago = float(closes.iloc[-21]) if len(closes) >= 21 else float(closes.iloc[0])
    quarter_ago = float(closes.iloc[-63]) if len(closes) >= 63 else float(closes.iloc[0])

    row = {
        "symbol": symbol,
        "ticker": symbol.split(".")[0],
        "exchange": "TSXV" if symbol.endswith(".V") else "TSX",
        "price": round(price, 2),
        "change_1d": _pct(price, previous),
        "change_1mo": _pct(price, month_ago),
        "change_3mo": _pct(price, quarter_ago),
        "as_of": str(closes.index[-1].date()),
        "tradable": False,
        "levels": _levels(frame, price),
    }

    details = _fund_details(symbol, with_fund_data=is_etf)
    row["name"] = details["name"] or row["ticker"]

    row["long_term"] = _long_term(frame, price, details)

    if is_etf:
        row["nav"] = details["nav"]
        row["premium_pct"] = _pct(price, details["nav"]) if details["nav"] else None
        row["yield_pct"] = details["yield_pct"]
        row["mer_pct"] = details["mer_pct"]
        row["aum"] = details["aum"]
        row["holdings"] = details["holdings"]
        row["mix"] = details["mix"]

    return row


def build_snapshot():
    frames = _history_map()
    equities = []
    etfs = []

    for symbol in CANADIAN_EQUITIES:
        row = _row(symbol, _frame_for(frames, symbol), is_etf=False)
        if row:
            equities.append(row)

    for symbol in CANADIAN_ETFS:
        row = _row(symbol, _frame_for(frames, symbol), is_etf=True)
        if row:
            etfs.append(row)

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Yahoo Finance via yfinance",
        "currency": "CAD",
        "note": "Research only. Alpaca paper accounts cannot trade TSX or TSXV listings.",
        "levels_note": (
            "Equity buy zones are mechanical: 20-day average plus or minus a fraction of ATR, "
            "stop under recent support, targets at resistance and an ATR projection. "
            "ETFs additionally report a long-term read: 50/200-day trend, one-year "
            "drawdown, volatility and MER. Structure only, not a recommendation."
        ),
        "equities": equities,
        "etfs": etfs,
        "picks": _picks(equities, etfs),
    }


def write_snapshot(snapshot):
    payload = json.dumps(snapshot, indent=2)
    for directory in (BASE_DIR, PUBLIC_DIR):
        try:
            os.makedirs(directory, exist_ok=True)
            with open(os.path.join(directory, OUTPUT_NAME), "w", encoding="utf-8") as handle:
                handle.write(payload)
        except Exception as error:
            print(f"[CANADA] write failed in {directory}: {error}")


if __name__ == "__main__":
    data = build_snapshot()
    write_snapshot(data)
    print(
        f"[CANADA] {len(data['equities'])} equities, {len(data['etfs'])} ETFs "
        f"written to {OUTPUT_NAME}"
    )
