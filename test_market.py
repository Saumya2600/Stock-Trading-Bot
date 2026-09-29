import sys
sys.path.append('backend')
from utils import is_market_open
from datetime import datetime
import pytz

eastern = pytz.timezone('US/Eastern')
now_et = datetime.now(tz=pytz.utc).astimezone(eastern)
print(f'Current time ET: {now_et.strftime("%H:%M:%S %Z")}')
print(f'Is market open? {is_market_open()}')
print(f'Weekday: {now_et.strftime("%A")}')
