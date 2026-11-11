"""Reset Alpaca paper positions and local trading metrics.

This script is intentionally locked to Alpaca's paper-trading endpoint.
It refuses to run without an explicit confirmation string.
"""

import json
import os
import sys
import time
from pathlib import Path
from urllib.parse import quote

import requests


PAPER_API_BASE = "https://paper-api.alpaca.markets/v2"
CONFIRMATION = "RESET PAPER"
ROOT_DIR = Path(__file__).resolve().parents[1]
STATE_PATHS = (
    ROOT_DIR / "app_state.json",
    ROOT_DIR / "backend" / "app_state.json",
    ROOT_DIR / "frontend" / "public" / "app_state.json",
)


def _headers():
    api_key = os.getenv("VITE_ALPACA_API_KEY") or os.getenv("ALPACA_API_KEY")
    api_secret = os.getenv("VITE_ALPACA_SECRET_KEY") or os.getenv("ALPACA_SECRET_KEY")
    if not api_key or not api_secret:
        raise RuntimeError("Alpaca paper credentials missing")
    return {
        "Apca-Api-Key-Id": api_key,
        "Apca-Api-Secret-Key": api_secret,
    }


def _request(method, path, headers, **kwargs):
    response = requests.request(
        method,
        f"{PAPER_API_BASE}{path}",
        headers=headers,
        timeout=20,
        **kwargs,
    )
    response.raise_for_status()
    return response.json() if response.content else None


def _reset_state(portfolio_value):
    state = {
        "trade_history": [],
        "portfolio_performance": {
            "bot_roi": 0.0,
            "spy_roi": 0.0,
            "trades_count": 0,
            "bot_start_value": float(portfolio_value),
            "spy_start_price": 0.0,
        },
    }
    for path in STATE_PATHS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")


def main():
    if len(sys.argv) != 3 or sys.argv[1] != "--confirm" or sys.argv[2] != CONFIRMATION:
        raise SystemExit(
            'Refusing reset. Run with: python reset_paper_account.py --confirm "RESET PAPER"'
        )

    headers = _headers()
    account = _request("GET", "/account", headers)
    if str(account.get("status", "")).lower() != "active":
        raise RuntimeError(f"Paper account is not active: {account.get('status')}")

    positions = _request("GET", "/positions", headers) or []
    print(
        f"[PAPER RESET] endpoint={PAPER_API_BASE} "
        f"account={account.get('account_number')} positions={len(positions)}"
    )

    for position in positions:
        symbol = str(position.get("symbol", "")).strip()
        if not symbol:
            raise RuntimeError("Position response contained empty symbol")
        encoded_symbol = quote(symbol, safe="")
        _request("DELETE", f"/positions/{encoded_symbol}", headers)
        print(f"[PAPER RESET] close submitted: {symbol}")

    deadline = time.monotonic() + 30
    while True:
        remaining = _request("GET", "/positions", headers) or []
        if not remaining:
            break
        if time.monotonic() >= deadline:
            symbols = ", ".join(str(item.get("symbol")) for item in remaining)
            raise RuntimeError(f"Positions still open after close requests: {symbols}")
        time.sleep(2)

    _reset_state(account.get("portfolio_value", 0))
    print("[PAPER RESET] verified zero positions; local trade history reset")


if __name__ == "__main__":
    main()
