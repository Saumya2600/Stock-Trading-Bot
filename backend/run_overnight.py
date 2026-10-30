import state
from overnight_analysis import run_overnight_refresh


if __name__ == "__main__":
    state.load_overnight_analysis()
    run_overnight_refresh()
