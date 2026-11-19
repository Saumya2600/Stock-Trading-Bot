"""Intraday buy-zone watcher for the Canadian list — free data, no model calls.

The nightly snapshot decides where each buy zone sits. This script asks for the
current price during the Toronto session and answers one question per name:
is it inside its zone right now?

Output goes to ``zone_alerts.json`` (repo root and the dashboard's public dir)
so the page can show live quotes and the names currently in a zone. If a Gmail
app password is configured, newly entered names are also emailed once per day.

Environment (all optional):
    RESEND_API_KEY       Resend key; preferred channel, no SMTP involved
    ALERT_EMAIL_TO       destination address
    ALERT_EMAIL_FROM     sender; defaults to onboarding@resend.dev
    GMAIL_USER           fallback sender when no Resend key is set
    GMAIL_APP_PASSWORD   Gmail app password, never an account password
    WATCH_FORCE=1        run the zone check outside session hours
    WATCH_TEST=1         send one test email and exit, zones ignored
"""

import json
import os
import smtplib
import sys
from datetime import datetime, timezone
from email.mime.text import MIMEText

import pytz
import requests
import yfinance as yf

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SNAPSHOT_PATH = os.path.join(BASE_DIR, "canada.json")
STATE_PATH = os.path.join(BASE_DIR, "zone_alerts.json")
PUBLIC_PATH = os.path.join(BASE_DIR, "frontend", "public", "zone_alerts.json")

EASTERN = pytz.timezone("US/Eastern")


def _now_et():
    return datetime.now(tz=pytz.utc).astimezone(EASTERN)


def session_open(now=None):
    """Toronto Stock Exchange hours: 09:30-16:00 ET, weekdays."""
    now = now or _now_et()
    if now.weekday() >= 5:
        return False
    return (9, 30) <= (now.hour, now.minute) < (16, 0)


def _load_snapshot():
    with open(SNAPSHOT_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


def _rows(snapshot):
    for group in ("equities", "etfs"):
        for row in snapshot.get(group) or []:
            if row.get("levels"):
                yield row


def _last_quotes(symbols):
    """One batched intraday download: a request per symbol invites 429s."""
    if not symbols:
        return {}
    frame = yf.download(
        tickers=" ".join(symbols),
        period="1d",
        interval="15m",
        group_by="ticker",
        progress=False,
        threads=True,
        auto_adjust=True,
    )
    quotes = {}
    for symbol in symbols:
        try:
            series = frame[symbol]["Close"] if hasattr(frame.columns, "levels") else frame["Close"]
            series = series.dropna()
            if len(series):
                quotes[symbol] = {
                    "price": round(float(series.iloc[-1]), 2),
                    "as_of": str(series.index[-1]),
                }
        except Exception:
            continue
    return quotes


def _load_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle) or {}
    except Exception:
        return {}


def _email_via_resend(api_key, to_addr, sender, subject, body):
    response = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": sender,
            "to": [to_addr],
            "subject": subject,
            "text": body,
        },
        timeout=20,
    )
    if not response.ok:
        raise RuntimeError(f"Resend HTTP {response.status_code}: {response.text[:200]}")


def _email_via_gmail(to_addr, user, password, subject, body):
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = user
    message["To"] = to_addr
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as server:
        server.starttls()
        server.login(user, password)
        server.sendmail(user, [to_addr], message.as_string())


def send_alert(subject, body):
    """Resend when configured, otherwise Gmail SMTP. Returns a channel name."""
    to_addr = os.getenv("ALERT_EMAIL_TO")
    resend_key = os.getenv("RESEND_API_KEY")
    user = os.getenv("GMAIL_USER")
    password = os.getenv("GMAIL_APP_PASSWORD")

    if not to_addr:
        return None
    if resend_key:
        sender = os.getenv("ALERT_EMAIL_FROM") or "onboarding@resend.dev"
        _email_via_resend(resend_key, to_addr, sender, subject, body)
        return "resend"
    if user and password:
        _email_via_gmail(to_addr, user, password, subject, body)
        return "gmail"
    return None


def _sentence(row, price):
    levels = row["levels"]
    return (
        f"{row['ticker']} at ${price:.2f} is inside its "
        f"${levels['zone_low']:.2f}-${levels['zone_high']:.2f} buy zone "
        f"(stop ${levels['stop']:.2f}, first target ${levels['target_one']:.2f})."
    )


