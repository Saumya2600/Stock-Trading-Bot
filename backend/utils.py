import sys
import pytz
from datetime import datetime, timedelta

def safe_print(s: str):
    try:
        sys.stdout.write(s + "\n")
    except Exception:
        enc = sys.stdout.encoding or 'utf-8'
        try:
            out = s.encode(enc, errors='replace').decode(enc)
            sys.stdout.write(out + "\n")
        except Exception:
            sys.stdout.write(s.encode('utf-8', errors='replace').decode('utf-8') + "\n")

def simple_sma(series, length):
    return series.rolling(length).mean()

def simple_rsi(series, length=14):
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.rolling(length, min_periods=length).mean()
    avg_loss = loss.rolling(length, min_periods=length).mean()
    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))

def is_market_open(now=None):
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)
    if now.weekday() >= 5:
        return False
    open_time = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_time = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return open_time <= now < close_time

def seconds_until_market_open(now=None):
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)
    if now.weekday() >= 5:
        days_ahead = 7 - now.weekday()
        next_open = (now + timedelta(days=days_ahead)).replace(hour=9, minute=30, second=0, microsecond=0)
    elif now.hour < 9 or (now.hour == 9 and now.minute < 30):
        next_open = now.replace(hour=9, minute=30, second=0, microsecond=0)
    elif now >= now.replace(hour=16, minute=0, second=0, microsecond=0):
        days_ahead = 1 if now.weekday() < 4 else 7 - now.weekday()
        next_open = (now + timedelta(days=days_ahead)).replace(hour=9, minute=30, second=0, microsecond=0)
    else:
        return 0
    return int((next_open - now).total_seconds())
