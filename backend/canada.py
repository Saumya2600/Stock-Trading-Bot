"""Canadian research snapshot — free data only, no model calls.

Everything here comes from Yahoo Finance through yfinance: prices, NAV, yield,
holdings. That matters because the Gemini free tier allows roughly twenty
requests per day per project, and the US research cycle already spends most of
it. Canadian coverage therefore costs zero tokens.

Symbols carry their exchange suffix (.TO for TSX, .V for TSX Venture). A bare
ticker is always the US listing, which is a different instrument.
"""

import json
import os
from datetime import datetime, timezone

import yfinance as yf

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, "frontend", "public")
OUTPUT_NAME = "canada.json"

CANADIAN_EQUITIES = [
    "SHOP.TO",   # Shopify
    "RY.TO",     # Royal Bank of Canada
    "TD.TO",     # Toronto-Dominion
    "CNQ.TO",    # Canadian Natural Resources
    "ENB.TO",    # Enbridge
    "CP.TO",     # Canadian Pacific Kansas City
    "SU.TO",     # Suncor
    "MFC.TO",    # Manulife
]

CANADIAN_ETFS = [
    "XEQT.TO",   # iShares All-Equity
    "VEQT.TO",   # Vanguard All-Equity
    "QQC.TO",    # Invesco NASDAQ 100
    "ZWC.TO",    # BMO covered call high dividend
    "XEI.TO",    # iShares TSX high dividend
    "XGRO.TO",   # iShares growth portfolio
    "ZSP.TO",    # BMO S&P 500
]


def _pct(current, previous):
    try:
        if not previous:
            return None
        return round((float(current) / float(previous) - 1) * 100, 2)
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def _history_map():
    """One batched download for every symbol — a request per symbol invites 429s."""
    symbols = CANADIAN_EQUITIES + CANADIAN_ETFS
    frames = yf.download(
        tickers=" ".join(symbols),
        period="3mo",
        interval="1d",
        group_by="ticker",
        progress=False,
        threads=True,
        auto_adjust=True,
    )
    return frames


def _series_for(frames, symbol):
    try:
        frame = frames[symbol] if hasattr(frames.columns, "levels") else frames
        closes = frame["Close"].dropna()
        return closes
    except Exception:
        return None


def _fund_details(symbol, with_fund_data):
    details = {"nav": None, "yield_pct": None, "name": None, "holdings": [], "mix": {}}
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
        details["name"] = info.get("longName") or info.get("shortName")
        nav = info.get("navPrice")
        details["nav"] = round(float(nav), 2) if nav else None
        distribution = info.get("yield")
        if distribution:
            details["yield_pct"] = round(float(distribution) * 100, 2)
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


def _row(symbol, closes, is_etf):
    if closes is None or len(closes) < 2:
        return None

    price = float(closes.iloc[-1])
    previous = float(closes.iloc[-2])
    month_ago = float(closes.iloc[-21]) if len(closes) >= 21 else float(closes.iloc[0])
    quarter_ago = float(closes.iloc[0])

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
    }

    details = _fund_details(symbol, with_fund_data=is_etf)
    row["name"] = details["name"] or row["ticker"]

    if is_etf:
        row["nav"] = details["nav"]
        row["premium_pct"] = _pct(price, details["nav"]) if details["nav"] else None
        row["yield_pct"] = details["yield_pct"]
        row["holdings"] = details["holdings"]
        row["mix"] = details["mix"]

    return row


def build_snapshot():
    frames = _history_map()
    equities = []
    etfs = []

    for symbol in CANADIAN_EQUITIES:
        row = _row(symbol, _series_for(frames, symbol), is_etf=False)
        if row:
            equities.append(row)

    for symbol in CANADIAN_ETFS:
        row = _row(symbol, _series_for(frames, symbol), is_etf=True)
        if row:
            etfs.append(row)

    snapshot = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "Yahoo Finance via yfinance",
        "currency": "CAD",
        "note": "Research only. Alpaca paper accounts cannot trade TSX or TSXV listings.",
        "equities": equities,
        "etfs": etfs,
    }
    return snapshot


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
