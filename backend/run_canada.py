"""Entry point for the Canadian snapshot, run by the research workflow."""

import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from canada import build_snapshot, write_snapshot
from utils import safe_print

if __name__ == "__main__":
    try:
        snapshot = build_snapshot()
        write_snapshot(snapshot)
        safe_print(
            f"[CANADA] {len(snapshot['equities'])} equities, "
            f"{len(snapshot['etfs'])} ETFs captured — no model calls, no tokens."
        )
    except Exception as error:
        # Canadian coverage is additive: never fail the US research run for it.
        safe_print(f"[CANADA] snapshot skipped: {error}")
