import os
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(env_path)
ALPACA_API_KEY = os.getenv('VITE_ALPACA_API_KEY')
ALPACA_SECRET_KEY = os.getenv('VITE_ALPACA_SECRET_KEY')
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
GOOGLE_API_KEY_FALLBACK = os.getenv('GOOGLE_API_KEY_FALLBACK')
FMP_API_KEY = os.getenv('fmp')
FINNHUB_KEY = os.getenv('FINNHUB_KEY')
ALPACA_CREDS = {
    'API_KEY': ALPACA_API_KEY,
    'API_SECRET': ALPACA_SECRET_KEY,
    'PAPER': True,
}
GEMINI_API_KEYS = [k for k in [GOOGLE_API_KEY, GOOGLE_API_KEY_FALLBACK] if k]
