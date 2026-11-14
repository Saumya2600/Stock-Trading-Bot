import os
import sys
import time

import requests

from utils import safe_print


POLL_INTERVAL_SECONDS = 15
MAX_WAIT_SECONDS = 15 * 60


def main():
    base_url = os.getenv("RESEARCH_WEB_URL", "").rstrip("/")
    if not base_url:
        safe_print("[RENDER CRON ERROR] RESEARCH_WEB_URL is not configured.")
        return 1

    status_url = f"{base_url}/research_status"
    trigger_url = f"{base_url}/trigger_research?reason=render_premarket"

    try:
        before = requests.get(status_url, timeout=30)
        before.raise_for_status()
        previous_last_run = before.json().get("last_run")

        trigger = requests.post(trigger_url, timeout=30)
        trigger.raise_for_status()
        safe_print("[RENDER CRON] Pre-market research triggered.")
    except (requests.RequestException, ValueError) as error:
        safe_print(f"[RENDER CRON ERROR] Could not trigger research: {error}")
        return 1

    deadline = time.monotonic() + MAX_WAIT_SECONDS
    while time.monotonic() < deadline:
        try:
            response = requests.get(status_url, timeout=30)
            response.raise_for_status()
            last_run = response.json().get("last_run")
            if last_run and last_run != previous_last_run:
                safe_print(f"[RENDER CRON] Pre-market research completed: {last_run}")
                return 0
        except (requests.RequestException, ValueError) as error:
            safe_print(f"[RENDER CRON] Status check failed; retrying: {error}")
        time.sleep(POLL_INTERVAL_SECONDS)

    safe_print("[RENDER CRON ERROR] Research did not publish a new run within 15 minutes.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
