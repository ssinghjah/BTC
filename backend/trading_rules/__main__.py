"""Entry point: python -m backend.trading_rules [options]"""
import argparse
import logging
import os
from .runner import run

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

run(
    symbol=args.symbol,
    account_balance=args.balance,
    risk_pct=args.risk,
    fib_ratio=args.fib,
    limit_4h=args.limit4h,
    limit_1h=args.limit1h,
)
