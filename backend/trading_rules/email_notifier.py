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
from enum import Enum
from typing import Optional

log = logging.getLogger("trading_rules.email_notifier")


class EventType(str, Enum):
    """All notification event types supported by the trading rules engine."""
    SIGNAL     = "SIGNAL"       # trade signal detected
    NO_SIGNAL  = "NO_SIGNAL"    # analysis ran; no qualifying setup found
    ERROR      = "ERROR"        # unexpected exception during analysis
    STARTUP    = "STARTUP"      # runner process just started
    SHUTDOWN   = "SHUTDOWN"     # runner process stopping / crashed
    DATA_ERROR = "DATA_ERROR"   # data fetch / API failure
    TEST       = "TEST"         # manual test / verification email


# Default enabled state per event type
_DEFAULT_ENABLED: dict["EventType", bool] = {
    EventType.SIGNAL:     True,
    EventType.NO_SIGNAL:  False,
    EventType.ERROR:      True,
    EventType.STARTUP:    False,
    EventType.SHUTDOWN:   True,
    EventType.DATA_ERROR: True,
    EventType.TEST:       True,
}

# Corresponding environment variable name for each event type
_EVENT_ENV: dict["EventType", str] = {
    EventType.SIGNAL:     "NOTIFY_SIGNAL",
    EventType.NO_SIGNAL:  "NOTIFY_NO_SIGNAL",
    EventType.ERROR:      "NOTIFY_ERROR",
    EventType.STARTUP:    "NOTIFY_STARTUP",
    EventType.SHUTDOWN:   "NOTIFY_SHUTDOWN",
    EventType.DATA_ERROR: "NOTIFY_DATA_ERROR",
    EventType.TEST:       "NOTIFY_TEST",
}


