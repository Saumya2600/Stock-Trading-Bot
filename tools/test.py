import sys
sys.stdout.reconfigure(encoding='utf-8')

import yfinance as yf
import pandas as pd
import time
from datetime import datetime, timedelta
import requests
import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai.types import Part

load_dotenv()

FMP_API_KEY = os.getenv("fmp")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_API_KEY_FALLBACK")

if not FMP_API_KEY:
    raise Exception("Missing FMP API key")
if not GEMINI_API_KEY:
    raise Exception("Missing Gemini API key")

gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# =========================
# FETCH FUNCTIONS
# =========================

def get_upcoming_earnings():
    try:
        today = datetime.now().date()
        to_date = today + timedelta(days=14)
        url = f"https://financialmodelingprep.com/stable/earnings-calendar?from={today}&to={to_date}&apikey={FMP_API_KEY}"

        resp = requests.get(url, timeout=10)
        resp.raise_for_status()

        data = resp.json()
        return [x['symbol'] for x in data[:30] if isinstance(x, dict) and x.get('symbol')]

    except Exception as e:
        print("Earnings error:", e)
        return []


def get_trending_stocks():
    try:
        url = f"https://financialmodelingprep.com/stable/most-actives?apikey={FMP_API_KEY}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()

        data = resp.json()
        return [x['symbol'] for x in data[:30] if isinstance(x, dict) and x.get('symbol')]

    except Exception as e:
        print("Trending error:", e)
        return []


# =========================
# NEWS (ROBUST + FALLBACK)
# =========================

def get_news():
    news_map = {}
    print("\n🔎 Fetching FMP news...")

    success = False

    try:
        for page in range(0, 3):
            url = f"https://financialmodelingprep.com/stable/news/stock-latest?page={page}&limit=100&apikey={FMP_API_KEY}"

            resp = requests.get(url, timeout=15)

            print(f"Page {page} → status: {resp.status_code}")

            if resp.status_code != 200:
                continue

            if not resp.text.strip():
                print("   ❌ Empty response")
                continue

            try:
                data = resp.json()
            except Exception as e:
                print("   ❌ JSON parse failed:", e)
                print("   RAW:", resp.text[:200])
                continue

            if not isinstance(data, list) or len(data) == 0:
                print("   ❌ No valid data")
                continue

            success = True

            for item in data:
                if isinstance(item, dict):
                    t = item.get("symbol")
                    if t:
                        news_map.setdefault(t, []).append({
                            "title": item.get("title", ""),
                            "text": item.get("text", ""),
                            "published": item.get("publishedDate", "")
                        })

        print(f"✅ FMP news loaded for {len(news_map)} stocks")

    except Exception as e:
        print("❌ FMP News error:", e)

    if not success or len(news_map) == 0:
        print("\n⚠️ FMP FAILED → Will use yfinance fallback\n")
        return None

    return news_map


def get_news_from_yfinance(ticker):
    try:
        stock = yf.Ticker(ticker)
        news = stock.news

        if not news:
            return []

        result = []
        for item in news[:5]:
            result.append({
                "title": item.get("title", ""),
                "text": item.get("summary", "") or item.get("title", "")
            })

        return result

    except Exception as e:
        print(f"   ⚠️ yfinance news failed for {ticker}: {e}")
        return []


# =========================
# GEMINI
# =========================

def get_gemini_news_insight(ticker, news_list):
    if not news_list:
        return 0.0, "no news", "No news available"

    news_text = "\n\n".join([
        f"{n['title']}\n{n['text'][:500]}"
        for n in news_list[:3]
    ])

    prompt = f"""
Analyze news for stock {ticker}.

Return JSON:
{{
 "sentiment": -1 to 1,
 "reason": "main reason",
 "summary": "1-line impact"
}}

News:
{news_text}
"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[Part.from_text(text=prompt)]
        )

        txt = response.text.strip()

        if txt.startswith("```"):
            txt = txt.split("```")[1]

        data = json.loads(txt)

        return (
            float(data.get("sentiment", 0)),
            data.get("reason", ""),
            data.get("summary", "")
        )

    except Exception as e:
        print(f"Gemini error {ticker}:", e)
        return 0.0, "fail", ""


# =========================
# ANALYSIS
# =========================

def analyze_ticker(ticker, news_map):
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period="3mo")

        if hist.empty or len(hist) < 20:
            return None

        price = hist["Close"].iloc[-1]
        momentum = ((price - hist["Close"].iloc[-20]) / hist["Close"].iloc[-20]) * 100

        # RSI
        delta = hist["Close"].diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = -delta.clip(upper=0).rolling(14).mean()
        rs = gain / loss
        rsi = (100 - (100 / (1 + rs))).iloc[-1]

        info = stock.info
        pe = info.get("trailingPE") or 0
        growth = info.get("earningsQuarterlyGrowth") or 0
        target = info.get("targetMeanPrice") or price
        upside = ((target - price) / price) * 100

        # NEWS LOGIC
        if news_map is None:
            news_list = get_news_from_yfinance(ticker)
        else:
            news_list = news_map.get(ticker, [])
            if not news_list:
                news_list = get_news_from_yfinance(ticker)

        print(f"   {ticker} → {len(news_list)} news")

        sentiment, reason, summary = get_gemini_news_insight(ticker, news_list)

        score = (
            0.30 * (upside / 100) +
            0.25 * max(growth, 0) +
            0.20 * (momentum / 100) +
            0.15 * sentiment +
            0.10 * ((50 - abs(rsi - 50)) / 50)
        )

        return {
            "ticker": ticker,
            "price": round(price, 2),
            "score": round(score, 3),
            "momentum_%": round(momentum, 2),
            "rsi": round(rsi, 1),
            "pe": round(pe, 2),
            "upside_%": round(upside, 2),
            "growth": growth,
            "news_sentiment": sentiment,
            "news_reason": reason,
            "news_summary": summary
        }

    except Exception as e:
        print(f"Error {ticker}:", e)
        return None


# =========================
# MAIN
# =========================

if __name__ == "__main__":
    print(f"\n🚀 Running @ {datetime.now()}\n")

    earnings = get_upcoming_earnings()
    trending = get_trending_stocks()
    news_map = get_news()

    candidates = list(set(earnings + trending))[:50]

    print(f"\nAnalyzing {len(candidates)} stocks...\n")

    results = []

    for i, t in enumerate(candidates, 1):
        print(f"{i}/{len(candidates)} → {t}")
        res = analyze_ticker(t, news_map)
        if res:
            results.append(res)
        time.sleep(0.6)

    if not results:
        print("No results ❌")
        sys.exit(1)

    df = pd.DataFrame(results).sort_values("score", ascending=False)

    print("\n=== TOP PICKS ===\n")
    print(df.head(10)[['ticker','score','upside_%','momentum_%','news_sentiment','news_reason']])

    file = f"stock_picks_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    df.to_csv(file, index=False)

    print(f"\n✅ Saved → {file}")