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

## Canadian coverage

`backend/canada.py` builds `canada.json` from free Yahoo Finance data — TSX equities, TSX/TSXV
ETFs, NAV, premium/discount to NAV, distribution yield, top holdings and asset mix. It runs in
the research workflow and makes **no model calls**, so Canadian research costs nothing against
the Gemini quota.

Canadian listings are research-only by construction: the Alpaca paper account settles US
listings, so the Canada page labels every row *View only* and the trader never sees those
symbols. For tradable exposure, use the US cross-listing (`SHOP`, `RY`, `TD`, `CNQ`, `ENB`,
`CP`).

The JSON files at the repo root are written by the backend and re-committed by CI. They are
the reason the dashboard has data to show when the Render service is asleep, so they are
deliberately tracked — do not add them to `.gitignore`.

## How data reaches the dashboard

1. A GitHub Actions job runs `backend/run_research.py` or `backend/run_trades.py`.
2. The script writes `reports.json`, `app_state.json`, `longterm_picks.json`,
   `overnight_analysis.json` and `canada.json` in the repo root (and mirrors them into
   `frontend/public/`).
3. The job commits and pushes those files.
4. The dashboard fetches live endpoints from Render when `VITE_API_BASE_URL` is set
   (`/reports.json`, `/app_state.json`, `/longterm_picks`, `/trade_history`), and falls back
   to the committed static JSON when it is not, so a cold backend never leaves the page
   empty.

## Scheduled jobs

| Workflow | Schedule (UTC) | Purpose |
| --- | --- | --- |
| `research_bot.yml` | 13:00 and 21:15 UTC, Mon–Fri | Full research cycle: candidates → filings → grading → picks |
| `trade_bot.yml` | every 5 min, 13:00–21:00, Mon–Fri | Executes qualifying signals on the paper account |
| `reset_paper_account.yml` | manual | Closes every position and resets tracked metrics |

### External trigger (cron-job.org)

GitHub's scheduler is unreliable: the same workflows have landed three to seven
hours after their slot, and on 2026-11-16 they stopped firing entirely while
Actions reported `degraded_performance`. cron-job.org dispatches the same
workflows instead, so the run still commits state — unlike triggering Render,
whose disk is ephemeral.

One-time setup: create a **fine-grained personal access token** scoped to this
repository with the single permission **Actions: Read and write**. Paste it into
cron-job.org, never into this repo.

Both jobs are `POST`, no body type needed beyond JSON:

| Job | URL | Body |
| --- | --- | --- |
| Pre-market research | `https://api.github.com/repos/Saumya2600/Stock-Trading-Bot/actions/workflows/research_bot.yml/dispatches` | `{"ref":"main"}` |
| Paper execution | `https://api.github.com/repos/Saumya2600/Stock-Trading-Bot/actions/workflows/trade_bot.yml/dispatches` | `{"ref":"main"}` |

Headers on both:

```
Authorization: Bearer <fine-grained PAT>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
Content-Type: application/json
```

Success is **204 No Content** — cron-job.org shows it as an empty 204, not 200.

Schedules (set the account timezone to `America/Halifax`):

- research: `08:30` and `17:30`, Monday–Friday
- trades: every 15 minutes, `09:30`–`16:00`, Monday–Friday

Replace the old `stock-trading-bot-bo95.onrender.com/scheduled/trigger_research`
job rather than adding a second one. Both paths spend the same Gemini quota, and
`run_research.py` only skips a duplicate within three hours — two sources firing
the 8:30 slot at once would still grade the day twice.

Verify a dispatch worked:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H "Authorization: Bearer $PAT" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Saumya2600/Stock-Trading-Bot/actions/workflows/trade_bot.yml/dispatches \
  -d '{"ref":"main"}'   # expect 204
```

Extra trade cycles are safe: Alpaca positions are the source of truth and
`MAX_OPEN_POSITIONS` caps exposure, so a duplicate cycle finds the position
already open instead of doubling it.

## Local setup

### Backend

```bash
pip install -r backend/requirements.txt   # what the workflows install
# create .env with the variables below
python backend/main.py               # serves on :8001
```

Environment: `VITE_ALPACA_API_KEY`, `VITE_ALPACA_SECRET_KEY`, `GOOGLE_API_KEY`,
`GOOGLE_API_KEY_FALLBACK`, `fmp`, `FINNHUB_KEY`, `SEC_USER_AGENT`, `RESEARCH_TRIGGER_TOKEN`.
The `VITE_` prefix on the Alpaca pair is historical — the backend reads the same names.

Two switches decide who does the work, so neither job runs twice:

| Variable | Default | Meaning |
| --- | --- | --- |
| `TRADING_ENGINE` | `actions` | `render` moves order execution into this process |
| `RESEARCH_SCHEDULER` | `on` | `off` disables the in-process 8:30/16:00 scheduler (Render sets `off`) |
| `DATA_SOURCE_URL` | this repo's `raw.githubusercontent.com` root | where `/reports.json` and `/app_state.json` read committed state from |

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
