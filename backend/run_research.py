import os
import sys
from datetime import datetime

# Add current directory to path so we can import modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from research import run_research_cycle
from utils import safe_print

if __name__ == "__main__":
    safe_print(f"[{datetime.now()}] GITHUB ACTION: Starting manual research cycle...")
    try:
        # Force=True to bypass market open check if needed (Action handles timing)
        run_research_cycle(force=True, manual_reason="github_action")
        safe_print(f"[{datetime.now()}] GITHUB ACTION: Research cycle completed successfully.")
    except Exception as e:
        safe_print(f"[{datetime.now()}] GITHUB ACTION ERROR: {e}")
        sys.exit(1)
