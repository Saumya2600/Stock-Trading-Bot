import sys
import pytz
from datetime import date, datetime, timedelta

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

def get_ast_now():
    """Current time in Atlantic Standard / Daylight Time (America/Halifax)."""
    halifax = pytz.timezone("America/Halifax")
    return datetime.now(tz=pytz.utc).astimezone(halifax)

def _easter_sunday(year):
    """Anonymous Gregorian computus — needed for Good Friday."""
    a, b, c = year % 19, year // 100, year % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _nth_weekday(year, month, weekday, n):
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def _last_weekday(year, month, weekday):
    if month == 12:
        last = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last = date(year, month + 1, 1) - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def _observed(day, saturday_to_friday=True):
    """NYSE shift: Sunday holidays move to Monday, Saturday holidays to Friday."""
    if day.weekday() == 5:
        return day - timedelta(days=1) if saturday_to_friday else None
    if day.weekday() == 6:
        return day + timedelta(days=1)
    return day


_HOLIDAY_CACHE = {}
_EARLY_CLOSE_CACHE = {}


def us_market_holidays(year):
    """Full-day NYSE closures for a year."""
    if year in _HOLIDAY_CACHE:
        return _HOLIDAY_CACHE[year]

    days = {
        _nth_weekday(year, 1, 0, 3),    # Martin Luther King Jr. Day
        _nth_weekday(year, 2, 0, 3),    # Washington's Birthday
        _easter_sunday(year) - timedelta(days=2),  # Good Friday
        _last_weekday(year, 5, 0),      # Memorial Day
        _nth_weekday(year, 9, 0, 1),    # Labor Day
        _nth_weekday(year, 11, 3, 4),   # Thanksgiving
    }

    # New Year's Day: a Saturday closure is skipped, the market is open Friday.
    new_year = _observed(date(year, 1, 1), saturday_to_friday=False)
    if new_year and new_year.year == year:
        days.add(new_year)

    for fixed in (date(year, 7, 4), date(year, 12, 25)):
        observed = _observed(fixed)
        if observed:
            days.add(observed)

    if year >= 2022:
        juneteenth = _observed(date(year, 6, 19))
        if juneteenth:
            days.add(juneteenth)

    _HOLIDAY_CACHE[year] = days
    return days


def us_market_early_closes(year):
    """1:00 PM ET closes: day after Thanksgiving, Christmas Eve, July 3."""
    if year in _EARLY_CLOSE_CACHE:
        return _EARLY_CLOSE_CACHE[year]

    days = set()
    thanksgiving = _nth_weekday(year, 11, 3, 4)
    days.add(thanksgiving + timedelta(days=1))

    for eve in (date(year, 7, 3), date(year, 12, 24)):
        if eve.weekday() < 5 and eve not in us_market_holidays(year):
            days.add(eve)

    days -= us_market_holidays(year)
    _EARLY_CLOSE_CACHE[year] = days
    return days


def is_trading_day(day=None):
    """Weekday and not a full-day NYSE holiday."""
    day = day or get_ast_now().date()
    return day.weekday() < 5 and day not in us_market_holidays(day.year)


def is_market_open(now=None):
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)
    if not is_trading_day(now.date()):
        return False
    open_time = now.replace(hour=9, minute=30, second=0, microsecond=0)
    close_hour = 13 if now.date() in us_market_early_closes(now.year) else 16
    close_time = now.replace(hour=close_hour, minute=0, second=0, microsecond=0)
    return open_time <= now < close_time

def seconds_until_market_open(now=None):
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)

    for offset in range(0, 10):
        day = (now + timedelta(days=offset)).date()
        if not is_trading_day(day):
            continue

        close_hour = 13 if day in us_market_early_closes(day.year) else 16
        open_dt = eastern.localize(datetime(day.year, day.month, day.day, 9, 30))
        close_dt = eastern.localize(datetime(day.year, day.month, day.day, close_hour, 0))

        if now < open_dt:
            return int((open_dt - now).total_seconds())
        if now < close_dt:
            return 0

    # Ten days without a session should never happen; retry in an hour.
    return 3600

def is_research_window(now=None):
    """Allow research from 8:30 AM to 4:00 PM US/Eastern (9:30 AM to 5:00 PM AST/ADT)."""
    eastern = pytz.timezone("US/Eastern")
    now = now or datetime.now(tz=pytz.utc).astimezone(eastern)
    if not is_trading_day(now.date()):
        return False
    # 8:30 AM ET = 9:30 AM AST/ADT (1 hour pre-market)
    research_start = now.replace(hour=8, minute=30, second=0, microsecond=0)
    # 4:00 PM ET = 5:00 PM AST/ADT (Market close)
    market_close = now.replace(hour=16, minute=0, second=0, microsecond=0)
    return research_start <= now < market_close

