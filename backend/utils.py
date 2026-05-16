import sys
import pytz
from datetime import datetime, timedelta

def safe_print(s: str):
    try:
        sys.stdout.write(s + "\n")
        sys.stdout.flush()
    except Exception:
        enc = sys.stdout.encoding or 'utf-8'
        try:
            out = s.encode(enc, errors='replace').decode(enc)
            sys.stdout.write(out + "\n")
            sys.stdout.flush()
        except Exception:
            sys.stdout.write(s.encode('utf-8', errors='replace').decode('utf-8') + "\n")
            sys.stdout.flush()

import pandas as pd

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

def simple_macd(series, fast=12, slow=26, signal=9):
    ema_fast = series.ewm(span=fast, adjust=False).mean()
    ema_slow = series.ewm(span=slow, adjust=False).mean()
    macd = ema_fast - ema_slow
    macd_signal = macd.ewm(span=signal, adjust=False).mean()
    macd_hist = macd - macd_signal
    return macd, macd_signal, macd_hist

def simple_atr(high, low, close, length=14):
    tr1 = high - low
    tr2 = (high - close.shift()).abs()
    tr3 = (low - close.shift()).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    atr = tr.rolling(length).mean()
    return atr

def simple_bollinger_bands(series, length=20, std=2):
    sma = series.rolling(length).mean()
    rolling_std = series.rolling(length).std()
    upper = sma + (rolling_std * std)
    lower = sma - (rolling_std * std)
    return upper, sma, lower

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

def is_research_window(now=None):
    """Allow research to run 1 hour before market open until close."""
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)
    if now.weekday() >= 5:
        return False
    # Start research at 8:30 AM ET
    research_start = now.replace(hour=8, minute=30, second=0, microsecond=0)
    market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return research_start <= now < market_close

