"""
Continuous trading rules runner.

Fetches Kraken OHLCV data on a configurable interval, runs TradingRules.analyze(),
and logs every decision with full context.

Usage:
    python -m backend.trading_rules            # defaults: BTCUSDT, $10 000 balance
    python -m backend.trading_rules --symbol ETHUSDT --balance 25000
"""

import argparse
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from .backend import TradingRules
from .data import fetch_4h_and_1h
from .email_notifier import EmailNotifier

# ── Logging setup ──────────────────────────────────────────────────────────────
LOG_FORMAT = "%(asctime)s  %(levelname)-8s  %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

logging.basicConfig(
    level=logging.INFO,
    format=LOG_FORMAT,
    datefmt=DATE_FORMAT,
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("trading_rules.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("trading_rules.runner")


# ── Decision logger ────────────────────────────────────────────────────────────

def _log_no_signal(symbol: str, reason: str, price: float) -> None:
    log.info("[%s] NO SIGNAL  price=%.4f  — %s", symbol, price, reason)


def _log_result(symbol: str, result: dict, price: float) -> None:
    direction = result["direction"].upper()
    entry     = result["entry_price"]
    stop      = result["stop_loss"]
    fib       = result["fib_level"]
    rr        = result["RR"]
    pos       = result["position"]
    entry_ts  = result["entry_ts"]

    log.info(
        "[%s] ✅ SIGNAL  price=%.4f  direction=%-4s  entry=%.4f  stop=%.4f  "
        "fib=%.4f  qty=%.6f  risk=$%.2f  target=%.4f  RR=%.2f  entry_ts=%s",
        symbol, price, direction, entry, stop,
        fib, pos["quantity"], pos["risk_amount"],
        pos["target_price"], rr if rr is not None else 0.0,
        entry_ts,
    )

    log.info(
        "[%s]   impulse: start=%.4f → end=%.4f  "
        "distance=%.4f",
        symbol, stop, entry, pos["distance"],
    )

    pivots = result.get("pivots", [])
    pivot_str = "  →  ".join(
        f"{p['type'].upper()}@{p['price']:.2f}" for p in pivots
    )
    log.info("[%s]   pivots: %s", symbol, pivot_str)


# ── Timing ────────────────────────────────────────────────────────────────────

def _sleep_until_next_hour() -> None:
    """Sleep until 1 minute past the next UTC hour boundary (e.g. 14:01:00)."""
    now = datetime.now(timezone.utc)
    next_hour = (now + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    target = next_hour + timedelta(minutes=1)
    sleep_secs = (target - now).total_seconds()
    log.info("Next check at %s UTC (sleeping %.0fs / ~%.0f min)…\n",
             target.strftime("%Y-%m-%d %H:%M:%S"), sleep_secs, sleep_secs / 60)
    time.sleep(sleep_secs)


# ── Main loop ──────────────────────────────────────────────────────────────────

def run(
    symbol: str = "BTCUSDT",
    account_balance: float = 10_000.0,
    risk_pct: float = 1.0,
    fib_ratio: float = 0.618,
    fib_tol: float = 0.002,
    limit_4h: int = 200,
    limit_1h: int = 200,
) -> None:
    """Run the trading rules engine in an infinite loop."""

    rules    = TradingRules(risk_pct=risk_pct, fib_ratio=fib_ratio, fib_tol=fib_tol)
    notifier = EmailNotifier()

    log.info("=" * 70)
    log.info("Trading Rules Runner started")
    log.info(
        "  symbol=%s  balance=$%.2f  risk=%.1f%%  fib=%.3f  poll=hourly (at :01 UTC)",
        symbol, account_balance, risk_pct, fib_ratio,
    )
    log.info("=" * 70)
    notifier.startup(symbol, account_balance)

    # ── Signal state tracking ──────────────────────────────────────────────────
    # Emails fire only on genuine state changes, not on every hourly poll.
    #   _last_entry_ts   – entry_ts of the last signal we emailed about;
    #                      a new/different value means a new trade setup.
    #   _prev_had_signal – True = previous iteration had a signal,
    #                      False = previous iteration had no signal,
    #                      None  = first iteration (unknown).
    _last_entry_ts: object = None
    _prev_had_signal: Optional[bool] = None

    iteration = 0
    while True:
        iteration += 1
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        log.info("── Iteration #%d  (%s) ──", iteration, now_utc)

        # ── Step 1: Fetch data ───────────────────────────────────────────────
        df_4h = df_1h = None
        try:
            df_4h, df_1h = fetch_4h_and_1h(
                symbol, limit_4h=limit_4h, limit_1h=limit_1h
            )
        except Exception as data_exc:
            log.error("[%s] Data fetch error: %s", symbol, data_exc, exc_info=True)
            notifier.data_fetch_error(symbol, data_exc)
            _sleep_until_next_hour()
            continue

        # ── Step 2: Analyse ─────────────────────────────────────────────────
        try:
            # drop the currently open (incomplete) candle from both frames
            df_4h = df_4h.iloc[:-1]
            df_1h = df_1h.iloc[:-1]

            latest_price = float(df_1h["close"].iloc[-1])
            base  = symbol.replace("USDT", "").replace("BUSD", "")  # e.g. BTC, ETH
            quote = "USDT" if "USDT" in symbol else "BUSD"
            log.info("[%s] last closed 1H price: %s=%.4f %s  (4H bars=%d  1H bars=%d)",
                     symbol, base, latest_price, quote, len(df_4h), len(df_1h))

            result = rules.analyze(df_4h, df_1h, account_balance)

            if result is None:
                reason = "no qualifying structure or entry found"
                _log_no_signal(symbol, reason, latest_price)
                # Email only on transition: signal → no-signal
                if _prev_had_signal is not False:
                    notifier.no_signal(symbol, reason, latest_price)
                else:
                    log.info("[%s] No signal (unchanged) — skipping email", symbol)
                _prev_had_signal = False
                _last_entry_ts   = None
            else:
                _log_result(symbol, result, latest_price)
                current_entry_ts = result.get("entry_ts")
                # Email only when this is a NEW signal (entry_ts has changed)
                if current_entry_ts != _last_entry_ts:
                    log.info("[%s] New signal detected (entry_ts=%s) — sending email",
                             symbol, current_entry_ts)
                    notifier.signal(symbol, result, latest_price)
                    _last_entry_ts = current_entry_ts
                else:
                    log.info("[%s] Signal unchanged (entry_ts=%s) — skipping email",
                             symbol, current_entry_ts)
                _prev_had_signal = True

        except Exception as exc:  # keep the loop alive on transient errors
            log.error("[%s] Error during analysis: %s", symbol, exc, exc_info=True)
            notifier.error(symbol, exc)

        _sleep_until_next_hour()


# ── One-shot scan ──────────────────────────────────────────────────────────────────────

def scan_all_symbols(
    symbols: list[str] | None = None,
    account_balance: float = 10_000.0,
    risk_pct: float = 1.0,
    fib_ratio: float = 0.618,
    fib_tol: float = 0.002,
    limit_4h: int = 200,
    limit_1h: int = 200,
) -> list[dict]:
    """Fetch and analyse every symbol once; return a list of result records.

    Each record contains:
        symbol       str
        signal       dict | None   – TradingRules.analyze() output, or None
        latest_price float | None
        error        str | None    – exception message if the symbol failed
        scanned_at   datetime      – UTC timestamp of the scan
    """
    from .data import SUPPORTED_SYMBOLS

    target = symbols or SUPPORTED_SYMBOLS
    rules  = TradingRules(risk_pct=risk_pct, fib_ratio=fib_ratio, fib_tol=fib_tol)
    records: list[dict] = []

    for sym in target:
        scanned_at = datetime.now(timezone.utc)
        try:
            df_4h, df_1h = fetch_4h_and_1h(sym, limit_4h=limit_4h, limit_1h=limit_1h)
            df_4h = df_4h.iloc[:-1]
            df_1h = df_1h.iloc[:-1]
            latest_price = float(df_1h["close"].iloc[-1])
            result = rules.analyze(df_4h, df_1h, account_balance)
            records.append({
                "symbol":       sym,
                "signal":       result,
                "latest_price": latest_price,
                "error":        None,
                "scanned_at":   scanned_at,
            })
            status = "✅ SIGNAL" if result else "⚪ no signal"
            log.info("[scan] %-10s  %s  price=%.4f", sym, status, latest_price)
        except Exception as exc:
            log.error("[scan] %s failed: %s", sym, exc, exc_info=True)
            records.append({
                "symbol":       sym,
                "signal":       None,
                "latest_price": None,
                "error":        str(exc),
                "scanned_at":   scanned_at,
            })

    active = sum(1 for r in records if r.get("signal"))
    log.info("[scan] complete — %d/%d symbol(s) with active signals", active, len(records))
    return records
