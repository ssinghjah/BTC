"""Entry point: python -m backend.trading_rules [options]"""
import argparse
import logging
import os
import sys
from .runner import run, scan_all_symbols

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("trading_rules.log", encoding="utf-8"),
    ],
)
log = logging.getLogger("trading_rules")

parser = argparse.ArgumentParser(description="Continuous Binance trading rules runner")
parser.add_argument("--symbol",   default="BTCUSDT",  help="Binance symbol (default: BTCUSDT)")
parser.add_argument("--balance",  type=float, default=10_000.0, help="Account balance in USD (default: 10000)")
parser.add_argument("--risk",     type=float, default=1.0,      help="Risk %% per trade (default: 1.0)")
parser.add_argument("--fib",      type=float, default=0.618,    help="Fibonacci ratio (default: 0.618)")
parser.add_argument("--limit4h",  type=int,   default=200,      help="Number of 4H candles to fetch (default: 200)")
parser.add_argument("--limit1h",  type=int,   default=200,      help="Number of 1H candles to fetch (default: 200)")
parser.add_argument("--scan",     action="store_true",           help="Scan all symbols once, print a signal table, then exit")

args = parser.parse_args()

log.info(
    "Starting trading_rules — symbol=%s  balance=%.2f  risk=%.1f%%  fib=%.3f  limit4h=%d  limit1h=%d",
    args.symbol, args.balance, args.risk, args.fib, args.limit4h, args.limit1h,
)

# Surface email configuration status at startup
_notify_to = os.environ.get("NOTIFY_TO", "")
if _notify_to and os.environ.get("SMTP_HOST") and os.environ.get("SMTP_USER") and os.environ.get("SMTP_PASSWORD"):
    log.info("Email notifications enabled → %s", _notify_to)
else:
    log.warning(
        "Email notifications DISABLED. Set SMTP_HOST, SMTP_PORT, SMTP_USER, "
        "SMTP_PASSWORD and NOTIFY_TO to enable them."
    )

if args.scan:
    from datetime import datetime, timezone
    log.info("Running one-shot signal scan across all symbols…")
    results = scan_all_symbols(
        account_balance=args.balance,
        risk_pct=args.risk,
        fib_ratio=args.fib,
        limit_4h=args.limit4h,
        limit_1h=args.limit1h,
    )
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"\n  \u2500\u2500 Trading Signal Scan  \u00b7  {ts} \u2500\u2500\n")
    active = no_sig = errors = 0
    for r in results:
        sym   = r["symbol"]
        price = r["latest_price"]
        sig   = r["signal"]
        err   = r["error"]
        if err:
            errors += 1
            print(f"  \u274c  {sym:<12}  ERROR: {err[:65]}")
        elif sig is None:
            no_sig += 1
            print(f"  \u26aa  {sym:<12}  No Signal      price={price:.4f}")
        else:
            active += 1
            direction = sig["direction"].upper()
            icon = "\U0001f402" if direction == "BULL" else "\U0001f43b"
            pos  = sig["position"]
            rr   = sig.get("RR") or 0.0
            print(
                f"  \u2705  {sym:<12}  {icon} {direction:<4}  "
                f"price={price:.4f}  entry={sig['entry_price']:.4f}  "
                f"stop={sig['stop_loss']:.4f}  target={pos['target_price']:.4f}  "
                f"RR={rr:.2f}  ts={sig.get('entry_ts', '')}"
            )
    print(f"\n  Active: {active}  |  No Signal: {no_sig}  |  Errors: {errors}\n")
    sys.exit(0)

run(
    symbol=args.symbol,
    account_balance=args.balance,
    risk_pct=args.risk,
    fib_ratio=args.fib,
    limit_4h=args.limit4h,
    limit_1h=args.limit1h,
)
