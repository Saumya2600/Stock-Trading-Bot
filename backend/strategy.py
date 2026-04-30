from datetime import datetime
import time
from lumibot.strategies.strategy import Strategy
from utils import safe_print, is_market_open, seconds_until_market_open
import state

class DeepResearchBot(Strategy):
    def initialize(self):
        self.sleeptime = "3M"
        self.fast_period = 9
        self.slow_period = 21
        self.symbols = []
        self.benchmark_initialized = False

    def on_filled_order(self, position, order, price, quantity, multiplier):
        symbol = order.asset.symbol
        side = "BUY" if order.side == "buy" else "SELL"
        report = state.research_reports.get(symbol, {})
        signal_data = state.latest_signals.get(symbol, {})
        stop_loss = float(report.get("stop_loss", 0.0))
        state.trade_history.append({
            "timestamp": datetime.now().isoformat(),
            "symbol": symbol,
            "side": side,
            "quantity": float(quantity),
            "price": float(round(price, 2)),
            "ai_grade": int(report.get("ai_grade", 50)),
            "signal": str(signal_data.get("signal", "Hold")),
            "stop_loss": stop_loss
        })
        state.portfolio_performance["trades_count"] += 1
        state.save_app_state()

    def on_trading_iteration(self):
        if not is_market_open():
            safe_print("[BOT] Market closed. Sleeping until open.")
            sleep_sec = max(60, seconds_until_market_open())
            time.sleep(sleep_sec)
            return

        if not self.benchmark_initialized:
            try:
                state.portfolio_performance["bot_start_value"] = float(self.get_portfolio_value())
                state.portfolio_performance["spy_start_price"] = float(self.get_last_price("SPY"))
                self.benchmark_initialized = True
                self.log_message(f"[BENCHMARK INIT] Starting value: ${state.portfolio_performance['bot_start_value']:.2f} | SPY: ${state.portfolio_performance['spy_start_price']:.2f}")
            except Exception as e:
                self.log_message(f"[BENCHMARK ERROR] {e}")
                return

        if not state.research_reports:
            self.log_message("[WAITING] Research engine still scanning... will trade once reports arrive.")
            return

        current_value = self.get_portfolio_value()
        risk_per_trade = 0.05  # High risk: 5% of portfolio per trade
        traded_this_cycle = 0

        for symbol, report in list(state.research_reports.items()):
            if symbol.startswith("_"):
                continue
            try:
                ai_grade = report.get("ai_grade", 50)
                last_price = report.get("price", 0)
                stop_loss = report.get("stop_loss", last_price * 0.93)
                if last_price <= 0:
                    continue

                signal_data = state.latest_signals.get(symbol, {})
                fast_sma = signal_data.get("fast_sma", 0)
                slow_sma = signal_data.get("slow_sma", 0)
                golden_cross = fast_sma > slow_sma > 0

                max_risk = current_value * risk_per_trade
                risk_per_share = max(last_price - stop_loss, 0.01)
                quantity = int(max_risk / risk_per_share)

                existing_pos = self.get_position(symbol)
                if ai_grade >= 55:  # Aggressive: Buy anything with positive AI conviction
                    if not existing_pos and quantity > 0:
                        current_price = self.get_last_price(symbol)
                        if current_price > last_price * 1.02:
                            self.log_message(f"⏭️ SKIPPING {symbol}: Price pumped to ${current_price:.2f} (Research: ${last_price:.2f})")
                            for o in self.get_orders():
                                if o.asset.symbol == symbol and o.side == "buy":
                                    self.cancel_order(o)
                            continue

                        cash = self.get_cash()
                        cost = quantity * current_price
                        if cost > cash * 0.95:
                            quantity = int((cash * 0.95) / current_price)
                        
                        pending_match = False
                        for o in self.get_orders():
                            if o.asset.symbol == symbol and o.side == "buy":
                                pending_match = True
                                break
                                
                        if quantity > 0 and not pending_match:
                            self.log_message(f"🟢 BUY ORDER: {symbol} x{quantity} @ ~${current_price:.2f} (Grade {ai_grade})")
                            order = self.create_order(symbol, quantity, "buy")
                            self.submit_order(order)
                            traded_this_cycle += 1

                elif existing_pos:
                    current_price = self.get_last_price(symbol)
                    if ai_grade <= 40 or (fast_sma > 0 and slow_sma > 0 and fast_sma < slow_sma) or (current_price <= stop_loss):
                        pending_match = False
                        for o in self.get_orders():
                            if o.asset.symbol == symbol and o.side == "sell":
                                pending_match = True
                                break
                                
                        if not pending_match:
                            self.log_message(f"🔴 SELL ORDER: {symbol} — Exit (Grade {ai_grade})")
                            self.sell_all(symbol)
                            traded_this_cycle += 1

            except Exception as e:
                self.log_message(f"[TRADE ERROR] {symbol}: {e}")

        try:
            current_bot_val = self.get_portfolio_value()
            current_spy = self.get_last_price("SPY")
            bot_roi = ((current_bot_val - state.portfolio_performance["bot_start_value"]) / state.portfolio_performance["bot_start_value"]) * 100 if state.portfolio_performance["bot_start_value"] else 0.0
            spy_roi = ((current_spy - state.portfolio_performance["spy_start_price"]) / state.portfolio_performance["spy_start_price"]) * 100 if state.portfolio_performance["spy_start_price"] else 0.0
            state.portfolio_performance["bot_roi"] = float(bot_roi)
            state.portfolio_performance["spy_roi"] = float(spy_roi)
            self.log_message(f"[STATS] ALPHA PULSE | Bot: {bot_roi:+.2f}% | SPY: {spy_roi:+.2f}% | Alpha: {bot_roi - spy_roi:+.2f}% | Trades: {state.portfolio_performance['trades_count']}")
        except Exception as e:
            self.log_message(f"[ROI ERROR] {e}")
