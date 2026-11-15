import os, requests
from dotenv import load_dotenv
load_dotenv('.env')
API_KEY = os.getenv('VITE_ALPACA_API_KEY')
API_SECRET = os.getenv('VITE_ALPACA_SECRET_KEY')
BASE_URL = 'https://paper-api.alpaca.markets/v2'
headers = {'APCA-API-KEY-ID': API_KEY, 'APCA-API-SECRET-KEY': API_SECRET}
r = requests.get(f'{BASE_URL}/account', headers=headers)
if r.status_code == 200:
    data = r.json()
    print(f"CONNECTED!")
    print(f"Cash: ${data.get('cash')}")
    print(f"Buying Power: ${data.get('buying_power')}")
    print(f"Portfolio Value: ${data.get('portfolio_value')}")
else:
    print(f"FAILED: {r.status_code} {r.text}")
