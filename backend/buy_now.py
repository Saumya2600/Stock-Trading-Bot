"""
buy_now.py — Standalone direct Alpaca buyer. No Lumibot.
Reads reports.json, buys stocks with ai_grade >= 70 using Alpaca paper REST API.
"""
import json, os, sys, requests
from datetime import datetime

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Try config first, fall back to raw env vars
try:
    from config import ALPACA_API_KEY, ALPACA_SECRET_KEY
except Exception:
    ALPACA_API_KEY = None
    ALPACA_SECRET_KEY = None

# Raw env var fallback (for running without .env)
if not ALPACA_API_KEY:
    ALPACA_API_KEY = os.getenv("VITE_ALPACA_API_KEY") or os.getenv("ALPACA_API_KEY")
if not ALPACA_SECRET_KEY:
    ALPACA_SECRET_KEY = os.getenv("VITE_ALPACA_SECRET_KEY") or os.getenv("ALPACA_SECRET_KEY")

BASE = "https://paper-api.alpaca.markets"
DATA_BASE = "https://data.alpaca.markets"
HEADERS = {
    "Apca-Api-Key-Id": ALPACA_API_KEY or "",
    "Apca-Api-Secret-Key": ALPACA_SECRET_KEY or "",
    "Content-Type": "application/json"
}
MIN_GRADE = 70          # only buy confidence >= 70
RISK_PER_TRADE = 0.05   # 5% of cash per trade max

# Validate keys early
if not ALPACA_API_KEY or not ALPACA_SECRET_KEY:
    print("ERROR: ALPACA keys not found.")
    print("  Set VITE_ALPACA_API_KEY and VITE_ALPACA_SECRET_KEY as environment variables")
    print("  or create backend/.env with those keys.")
    sys.exit(1)

print(f"[AUTH] Using key: {ALPACA_API_KEY[:8]}...")

def get_account():
    r = requests.get(f"{BASE}/v2/account", headers=HEADERS, timeout=10)
    r.raise_for_status()
    return r.json()

def get_last_price(symbol):
    r = requests.get(
        f"{DATA_BASE}/v2/stocks/{symbol}/trades/latest",
        headers=HEADERS, timeout=10
    )
    if r.status_code == 200:
        return float(r.json().get("trade", {}).get("p", 0))
    # fallback: snapshot
    r2 = requests.get(
        f"{DATA_BASE}/v2/stocks/snapshots?symbols={symbol}",
        headers=HEADERS, timeout=10
    )
    if r2.status_code == 200:
        snap = r2.json().get(symbol, {})
        return float(snap.get("latestTrade", {}).get("p", 0) or
                     snap.get("dailyBar", {}).get("c", 0))
    return 0.0

def get_positions():
    r = requests.get(f"{BASE}/v2/positions", headers=HEADERS, timeout=10)
    r.raise_for_status()
    return {p["symbol"]: p for p in r.json()}

def is_market_open():
    try:
        r = requests.get(f"{BASE}/v2/clock", headers=HEADERS, timeout=10)
        if r.status_code == 200 and r.text.strip():
            return r.json().get("is_open", False)
        print(f"[CLOCK] HTTP {r.status_code}: {r.text[:200]}")
    except Exception as e:
        print(f"[CLOCK ERROR] {e}")
    return False  # assume closed if can't determine

def place_market_buy(symbol, qty):
    order = {
        "symbol": symbol,
        "qty": str(qty),
        "side": "buy",
        "type": "market",
        "time_in_force": "day"
    }
    r = requests.post(f"{BASE}/v2/orders", headers=HEADERS, json=order, timeout=10)
    return r.status_code, r.json()

def load_reports():
    path = os.path.join(os.path.dirname(__file__), "reports.json")
    with open(path) as f:
        return json.load(f)

def main():
    print(f"\n{'='*60}")
    print(f"BUY_NOW.PY — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}")

    # Market check
    if not is_market_open():
        print("Market is CLOSED. Orders will be queued as day orders (fill at open).")

    # Account info
    acct = get_account()
    cash = float(acct["cash"])
    buying_power = float(acct["buying_power"])
    print(f"\nCash: ${cash:,.2f} | Buying Power: ${buying_power:,.2f}")

    if cash <= 0:
        print("ERROR: No cash available. Exiting.")
        sys.exit(1)

    # Current positions (skip re-buying held stocks)
    positions = get_positions()
    print(f"Current positions: {list(positions.keys()) or 'none'}")

    # Load research reports
    reports = load_reports()
    candidates = []
    for symbol, report in reports.items():
        if symbol.startswith("_"):
            continue
        grade = int(report.get("ai_grade", report.get("grade", 0)))
        if grade >= MIN_GRADE:
            candidates.append((symbol, grade, report))

    candidates.sort(key=lambda x: x[1], reverse=True)  # highest grade first
    print(f"\nCandidates (grade>={MIN_GRADE}): {[(s, g) for s,g,_ in candidates]}")

    if not candidates:
        print(f"ERROR: No stocks with grade >= {MIN_GRADE}. Exiting.")
        sys.exit(0)

    # Buy loop
    remaining_cash = cash
    bought = []
    skipped = []

    for symbol, grade, report in candidates:
        if symbol in positions:
            print(f"SKIP {symbol}: already holding position")
            skipped.append((symbol, "already_held"))
            continue

        current_price = get_last_price(symbol)
        if current_price <= 0:
            print(f"SKIP {symbol}: can't fetch price")
            skipped.append((symbol, "no_price"))
            continue

        research_price = float(report.get("price", current_price))
        pump_pct = (current_price - research_price) / research_price * 100 if research_price > 0 else 0
        if pump_pct > 10:
            print(f"SKIP {symbol}: price pumped {pump_pct:.1f}% since research (${research_price:.2f} -> ${current_price:.2f})")
            skipped.append((symbol, f"pumped_{pump_pct:.1f}%"))
            continue

        max_spend = min(remaining_cash * RISK_PER_TRADE, remaining_cash * 0.95)
        qty = int(max_spend / current_price)
        if qty == 0 and remaining_cash >= current_price:
            qty = 1  # buy at least 1 share if affordable

        if qty <= 0:
            print(f"SKIP {symbol}: insufficient cash (need ${current_price:.2f}, have ${remaining_cash:.2f})")
            skipped.append((symbol, "insufficient_cash"))
            continue

        cost = qty * current_price
        print(f"\nBUYING {symbol} x{qty} @ ~${current_price:.2f} = ${cost:.2f} (Grade {grade})")
        status, resp = place_market_buy(symbol, qty)

        if status in (200, 201):
            order_id = resp.get("id", "?")
            print(f"   Order submitted — ID: {order_id}")
            bought.append((symbol, qty, current_price, grade))
            remaining_cash -= cost
        else:
            err = resp.get("message", str(resp))
            print(f"   Order FAILED ({status}): {err}")
            skipped.append((symbol, f"order_failed: {err}"))

    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY")
    print(f"  Bought : {len(bought)} -- {[(s, q) for s,q,p,g in bought]}")
    print(f"  Skipped: {len(skipped)} -- {skipped}")
    print(f"  Cash remaining est: ${remaining_cash:,.2f}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    main()
