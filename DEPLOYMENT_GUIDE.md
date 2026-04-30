# 🚀 DEPLOYMENT GUIDE - Stock Suggester Bot

## 📋 Overview
Your trading bot can be deployed to various platforms. Since the bot needs **continuous execution** (trading during market hours), here are your options:

---

## 🔴 NOT RECOMMENDED: Vercel
**Why:** Vercel is for serverless functions (max 60s runtime). Your bot needs continuous process ❌
- Research cycle runs indefinitely
- Trading execution needs real-time polling
- Would need Cron triggers (limited to 5-minute intervals) ❌

---

## ✅ RECOMMENDED PLATFORMS

### **Option 1: Railway.app** (⭐ BEST FOR THIS)
- **Free/Paid:** $5-10/month
- **Perfect for:** Long-running Python processes
- **Setup:** 10 minutes

#### Steps:
1. Push your repo to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New → From GitHub repo"
4. Select your stock-suggester repo
5. Add environment variables in Railway dashboard:
   ```
   VITE_ALPACA_API_KEY=...
   VITE_ALPACA_SECRET_KEY=...
   GOOGLE_API_KEY=...
   GOOGLE_API_KEY_FALLBACK=...
   fmp=...
   ```
6. Create `Procfile` in root:
   ```
   worker: cd backend && python bot.py
   ```
7. Deploy! ✅

---

### **Option 2: Render.com**
- **Free/Paid:** Free tier available, $7+/month paid
- **Perfect for:** Reliable, simple deployment

#### Steps:
1. Go to [render.com](https://render.com)
2. "Create New" → "Web Service"
3. Connect GitHub repo
4. Configure:
   - **Runtime:** Python 3.9+
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `cd backend && python bot.py`
5. Add env vars in dashboard
6. Deploy ✅

---

### **Option 3: Replit** 
- **Free/Paid:** Free with 1GB RAM, $7/month for better specs
- **Perfect for:** Development & testing

#### Steps:
1. Create new Replit from GitHub
2. Add secrets in Tools → Secrets
3. Create `run.sh`:
   ```bash
   #!/bin/bash
   cd backend && python bot.py
   ```
4. Click "Run" ✅

---

### **Option 4: AWS/Google Cloud** (Advanced)
- Heroku is being discontinued
- Use EC2 (AWS) or GCE (Google Cloud) for full control
- More expensive but most reliable ($5-20/month)

---

## 🔑 Environment Variables Setup

Add these to your deployment platform:

```
VITE_ALPACA_API_KEY=your_key
VITE_ALPACA_SECRET_KEY=your_secret
GOOGLE_API_KEY=your_primary_gemini_key
GOOGLE_API_KEY_FALLBACK=your_fallback_gemini_key
fmp=your_fmp_key
```

---

## 📅 NEW FEATURE: Daily Research Scheduling

Your bot now:
1. **Only research once per day** (prevents API quota waste)
2. **Research window: 21:00-23:00 UTC** (9 PM - 11 PM)
3. **Auto-fallback:** If primary Gemini key hits quota, switches to `GOOGLE_API_KEY_FALLBACK`
4. **Trading continues:** Executes buy/sell signals all day with pre-researched data

### Adjust Research Window:
Edit `bot.py` line ~50-55:
```python
def is_research_window():
    now = datetime.now()
    
    # Change these hours to your preference (24-hour format, UTC)
    research_hour_start = 21  # 9 PM
    research_hour_end = 23    # 11 PM
    
    is_in_window = research_hour_start <= now.hour < research_hour_end
    return is_in_window
```

---

## 📊 FMP API Usage - Stock Fundamentals Research

**Where:** `fetch_fmp_data()` function in bot.py

**What it fetches:**
- Company sector & industry
- P/E Ratio (Price-to-Earnings)
- PEG Ratio (Growth-adjusted P/E)
- Debt-to-Equity ratio
- Business description

**Caching:** 48 hours (prevents wasting API credits)

**Perfect for:** Combining with Gemini AI for deeper analysis
- Gemini handles sentiment & catalyst analysis
- FMP handles valuation metrics
- Together = institutional-grade research ✅

---

## 🏠 Local Deployment

To run locally during market hours:

```bash
# Terminal 1: Start Backend
cd backend
python bot.py

# Terminal 2: Start Frontend
npm run dev
```

Visit: http://localhost:5174

---

## 🔄 Monitoring Your Bot

Once deployed:

1. **Check Research Status:**
   ```bash
   curl https://your-deployment-url/research
   ```

2. **Check Trading Performance:**
   ```bash
   curl https://your-deployment-url/performance
   ```

3. **Check Current Positions:**
   ```bash
   curl https://your-deployment-url/positions
   ```

---

## ⚠️ Important Considerations

1. **Time Zone:** Research window is UTC. Adjust for your timezone!
2. **Market Hours:** Bot trades during market hours (9:30 AM - 4:00 PM ET)
3. **Paper Trading:** Currently uses Alpaca PAPER mode (simulated, no real money)
4. **Logs:** Check deployment logs for research/trading activity
5. **API Costs:**
   - Gemini: Free tier ~10k requests/day ✅
   - FMP: Free tier 250 requests/day ✅
   - Alpaca: Free (paper trading) ✅

---

## 🆘 Troubleshooting

### Bot not researching?
- Check time is within research window (21:00-23:00 UTC)
- Check `LAST_GEMINI_RESEARCH` hasn't been researched today
- Verify Gemini API keys are valid

### Quota errors?
- Bot auto-switches to `GOOGLE_API_KEY_FALLBACK`
- Check logs for "Switching to fallback key"
- Add more keys if needed (separate by commas in env)

### Portfolio not updating?
- Ensure `/positions` endpoint is responding
- Check trading execution logs
- Verify Alpaca connection

---

## 🎯 Next Steps

1. Choose deployment platform (Railway recommended ⭐)
2. Push code to GitHub
3. Set up environment variables
4. Monitor initial research cycle
5. Adjust research window if needed
6. Let bot run during market hours!

Happy trading! 🚀📈