class EmailNotifier:
    """Sends trading-event emails via SMTP."""

    def __init__(self) -> None:
        self.host: str = os.environ.get("SMTP_HOST", "")
        self.port: int = int(os.environ.get("SMTP_PORT", "587"))
        self.user: str = os.environ.get("SMTP_USER", "")
        self.password: str = os.environ.get("SMTP_PASSWORD", "")
        self.from_addr: str = os.environ.get("SMTP_FROM", self.user)
        self.use_tls: bool = os.environ.get("SMTP_USE_TLS", "true").lower() != "false"

        raw_to = os.environ.get("NOTIFY_TO", "")
        self.to_addrs: list[str] = [a.strip() for a in raw_to.split(",") if a.strip()]

    @classmethod
    def reload(cls) -> "EmailNotifier":
        """Return a freshly constructed notifier (re-reads env vars)."""
        return cls()

    @property
    def _is_configured(self) -> bool:
        return bool(self.host and self.user and self.password and self.to_addrs)

    def is_event_enabled(self, event: EventType) -> bool:
        """Return True if notifications for *event* are currently enabled."""
        env_var = _EVENT_ENV.get(event)
        if env_var is None:
            return False
        raw = os.environ.get(env_var)
        if raw is None:
            return _DEFAULT_ENABLED.get(event, False)
        return raw.lower() not in ("false", "0", "no", "off")

    def config_summary(self) -> dict:
        """Return a dict describing the current configuration (no secrets)."""
        return {
            "configured": self._is_configured,
            "host": self.host,
            "port": self.port,
            "user": self.user,
            "from": self.from_addr,
            "to": self.to_addrs,
            "use_tls": self.use_tls,
            "events": {e.value: self.is_event_enabled(e) for e in EventType},
        }

    # ── Low-level send ─────────────────────────────────────────────────────────

    def _send(self, subject: str, html_body: str, text_body: str) -> bool:
        """Build and dispatch a MIME multipart email. Returns True on success."""
        if not self._is_configured:
            log.warning(
                "Email notifier not configured – skipping. "
                "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, NOTIFY_TO env vars."
            )
            return False

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
            log.info("📧 Email sent  [%s]  →  %s", subject, self.to_addrs)
            return True
        except Exception as exc:
            log.error("Failed to send email notification: %s", exc, exc_info=True)
            return False

    # ── Public API ─────────────────────────────────────────────────────────────

    def signal(self, symbol: str, result: dict, latest_price: float) -> bool:
        """Send a full trade-signal email. Returns True if the email was sent."""
        if not self.is_event_enabled(EventType.SIGNAL):
            return False
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

        return self._send(subject, html_body, text_body)

    def no_signal(self, symbol: str, reason: str, latest_price: float) -> bool:
        """Send a 'no signal' notification. Returns True if the email was sent."""
        if not self.is_event_enabled(EventType.NO_SIGNAL):
            return False

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
        return self._send(subject, html_body, text_body)

    def error(self, symbol: str, exc: Exception) -> bool:
        """Send an analysis-error notification. Returns True if the email was sent."""
        if not self.is_event_enabled(EventType.ERROR):
            return False

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"⚠️ Analysis Error: {symbol}"
        text_body = (
            f"[{now}] Analysis error on {symbol}\n"
            f"Type    : {type(exc).__name__}\n"
            f"Message : {exc}\n"
        )
        html_body = f"""
        <html><body style="font-family: sans-serif; color: #222;">
          <h2 style="color:#b00020;">⚠️ Analysis Error — {symbol}</h2>
          <p style="color:#888; font-size:0.85em;">{now}</p>
          <p><b>Error Type:</b> {type(exc).__name__}</p>
          <p><b>Message:</b> {exc}</p>
          <p style="color:#aaa; font-size:0.8em; margin-top:20px;">
            Automated alert from your Trading Rules engine.
          </p>
        </body></html>
        """
        return self._send(subject, html_body, text_body)

    def startup(self, symbol: str, balance: float) -> bool:
        """Send a runner-startup notification. Returns True if the email was sent."""
        if not self.is_event_enabled(EventType.STARTUP):
            return False

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"🚀 Trading Rules Runner Started — {symbol}"
        text_body = (
            f"[{now}] Trading Rules Runner started\n"
            f"Symbol  : {symbol}\n"
            f"Balance : ${balance:,.2f}\n"
        )
        html_body = f"""
        <html><body style="font-family: sans-serif; color: #222;">
          <h2 style="color:#1a7a1a;">🚀 Runner Started — {symbol}</h2>
          <p style="color:#888; font-size:0.85em;">{now}</p>
          <p><b>Symbol:</b> {symbol}</p>
          <p><b>Account Balance:</b> ${balance:,.2f}</p>
          <p style="color:#aaa; font-size:0.8em; margin-top:20px;">
            Automated alert from your Trading Rules engine.
          </p>
        </body></html>
        """
        return self._send(subject, html_body, text_body)

    def shutdown(self, symbol: str, reason: str = "clean exit") -> bool:
        """Send a runner-shutdown notification. Returns True if the email was sent."""
        if not self.is_event_enabled(EventType.SHUTDOWN):
            return False

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"🛑 Trading Rules Runner Stopped — {symbol}"
        text_body = (
            f"[{now}] Trading Rules Runner stopped\n"
            f"Symbol : {symbol}\n"
            f"Reason : {reason}\n"
        )
        html_body = f"""
        <html><body style="font-family: sans-serif; color: #222;">
          <h2 style="color:#b00020;">🛑 Runner Stopped — {symbol}</h2>
          <p style="color:#888; font-size:0.85em;">{now}</p>
          <p><b>Symbol:</b> {symbol}</p>
          <p><b>Reason:</b> {reason}</p>
          <p style="color:#aaa; font-size:0.8em; margin-top:20px;">
            Automated alert from your Trading Rules engine.
          </p>
        </body></html>
        """
        return self._send(subject, html_body, text_body)

    def data_fetch_error(self, symbol: str, exc: Exception) -> bool:
        """Send a data-fetch-failure notification. Returns True if the email was sent."""
        if not self.is_event_enabled(EventType.DATA_ERROR):
            return False

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"📡 Data Fetch Error: {symbol}"
        text_body = (
            f"[{now}] Data fetch error for {symbol}\n"
            f"Type    : {type(exc).__name__}\n"
            f"Message : {exc}\n"
        )
        html_body = f"""
        <html><body style="font-family: sans-serif; color: #222;">
          <h2 style="color:#b00020;">📡 Data Fetch Error — {symbol}</h2>
          <p style="color:#888; font-size:0.85em;">{now}</p>
          <p><b>Symbol:</b> {symbol}</p>
          <p><b>Error Type:</b> {type(exc).__name__}</p>
          <p><b>Message:</b> {exc}</p>
          <p style="color:#aaa; font-size:0.8em; margin-top:20px;">
            Automated alert from your Trading Rules engine.
          </p>
        </body></html>
        """
        return self._send(subject, html_body, text_body)

    def test(self, to_override: Optional[str] = None) -> bool:
        """Send a test/verification email to confirm SMTP config is working.

        Args:
            to_override: Optional comma-separated recipients; uses NOTIFY_TO if omitted.

        Returns:
            True if the email was dispatched successfully.
        """
        orig_to = self.to_addrs[:]
        if to_override:
            self.to_addrs = [a.strip() for a in to_override.split(",") if a.strip()]

        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        cfg = self.config_summary()
        subject = "✅ Trading Rules — Email Configuration Test"

        _en  = '<span style="color:#1a7a1a">✓ enabled</span>'
        _dis = '<span style="color:#888">✗ disabled</span>'
        event_rows = "".join(
            f'<tr><td style="padding:4px 8px;">{e}</td>'
            f'<td style="padding:4px 8px;text-align:right;">{_en if v else _dis}</td></tr>'
            for e, v in cfg["events"].items()
        )

        text_body = (
            f"[{now}] Email configuration test from Trading Rules engine.\n"
            f"Host : {cfg['host']}:{cfg['port']}\n"
            f"From : {cfg['from'] or cfg['user']}\n"
            f"To   : {', '.join(self.to_addrs)}\n"
        )
        html_body = f"""
        <html><body style="font-family: sans-serif; color: #222; max-width:600px; margin:0 auto;">
          <h2 style="color:#1a7a1a;">✅ Email Configuration Test</h2>
          <p style="color:#888; font-size:0.85em;">{now}</p>
          <table style="border-collapse:collapse; width:100%; max-width:480px;">
            <tr style="background:#f0f0f0;">
              <th style="text-align:left;padding:6px 10px;">Setting</th>
              <th style="text-align:right;padding:6px 10px;">Value</th></tr>
            <tr><td style="padding:5px 10px;">SMTP Host</td>
                <td style="text-align:right;">{cfg['host']}:{cfg['port']}</td></tr>
            <tr style="background:#f8f8f8;"><td style="padding:5px 10px;">From Address</td>
                <td style="text-align:right;">{cfg['from'] or cfg['user']}</td></tr>
            <tr><td style="padding:5px 10px;">To Address(es)</td>
                <td style="text-align:right;">{', '.join(self.to_addrs)}</td></tr>
            <tr style="background:#f8f8f8;"><td style="padding:5px 10px;">TLS</td>
                <td style="text-align:right;">{'enabled' if cfg['use_tls'] else 'disabled'}</td></tr>
          </table>
          <h3 style="margin-top:18px;">Event Notifications</h3>
          <table style="border-collapse:collapse;">{event_rows}</table>
          <p style="color:#aaa; font-size:0.8em; margin-top:20px;">
            If you received this, your SMTP configuration is working correctly.
          </p>
        </body></html>
        """
        result = self._send(subject, html_body, text_body)
        self.to_addrs = orig_to
        return result

    def notify(self, event: EventType, **kwargs) -> bool:
        """Generic event dispatch — call the matching method by EventType.

        Keyword arguments are forwarded to the underlying method.

        Example
        -------
            notifier.notify(EventType.SIGNAL,
                            symbol="BTCUSDT", result=result, latest_price=42000.0)
            notifier.notify(EventType.ERROR, symbol="BTCUSDT", exc=some_exception)
        """
        dispatch: dict = {
            EventType.SIGNAL:     lambda: self.signal(
                kwargs["symbol"], kwargs["result"], kwargs["latest_price"]),
            EventType.NO_SIGNAL:  lambda: self.no_signal(
                kwargs["symbol"], kwargs.get("reason", "no setup found"),
                kwargs.get("latest_price", 0.0)),
            EventType.ERROR:      lambda: self.error(
                kwargs["symbol"], kwargs["exc"]),
            EventType.STARTUP:    lambda: self.startup(
                kwargs["symbol"], kwargs.get("balance", 0.0)),
            EventType.SHUTDOWN:   lambda: self.shutdown(
                kwargs["symbol"], kwargs.get("reason", "clean exit")),
            EventType.DATA_ERROR: lambda: self.data_fetch_error(
                kwargs["symbol"], kwargs["exc"]),
            EventType.TEST:       lambda: self.test(
                kwargs.get("to_override")),
        }
        fn = dispatch.get(event)
        if fn is None:
            log.warning("Unknown event type: %s", event)
            return False
        return fn()


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