def build_state(snapshot, forced=False):
    now = _now_et()
    open_now = session_open(now)
    rows = list(_rows(snapshot))
    symbols = [row["symbol"] for row in rows]

    previous = _load_state()
    notified = previous.get("notified") or {}

    if not open_now and not forced:
        return {
            "checked_at": now.isoformat(),
            "session_open": False,
            "quotes": previous.get("quotes") or {},
            "entries": previous.get("entries") or [],
            "notified": notified,
            "note": "Session closed. Nothing was fetched; last quotes and alerts kept.",
        }

    quotes = _last_quotes(symbols)
    today = now.date().isoformat()
    entries = []
    fresh = []

    for row in rows:
        quote = quotes.get(row["symbol"])
        if not quote:
            continue
        price = quote["price"]
        levels = row["levels"]
        inside = levels["zone_low"] <= price <= levels["zone_high"]
        if not inside:
            continue
        entry = {
            "ticker": row["ticker"],
            "symbol": row["symbol"],
            "kind": "ETF" if row.get("holdings") else "Stock",
            "price": price,
            "zone_low": levels["zone_low"],
            "zone_high": levels["zone_high"],
            "stop": levels["stop"],
            "target_one": levels["target_one"],
            "as_of": quote["as_of"],
            "sentence": _sentence(row, price),
        }
        entries.append(entry)
        if notified.get(row["ticker"]) != today:
            fresh.append(entry)

    # Deliberately not recorded here: a run without email configured, or a
    # failed send, must not swallow the alert for the rest of the day.

    return {
        "checked_at": now.isoformat(),
        "session_open": open_now,
        "quotes": quotes,
        "entries": sorted(entries, key=lambda item: item["ticker"]),
        "notified": notified,
        "fresh": [entry["ticker"] for entry in fresh],
        "already_alerted": sorted(
            entry["ticker"] for entry in entries if notified.get(entry["ticker"]) == today
        ),
    }


def write_state(state):
    payload = json.dumps(state, indent=2)
    for path in (STATE_PATH, PUBLIC_PATH):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(payload)


def main():
    forced = os.getenv("WATCH_FORCE") == "1"
    snapshot = _load_snapshot()
    state = build_state(snapshot, forced=forced)
    write_state(state)

    print(
        f"[WATCH] checked {state['checked_at']} "
        f"session_open={state['session_open']} "
        f"quotes={len(state.get('quotes') or {})} "
        f"in_zone={len(state.get('entries') or [])}"
    )
    for entry in state.get("entries") or []:
        print(f"[WATCH] {entry['sentence']}")

    if os.getenv("WATCH_TEST") == "1":
        test_email = {
            "at": state["checked_at"],
            "tickers": [],
            "status": "test",
            "channel": None,
            "error": None,
        }
        try:
            test_email["channel"] = send_alert(
                "CAD Zone Watch test",
                "Test message from the buy-zone watcher. If this arrived, the email channel works.",
            )
        except Exception as error:
            test_email["status"] = "failed"
            test_email["error"] = str(error)[:400]
            print(f"[WATCH] test email failed: {error}")
        else:
            if test_email["channel"]:
                test_email["status"] = "test sent"
                print(f"[WATCH] test email sent via {test_email['channel']}")
            else:
                test_email["status"] = "no email credentials"
                print("[WATCH] test email skipped: no credentials")
        state["email"] = test_email
        write_state(state)
        return 0 if test_email["status"] == "test sent" else 1

    fresh = state.get("fresh") or []
    # Persisted in zone_alerts.json so the last attempt is readable without
    # the Actions log, which needs a token.
    email = {
        "at": state["checked_at"],
        "tickers": list(fresh),
        "status": "",
        "channel": None,
        "error": None,
    }

    def finish(status, code=0):
        email["status"] = status
        state["email"] = email
        write_state(state)
        return code

    if not state.get("session_open") and not forced:
        print("[WATCH] session closed; nothing to send")
        return finish("session closed")

    if not fresh:
        already = state.get("already_alerted") or []
        print(
            "[WATCH] nothing new to send "
            f"(in zone: {len(state.get('entries') or [])}, already alerted today: {', '.join(already) or 'none'})"
        )
        return finish("nothing new in zone")

    if not os.getenv("ALERT_EMAIL_TO"):
        print("[WATCH] no ALERT_EMAIL_TO set; alerts stay in zone_alerts.json and this log")
        return finish("ALERT_EMAIL_TO missing")

    nl = chr(10)
    lines_in_zone = [entry["sentence"] for entry in state["entries"] if entry["ticker"] in fresh]
    body = (
        "Canadian names inside their buy zone:"
        + nl * 2
        + nl.join(lines_in_zone)
        + nl * 2
        + "Zones are mechanical: 20-day average plus or minus ATR. "
        "Structure, not advice. One alert per name per day."
        + nl
    )
    try:
        channel = send_alert(f"CAD buy zone: {', '.join(fresh)}", body)
    except Exception as error:
        print(f"[WATCH] email failed: {error}")
        email["error"] = str(error)[:400]
        return finish("failed", 1)

    if not channel:
        print("[WATCH] email not configured (RESEND_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD)")
        return finish("no email credentials")

    # Only now is it true that these names were announced today.
    today = (state.get("checked_at") or "")[:10]
    notified = state.get("notified") or {}
    for ticker in fresh:
        notified[ticker] = today
    state["notified"] = notified
    email["channel"] = channel
    finish("sent")

    print(f"[WATCH] emailed {len(fresh)} new entries via {channel}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
