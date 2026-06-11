"""
Email notification module for trading rule triggers.

Configuration is done entirely via environment variables so that no
credentials are hard-coded in source.

Required env vars
-----------------
SMTP_HOST       SMTP server hostname          e.g. smtp.gmail.com
SMTP_PORT       SMTP port (int)               e.g. 587
SMTP_USER       Login username / email        e.g. alerts@example.com
SMTP_PASSWORD   Login password / app-password
NOTIFY_TO       Recipient address(es), comma-separated

Optional env vars
-----------------
SMTP_USE_TLS    Use STARTTLS (default: "true")
SMTP_FROM       Sender display address (defaults to SMTP_USER)

Usage
-----
    from .email_notifier import send_signal_email, send_no_signal_email
    send_signal_email(symbol, result, latest_price)
    send_no_signal_email(symbol, reason, latest_price)     # optional

    # Or instantiate once and reuse:
    notifier = EmailNotifier()
    notifier.signal(symbol, result, latest_price)
"""

import logging
import os
import smtplib
import ssl
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

log = logging.getLogger("trading_rules.email_notifier")


class EmailNotifier:
    """Sends trading-signal emails via SMTP."""

    def __init__(self) -> None:
        self.host: str = os.environ.get("SMTP_HOST", "")
        self.port: int = int(os.environ.get("SMTP_PORT", "587"))
        self.user: str = os.environ.get("SMTP_USER", "")
        self.password: str = os.environ.get("SMTP_PASSWORD", "")
        self.from_addr: str = os.environ.get("SMTP_FROM", self.user)
        self.use_tls: bool = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"

        raw_to = os.environ.get("NOTIFY_TO", "")
        self.to_addrs: list[str] = [a.strip() for a in raw_to.split(",") if a.strip()]

    @property
    def _is_configured(self) -> bool:
        return bool(self.host and self.user and self.password and self.to_addrs)

    # ── Low-level send ─────────────────────────────────────────────────────────

    def _send(self, subject: str, html_body: str, text_body: str) -> None:
        """Build and dispatch a MIME multipart email."""
        if not self._is_configured:
            log.warning(
                "Email notifier not configured – skipping. "
                "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, NOTIFY_TO env vars."
            )
            return

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self.from_addr
        msg["To"] = ", ".join(self.to_addrs)

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        try:
            context = ssl.create_default_context()
            with smtplib.SMTP(self.host, self.port, timeout=10) as server:
                if self.use_tls:
                    server.starttls(context=context)
                server.login(self.user, self.password)
                server.sendmail(self.from_addr, self.to_addrs, msg.as_string())
            log.info("📧 Email notification sent to %s", self.to_addrs)
        except Exception as exc:
            log.error("Failed to send email notification: %s", exc, exc_info=True)

    # ── Public API ─────────────────────────────────────────────────────────────

    def signal(self, symbol: str, result: dict, latest_price: float) -> None:
        """Send a full trade-signal email."""
        direction   = result["direction"].upper()
        entry       = result["entry_price"]
        stop        = result["stop_loss"]
        fib         = result["fib_level"]
        rr          = result.get("RR") or 0.0
        pos         = result["position"]
        entry_ts    = result.get("entry_ts", "–")
        target      = pos["target_price"]
        quantity    = pos["quantity"]
        risk_amount = pos["risk_amount"]

        emoji = "🟢" if direction == "BULL" else "🔴"
        now   = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        subject = f"{emoji} Trading Signal: {direction} on {symbol} @ {latest_price:.4f}"

        pivots = result.get("pivots", [])
        pivot_rows = "".join(
            f"<tr><td>{p['type'].upper()}</td><td>{p['price']:.4f}</td></tr>"
            for p in pivots
        )

        html_body = f"""
        <html><body style="font-family: sans-serif; color: #222;">
          <h2 style="color: {'#1a7a1a' if direction == 'BULL' else '#b00020'};">
            {emoji} {direction} Signal — {symbol}
          </h2>
          <p style="color:#888; font-size:0.85em;">Generated at {now}</p>

          <table style="border-collapse:collapse; width:100%; max-width:480px;">
            <tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px 10px;">Field</th>
                <th style="text-align:right;padding:6px 10px;">Value</th></tr>
            <tr><td style="padding:5px 10px;">Current Price</td>
                <td style="text-align:right;padding:5px 10px;"><b>{latest_price:.4f}</b></td></tr>
            <tr style="background:#f8f8f8;"><td style="padding:5px 10px;">Entry Price</td>
                <td style="text-align:right;padding:5px 10px;">{entry:.4f}</td></tr>
            <tr><td style="padding:5px 10px;">Stop Loss</td>
                <td style="text-align:right;padding:5px 10px; color:#b00020;">{stop:.4f}</td></tr>
            <tr style="background:#f8f8f8;"><td style="padding:5px 10px;">Target Price</td>
                <td style="text-align:right;padding:5px 10px; color:#1a7a1a;">{target:.4f}</td></tr>
            <tr><td style="padding:5px 10px;">Fibonacci Level</td>
                <td style="text-align:right;padding:5px 10px;">{fib:.4f}</td></tr>
            <tr style="background:#f8f8f8;"><td style="padding:5px 10px;">Risk/Reward</td>
                <td style="text-align:right;padding:5px 10px;">{rr:.2f}</td></tr>
            <tr><td style="padding:5px 10px;">Quantity</td>
                <td style="text-align:right;padding:5px 10px;">{quantity:.6f}</td></tr>
            <tr style="background:#f8f8f8;"><td style="padding:5px 10px;">Risk Amount</td>
                <td style="text-align:right;padding:5px 10px;">${risk_amount:.2f}</td></tr>
            <tr><td style="padding:5px 10px;">Entry Timestamp</td>
                <td style="text-align:right;padding:5px 10px;">{entry_ts}</td></tr>
          </table>

          {"<h3>Pivots</h3><table style='border-collapse:collapse;'><tr style='background:#f0f0f0;'><th style='padding:4px 10px;'>Type</th><th style='padding:4px 10px;'>Price</th></tr>" + pivot_rows + "</table>" if pivots else ""}

          <p style="color:#aaa; font-size:0.8em; margin-top:20px;">
            This is an automated alert from your Trading Rules engine.
            Not financial advice.
          </p>
        </body></html>
        """

        text_body = (
            f"[{now}] {direction} Signal on {symbol}\n"
            f"Current Price : {latest_price:.4f}\n"
            f"Entry         : {entry:.4f}\n"
            f"Stop Loss     : {stop:.4f}\n"
            f"Target        : {target:.4f}\n"
            f"Fib Level     : {fib:.4f}\n"
            f"Risk/Reward   : {rr:.2f}\n"
            f"Quantity      : {quantity:.6f}\n"
            f"Risk Amount   : ${risk_amount:.2f}\n"
            f"Entry TS      : {entry_ts}\n"
        )

        self._send(subject, html_body, text_body)

    def no_signal(self, symbol: str, reason: str, latest_price: float) -> None:
        """Send a 'no signal' notification (opt-in via NOTIFY_NO_SIGNAL=true)."""
        if os.environ.get("NOTIFY_NO_SIGNAL", "false").lower() != "true":
            return

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"⚪ No Signal: {symbol} @ {latest_price:.4f}"
        text_body = f"[{now}] No signal on {symbol} — {reason}\nPrice: {latest_price:.4f}\n"
        html_body = f"""
        <html><body style="font-family: sans-serif; color: #555;">
          <h3>⚪ No Signal — {symbol}</h3>
          <p style="color:#888; font-size:0.85em;">{now}</p>
          <p><b>Reason:</b> {reason}</p>
          <p><b>Last Price:</b> {latest_price:.4f}</p>
        </body></html>
        """
        self._send(subject, html_body, text_body)


# ── Module-level convenience functions (use a shared singleton) ────────────────

_default_notifier: Optional[EmailNotifier] = None


def _get_notifier() -> EmailNotifier:
    global _default_notifier
    if _default_notifier is None:
        _default_notifier = EmailNotifier()
    return _default_notifier


def send_signal_email(symbol: str, result: dict, latest_price: float) -> None:
    """Send a trade-signal email using the default notifier."""
    _get_notifier().signal(symbol, result, latest_price)


def send_no_signal_email(symbol: str, reason: str, latest_price: float) -> None:
    """Send a no-signal email (only if NOTIFY_NO_SIGNAL=true)."""
    _get_notifier().no_signal(symbol, reason, latest_price)
