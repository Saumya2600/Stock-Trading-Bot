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
    # Asset-allocation portfolios
    "XEQT.TO",   # iShares all-equity
    "XGRO.TO",   # iShares growth (80/20)
    "XBAL.TO",   # iShares balanced (60/40)
    # Broad market
    "XIC.TO",    # iShares S&P/TSX composite
    "XAW.TO",    # iShares all-country ex-Canada
    "VFV.TO",    # Vanguard S&P 500, CAD
    "VUN.TO",    # Vanguard US total market, CAD
    "ZSP.TO",    # BMO S&P 500
    "QQC.TO",    # Invesco NASDAQ 100
    "ZQQ.TO",    # BMO NASDAQ 100
    # Dividends and income
    "XEI.TO",    # iShares TSX high dividend
    "VDY.TO",    # Vanguard FTSE Canadian high dividend
    "ZWC.TO",    # BMO covered call high dividend
    # Sectors
    "ZEB.TO",    # BMO equal-weight banks
    "XIT.TO",    # iShares TSX capped info tech
    "XEG.TO",    # iShares TSX capped energy
    # Fixed income and cash
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

    if is_etf:
        row["nav"] = details["nav"]
        row["premium_pct"] = _pct(price, details["nav"]) if details["nav"] else None
        row["yield_pct"] = details["yield_pct"]
        row["mer_pct"] = details["mer_pct"]
        row["aum"] = details["aum"]
        row["holdings"] = details["holdings"]
        row["mix"] = details["mix"]
        row["long_term"] = _long_term(frame, price, details)

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
