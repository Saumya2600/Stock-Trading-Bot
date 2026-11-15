# Sam’s Lab · Trading Intelligence

An autonomous deep-research stock bot running against an Alpaca **paper** account, with a
React dashboard that surfaces its reasoning, picks and portfolio state.

The bot scans the market for momentum and low-float candidates, reads filings and social
chatter, scores every name with Gemini, and only trades what clears its own grade
threshold. Every decision, including the ones it rejects, ends up on the dashboard.

```
                   GitHub Actions (cron)                Render (always on)
        ┌───────────────────────────────┐      ┌──────────────────────────────┐
        │  research_bot   trade_bot     │      │  backend/main.py             │
        │  reset_paper_account          │      │  FastAPI + Lumibot + Alpaca  │
        └───────────────┬───────────────┘      └──────────────┬───────────────┘
                        │ writes + commits                    │ serves /reports, /app_state,
                        ▼                                     ▼ /longterm_picks, /overnight
                 *.json in repo root  ────────────►  Vercel (React + Vite dashboard)
                 (static fallback data)                frontend/
```

## Repository layout

| Path | What lives there |
| --- | --- |
| `backend/` | FastAPI server, Lumibot strategy, research engine, state and schedulers |
| `frontend/` | React + Vite dashboard (GSAP motion layer, Supabase auth) |
| `docs/` | Deployment guides (`DEPLOYMENT_GUIDE.md`, `DEPLOY_ORACLE_FREE.md`) |
| `tools/` | Standalone diagnostic scripts, run by hand, never by the app |
| `.github/workflows/` | The three scheduled jobs that drive the bot |
| `*.json` (repo root) | **Committed runtime state** — see the data flow below |
| `render.yaml` / `vercel.json` | Hosting configuration for each half |

## Trading guardrails

The runtime is deliberately conservative about *when* and *how much* it buys:

- **One executor.** `TRADING_ENGINE` decides who may submit orders. `actions` (default)
  leaves the GitHub workflow as the only trader — it also commits state, so its fills are
  the ones the dashboard can see. Set `TRADING_ENGINE=render` to hand execution to the
  Render process instead. Two engines both seeing "no position yet" at 9:35 can double-buy.
- **Real market calendar.** `utils.us_market_holidays` covers the ten NYSE closures
  (including Good Friday and Juneteenth) with observed-date shifting, and
  `us_market_early_closes` handles the 13:00 early closes. Weekends alone are not enough.
- **Position cap.** `MAX_OPEN_POSITIONS = 5` in `strategy.py`; beyond that, new signals are
  logged and skipped rather than liquidating the account.
- **Exit coverage.** Research rewrites the report set every cycle, so every held position is
  swept for its stop even if it is no longer in today's reports. A stop from the report is
  used when present; otherwise 7% under the fill price.
- **Stable benchmark.** `bot_start_value` and `spy_start_price` are only seeded when absent,
  so alpha is measured since inception rather than since the last restart.

The JSON files at the repo root are written by the backend and re-committed by CI. They are
the reason the dashboard has data to show when the Render service is asleep, so they are
deliberately tracked — do not add them to `.gitignore`.

## How data reaches the dashboard

1. A GitHub Actions job runs `backend/run_research.py` or `backend/run_trades.py`.
2. The script writes `reports.json`, `app_state.json`, `longterm_picks.json` and
   `overnight_analysis.json` in the repo root (and mirrors them into `frontend/public/`).
3. The job commits and pushes those files.
4. The dashboard fetches live endpoints from Render when `VITE_API_BASE_URL` is set
   (`/reports.json`, `/app_state.json`, `/longterm_picks`, `/trade_history`), and falls back
   to the committed static JSON when it is not, so a cold backend never leaves the page
   empty.

## Scheduled jobs

| Workflow | Schedule (UTC) | Purpose |
| --- | --- | --- |
| `research_bot.yml` | 12:30 and 20:00, Mon–Fri | Full research cycle: candidates → filings → grading → picks |
| `trade_bot.yml` | every 5 min, 13:00–21:00, Mon–Fri | Executes qualifying signals on the paper account |
| `reset_paper_account.yml` | manual | Closes every position and resets tracked metrics |

## Local setup

### Backend

```bash
pip install -r requirements.txt      # root file — this is what CI installs
# create .env with the variables below
python backend/main.py               # serves on :8001
```

Environment: `VITE_ALPACA_API_KEY`, `VITE_ALPACA_SECRET_KEY`, `GOOGLE_API_KEY`,
`GOOGLE_API_KEY_FALLBACK`, `fmp`, `FINNHUB_KEY`, `SEC_USER_AGENT`, `RESEARCH_TRIGGER_TOKEN`.
The `VITE_` prefix on the Alpaca pair is historical — the backend reads the same names.

### Frontend

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173
npm run build                        # production bundle
npm run lint
```

Environment: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (auth and picks persistence),
`VITE_API_BASE_URL` (Render backend; omit to run purely off the committed JSON).

## Frontend notes

- Motion is handled by GSAP (`frontend/src/lib/gsapSetup.js`, `components/motion/`). Every
  animation is gated behind `prefers-reduced-motion`, and the page root never animates from
  zero opacity, so a throttled tab can never render a blank screen.
- To exercise the full animation path on a machine where reduced motion is enabled, append
  `?motion=full` to any URL; `?motion=reduce` forces the calm path.
- The picks table, sidebar and modal are keyboard operable; the modal traps focus and
  restores it on close.

## Tools

`tools/` holds one-off diagnostics that were previously scattered in the repo root:

```bash
python tools/test_market.py          # is the market open right now
python tools/check_alpaca.py         # Alpaca credentials and account value
python tools/debug_trades.py         # dry inspection of the trade runner's inputs
python tools/test.py                 # scratch script for the research pipeline
```

Run them from the repository root — they resolve `backend/`, `.env` and the JSON state
relative to it.
