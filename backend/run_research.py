import os
import sys
from datetime import datetime

# Add current directory to path so we can import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import state
from research import run_research_cycle
from longterm import generate_longterm_picks
from utils import safe_print

MIN_GAP_SECONDS = 3 * 3600


def _flag(name):
    return (os.getenv(name) or "").strip().lower() in ("1", "true", "yes", "on")


def _ran_recently():
    """Minutes since the last completed cycle, or None when unknown."""
    last_run = state.research_reports.get("_last_run")
    if not last_run:
        return None
    try:
        age = (datetime.now() - datetime.fromisoformat(last_run)).total_seconds()
    except ValueError:
        return None
    return age


if __name__ == "__main__":
    safe_print(f"[{datetime.now()}] GITHUB ACTION: Starting manual research cycle...")

    # Two things can dispatch this workflow now: the GitHub cron and an external
    # scheduler. Without a guard both fire and the same day gets graded twice,
    # which is real money against a free Gemini quota. The two real slots are
    # eight hours apart, so a three-hour gap never blocks a legitimate run.
    force = _flag("RESEARCH_FORCE")
    age = _ran_recently()
    if not force and age is not None and age < MIN_GAP_SECONDS:
        safe_print(
            f"[{datetime.now()}] GITHUB ACTION: last cycle was {age / 60:.0f} min ago, "
            f"skipping (set the `force` input to override)."
        )
        sys.exit(0)

    try:
        # force=True to bypass the market-hours window; this runner is only ever
        # started for a slot that is already the right time of day.
        run_research_cycle(force=True, manual_reason="github_action")
        try:
            generate_longterm_picks()
            safe_print(f"[{datetime.now()}] GITHUB ACTION: Long-term picks refreshed.")
        except Exception as e:
            safe_print(f"[{datetime.now()}] GITHUB ACTION: Long-term refresh skipped: {e}")
        safe_print(f"[{datetime.now()}] GITHUB ACTION: Research cycle completed successfully.")
    except Exception as e:
        safe_print(f"[{datetime.now()}] GITHUB ACTION ERROR: {e}")
        sys.exit(1)
