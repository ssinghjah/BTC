"""
Trading Rules GUI — interactive Plotly Dash dashboard.

Run from the project root:
    python -m backend.trading_rules.gui
    python -m backend.trading_rules.gui --symbol ETHUSDT --port 8051

Opens http://127.0.0.1:8050 in your browser automatically.
"""

import argparse
import os
import threading
import webbrowser
from datetime import datetime, timezone

import dash
from dash import dcc, html, Input, Output, State
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import pandas as pd

from .backend import TradingRules, find_pivots, compute_fib_level, evaluate_4h_structure
from .data import fetch_4h_and_1h
from .email_notifier import EmailNotifier, EventType
from .runner import scan_all_symbols

# ── Constants ─────────────────────────────────────────────────────────────────
SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
DEFAULT_SYMBOL = "BTCUSDT"

# Colour palette (GitHub dark theme-inspired)
C_BG     = "#0d1117"
C_PANEL  = "#161b22"
C_BORDER = "#30363d"
C_TEXT   = "#c9d1d9"
C_MUTED  = "#8b949e"
C_GREEN  = "#3fb950"
C_RED    = "#f85149"
C_BLUE   = "#58a6ff"
C_ORANGE = "#ffa657"
C_PURPLE = "#bc8cff"

# ── Mermaid flowchart (embedded HTML) ────────────────────────────────────────
MERMAID_HTML = """
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <style>
    body  { background:#0d1117; margin:0; padding:28px 40px; }
    .wrap { max-width:860px; margin:0 auto; }
    h3    { color:#c9d1d9; font-family:'Courier New',monospace; font-size:15px;
            margin:0 0 22px 0; letter-spacing:.5px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h3>📐  Trading Rules — Decision Flowchart</h3>
    <div class="mermaid">
flowchart TD
    A(["🟢 START"]) --> B["Fetch 4H + 1H OHLCV\nfrom Kraken API"]
    B --> C["Drop incomplete\nopen candle from both"]
    C --> D["find_pivots\u2009(df_4h,\u2009left=3,\u2009right=3)"]
    D --> E{"len(pivots) ≥ 4?"}
    E -- No --> Z(["🔴 NO SIGNAL"])
    E -- Yes --> F["Take last 4\nalternating pivots"]
    F --> G{"Types =\n[low, high, low, high]?"}
    G -- Yes --> H{"low₂ > low₁\nAND\nhigh₂ > high₁?"}
    H -- Yes --> I["direction = BULL 🐂"]
    H -- No  --> Z
    G -- No  --> J{"Types =\n[high, low, high, low]?"}
    J -- Yes --> K{"low₂ < low₁\nAND\nhigh₂ < high₁?"}
    K -- Yes --> L["direction = BEAR 🐻"]
    K -- No  --> Z
    J -- No  --> Z
    I --> M["Scan 4H candles for\nconfirmation breakout\nBull: close > prior high\nBear: close < prior low"]
    L --> M
    M --> N{"Confirmation\ncandle found?"}
    N -- No  --> Z
    N -- Yes --> O["Compute Fib 61.8%\nof impulse swing\nfib = end − (end−start) × 0.618"]
    O --> P["Scan 1H candles:\nlow ≤ fib ≤ high?"]
    P --> Q{"Touch found?"}
    Q -- No  --> Z
    Q -- Yes --> R{"Next 1H candle confirms?\nBull: close > open + close > prev\nBear: close < open + close < prev"}
    R -- No  --> P
    R -- Yes --> S["Entry price set\nat candle high (bull)\nor low (bear)"]
    S --> T["Stop Loss =\nlast structure pivot\nbefore impulse"]
    T --> U["Position Size =\nrisk_amount ÷ distance"]
    U --> V["Target =\nentry ± 2 × distance\n(2 : 1 R:R)"]
    V --> W(["✅ SIGNAL OUTPUT"])

    style A fill:#238636,stroke:#3fb950,color:#fff
    style Z fill:#8b0000,stroke:#f85149,color:#fff
    style W fill:#1f6feb,stroke:#58a6ff,color:#fff
    style I fill:#1f4e1f,stroke:#3fb950,color:#c9d1d9
    style L fill:#4e1f1f,stroke:#f85149,color:#c9d1d9
    style O fill:#2d2000,stroke:#ffa657,color:#c9d1d9
    style V fill:#1a1a2e,stroke:#bc8cff,color:#c9d1d9
    </div>
  </div>
  <script>mermaid.initialize({startOnLoad:true,theme:'dark'});</script>
</body>
</html>
"""

# ── Notifications tab helpers ───────────────────────────────────────────────

_INPUT_STYLE = {
    "width": "100%",
    "boxSizing": "border-box",
    "backgroundColor": "#0d1117",  # C_BG value (can’t reference before layout)
    "color": "#c9d1d9",
    "border": "1px solid #30363d",
    "borderRadius": "6px",
    "padding": "7px 10px",
    "fontSize": "13px",
    "fontFamily": "'Courier New', Courier, monospace",
}

_LABEL_STYLE = {
    "color": "#8b949e",
    "fontSize": "11px",
    "display": "block",
    "marginBottom": "4px",
    "textTransform": "uppercase",
    "letterSpacing": "0.5px",
}


def _smtp_field(
    label: str,
    field_id: str,
    placeholder: str,
    value: str,
    input_type: str = "text",
) -> html.Div:
    """Labelled text input for the SMTP settings form."""
    return html.Div([
        html.Label(label, style=_LABEL_STYLE),
        dcc.Input(
            id=field_id,
            placeholder=placeholder,
            value=value,
            type=input_type,
            style=_INPUT_STYLE,
        ),
    ])


# ── Dash application ──────────────────────────────────────────────────────────
app = dash.Dash(__name__, title="Trading Rules Dashboard")
app.layout = html.Div(
    style={
        "backgroundColor": C_BG,
        "minHeight": "100vh",
        "padding": "22px 28px",
        "fontFamily": "'Courier New', Courier, monospace",
        "color": C_TEXT,
    },
    children=[

        # ── Header ────────────────────────────────────────────────────────────
        html.Div([
            html.H2(
                "📈  Trading Rules Dashboard",
                style={"margin": "0 0 4px 0", "color": "#e6edf3", "fontWeight": "600", "fontSize": "22px"},
            ),
            html.P(
                "4H Structure  ·  Fibonacci Retracement  ·  1H Entry Signals",
                style={"margin": "0", "color": C_MUTED, "fontSize": "13px"},
            ),
        ], style={"marginBottom": "18px"}),

        # ── Tabs ──────────────────────────────────────────────────────────────
        dcc.Tabs(
            value="dashboard",
            colors={"border": C_BORDER, "primary": C_BLUE, "background": C_BG},
            style={"marginBottom": "20px", "fontFamily": "'Courier New', Courier, monospace"},
            children=[

                # ── Tab 1: Dashboard ──────────────────────────────────────────
                dcc.Tab(
                    label="📊  Dashboard",
                    value="dashboard",
                    style={"backgroundColor": C_BG, "color": C_MUTED,
                           "border": f"1px solid {C_BORDER}", "padding": "8px 18px",
                           "fontSize": "13px", "fontFamily": "inherit"},
                    selected_style={"backgroundColor": C_PANEL, "color": C_TEXT,
                                    "border": f"1px solid {C_BORDER}",
                                    "borderBottom": f"2px solid {C_BLUE}",
                                    "padding": "8px 18px", "fontSize": "13px",
                                    "fontFamily": "inherit"},
                    children=[

                        # Controls
                        html.Div([
                            html.Div([
                                html.Label("Symbol", style={"color": C_MUTED, "fontSize": "11px",
                                                            "marginBottom": "5px", "display": "block",
                                                            "textTransform": "uppercase", "letterSpacing": "0.5px"}),
                                dcc.Dropdown(
                                    id="symbol-dd",
                                    options=[{"label": s, "value": s} for s in SYMBOLS],
                                    value=DEFAULT_SYMBOL,
                                    clearable=False,
                                    style={"width": "160px", "fontSize": "13px"},
                                ),
                            ]),
                            html.Div([
                                html.Label(
                                    "Options",
                                    style={"color": C_MUTED, "fontSize": "11px",
                                           "marginBottom": "5px", "display": "block",
                                           "textTransform": "uppercase", "letterSpacing": "0.5px"},
                                ),
                                dcc.Checklist(
                                    id="align-toggle",
                                    options=[{"label": "  Align time", "value": "align"}],
                                    value=[],
                                    style={"fontSize": "13px"},
                                    inputStyle={
                                        "marginRight": "6px",
                                        "accentColor": C_BLUE,
                                        "cursor": "pointer",
                                        "width": "14px",
                                        "height": "14px",
                                    },
                                    labelStyle={
                                        "cursor": "pointer",
                                        "color": C_TEXT,
                                        "backgroundColor": C_PANEL,
                                        "border": f"1px solid {C_BORDER}",
                                        "borderRadius": "6px",
                                        "padding": "6px 12px",
                                        "display": "inline-flex",
                                        "alignItems": "center",
                                    },
                                ),
                            ]),
                            html.Button(
                                "⟳  Refresh",
                                id="refresh-btn",
                                n_clicks=0,
                                style={
                                    "backgroundColor": "#238636",
                                    "color": "#ffffff",
                                    "border": "none",
                                    "borderRadius": "6px",
                                    "padding": "9px 20px",
                                    "fontSize": "13px",
                                    "cursor": "pointer",
                                    "alignSelf": "flex-end",
                                    "fontFamily": "inherit",
                                },
                            ),
                            html.Div(
                                id="status-bar",
                                style={"alignSelf": "flex-end", "fontSize": "12px", "color": C_MUTED},
                            ),
                        ], id="controls-wrapper", style={"display": "flex", "gap": "14px",
                                  "alignItems": "flex-end", "marginBottom": "20px"}),

                        # Chart split slider
                        html.Div([
                            html.Label(
                                "4H  ╱  1H  split",
                                style={"color": C_MUTED, "fontSize": "11px",
                                       "textTransform": "uppercase", "letterSpacing": "0.5px",
                                       "marginRight": "12px", "whiteSpace": "nowrap"},
                            ),
                            dcc.Slider(
                                id="split-slider",
                                min=20, max=80, step=5, value=55,
                                marks={20: "20", 35: "35", 50: "50", 65: "65", 80: "80"},
                                tooltip={"placement": "bottom", "always_visible": False},
                                updatemode="drag",
                                className="split-slider",
                            ),
                        ], style={"display": "flex", "alignItems": "center",
                                  "marginBottom": "16px", "gap": "8px"}),

                        # Chart
                        dcc.Loading(
                            type="circle",
                            color=C_BLUE,
                            children=dcc.Graph(
                                id="chart",
                                style={"height": "68vh"},
                                config={
                                    "displayModeBar": True,
                                    "scrollZoom": True,
                                    "modeBarButtonsToRemove": ["lasso2d", "select2d"],
                                },
                            ),
                        ),

                        # Signal Summary
                        html.Div(id="signal-box", style={"marginTop": "18px"}),
                    ],
                ),

                # ── Tab 2: Logic Flowchart ────────────────────────────────────
                dcc.Tab(
                    label="🔀  Logic Flowchart",
                    value="flowchart",
                    style={"backgroundColor": C_BG, "color": C_MUTED,
                           "border": f"1px solid {C_BORDER}", "padding": "8px 18px",
                           "fontSize": "13px", "fontFamily": "inherit"},
                    selected_style={"backgroundColor": C_PANEL, "color": C_TEXT,
                                    "border": f"1px solid {C_BORDER}",
                                    "borderBottom": f"2px solid {C_BLUE}",
                                    "padding": "8px 18px", "fontSize": "13px",
                                    "fontFamily": "inherit"},
                    children=[
                        html.Iframe(
                            srcDoc=MERMAID_HTML,
                            style={
                                "width": "100%",
                                "height": "82vh",
                                "border": f"1px solid {C_BORDER}",
                                "borderRadius": "8px",
                                "backgroundColor": C_BG,
                            },
                        ),
                    ],
                ),

                # ── Tab 3: All Signals ───────────────────────────────────────────
                dcc.Tab(
                    label="📋  All Signals",
                    value="signals",
                    style={"backgroundColor": C_BG, "color": C_MUTED,
                           "border": f"1px solid {C_BORDER}", "padding": "8px 18px",
                           "fontSize": "13px", "fontFamily": "inherit"},
                    selected_style={"backgroundColor": C_PANEL, "color": C_TEXT,
                                    "border": f"1px solid {C_BORDER}",
                                    "borderBottom": f"2px solid {C_BLUE}",
                                    "padding": "8px 18px", "fontSize": "13px",
                                    "fontFamily": "inherit"},
                    children=[
                        # Controls
                        html.Div([
                            html.Button(
                                "⟳  Scan All",
                                id="scan-btn",
                                n_clicks=0,
                                style={
                                    "backgroundColor": "#238636",
                                    "color": "#ffffff",
                                    "border": "none",
                                    "borderRadius": "6px",
                                    "padding": "9px 20px",
                                    "fontSize": "13px",
                                    "cursor": "pointer",
                                    "fontFamily": "inherit",
                                },
                            ),
                            html.Div(
                                id="signals-status",
                                style={"fontSize": "12px", "color": C_MUTED,
                                       "alignSelf": "center"},
                                children="Click '⟳ Scan All' to fetch current signals for all symbols.",
                            ),
                        ], style={"display": "flex", "gap": "14px",
                                  "alignItems": "center", "marginBottom": "18px"}),

                        dcc.Loading(
                            type="circle",
                            color=C_BLUE,
                            children=html.Div(id="signals-table"),
                        ),
                    ],
                ),

                # ── Tab 4: Notifications ──────────────────────────────────────────
                dcc.Tab(
                    label="📧  Notifications",
                    value="notifications",
                    style={"backgroundColor": C_BG, "color": C_MUTED,
                           "border": f"1px solid {C_BORDER}", "padding": "8px 18px",
                           "fontSize": "13px", "fontFamily": "inherit"},
                    selected_style={"backgroundColor": C_PANEL, "color": C_TEXT,
                                    "border": f"1px solid {C_BORDER}",
                                    "borderBottom": f"2px solid {C_BLUE}",
                                    "padding": "8px 18px", "fontSize": "13px",
                                    "fontFamily": "inherit"},
                    children=[
                        html.Div(
                            style={"display": "grid",
                                   "gridTemplateColumns": "1fr 1fr",
                                   "gap": "24px", "padding": "4px 0"},
                            children=[

                                # ── SMTP config ─────────────────────────────
                                html.Div([
                                    html.H3("SMTP Configuration",
                                            style={"color": C_TEXT, "fontSize": "15px",
                                                   "margin": "0 0 16px 0",
                                                   "fontWeight": "600"}),

                                    # Host + Port
                                    html.Div(
                                        style={"display": "grid",
                                               "gridTemplateColumns": "3fr 1fr",
                                               "gap": "10px", "marginBottom": "10px"},
                                        children=[
                                            _smtp_field("SMTP Host", "smtp-host-input",
                                                        "smtp.gmail.com",
                                                        os.environ.get("SMTP_HOST", "")),
                                            _smtp_field("Port", "smtp-port-input",
                                                        "587",
                                                        os.environ.get("SMTP_PORT", "587")),
                                        ],
                                    ),

                                    # User + Password
                                    html.Div(
                                        style={"display": "grid",
                                               "gridTemplateColumns": "1fr 1fr",
                                               "gap": "10px", "marginBottom": "10px"},
                                        children=[
                                            _smtp_field("SMTP User", "smtp-user-input",
                                                        "alerts@example.com",
                                                        os.environ.get("SMTP_USER", "")),
                                            _smtp_field("Password", "smtp-password-input",
                                                        "App password",
                                                        os.environ.get("SMTP_PASSWORD", ""),
                                                        input_type="password"),
                                        ],
                                    ),

                                    # From
                                    html.Div(style={"marginBottom": "10px"},
                                             children=[_smtp_field(
                                                 "From Address", "smtp-from-input",
                                                 "Trading Rules <alerts@example.com>",
                                                 os.environ.get("SMTP_FROM", ""))]),

                                    # To
                                    html.Div(style={"marginBottom": "10px"},
                                             children=[_smtp_field(
                                                 "To Addresses (comma-separated)",
                                                 "notify-to-input",
                                                 "you@example.com, team@example.com",
                                                 os.environ.get("NOTIFY_TO", ""))]),

                                    # TLS toggle
                                    html.Div(style={"marginBottom": "16px"}, children=[
                                        dcc.Checklist(
                                            id="smtp-tls-check",
                                            options=[{"label": "  Use STARTTLS", "value": "tls"}],
                                            value=["tls"] if os.environ.get(
                                                "SMTP_USE_TLS", "true").lower() != "false" else [],
                                            inputStyle={"marginRight": "6px",
                                                        "accentColor": C_BLUE,
                                                        "cursor": "pointer",
                                                        "width": "14px", "height": "14px"},
                                            labelStyle={"cursor": "pointer",
                                                        "color": C_TEXT,
                                                        "fontSize": "13px",
                                                        "display": "inline-flex",
                                                        "alignItems": "center"},
                                        ),
                                    ]),

                                    # Action buttons
                                    html.Div(
                                        style={"display": "flex", "gap": "10px",
                                               "marginBottom": "14px"},
                                        children=[
                                            html.Button(
                                                "💾  Save Settings",
                                                id="save-email-btn",
                                                n_clicks=0,
                                                style={"backgroundColor": "#1f6feb",
                                                       "color": "#ffffff",
                                                       "border": "none",
                                                       "borderRadius": "6px",
                                                       "padding": "9px 18px",
                                                       "fontSize": "13px",
                                                       "cursor": "pointer",
                                                       "fontFamily": "inherit"},
                                            ),
                                            html.Button(
                                                "📧  Send Test Email",
                                                id="test-email-btn",
                                                n_clicks=0,
                                                style={"backgroundColor": "#238636",
                                                       "color": "#ffffff",
                                                       "border": "none",
                                                       "borderRadius": "6px",
                                                       "padding": "9px 18px",
                                                       "fontSize": "13px",
                                                       "cursor": "pointer",
                                                       "fontFamily": "inherit"},
                                            ),
                                        ],
                                    ),

                                    # Status
                                    html.Div(id="notif-status",
                                             style={"fontSize": "12px",
                                                    "minHeight": "24px"}),

                                ], style={
                                    "backgroundColor": C_PANEL,
                                    "border": f"1px solid {C_BORDER}",
                                    "borderRadius": "8px",
                                    "padding": "20px 22px",
                                }),

                                # ── Event toggles ────────────────────────────
                                html.Div([
                                    html.H3("Event Notifications",
                                            style={"color": C_TEXT, "fontSize": "15px",
                                                   "margin": "0 0 8px 0",
                                                   "fontWeight": "600"}),
                                    html.P("Select which events trigger an email.",
                                           style={"color": C_MUTED, "fontSize": "12px",
                                                  "margin": "0 0 14px 0"}),

                                    dcc.Checklist(
                                        id="event-checklist",
                                        options=[
                                            {"label": " 📈  Trade Signal (SIGNAL)",
                                             "value": "NOTIFY_SIGNAL"},
                                            {"label": " ⚪  No Signal (NO_SIGNAL)",
                                             "value": "NOTIFY_NO_SIGNAL"},
                                            {"label": " ⚠️  Analysis Error (ERROR)",
                                             "value": "NOTIFY_ERROR"},
                                            {"label": " 🚀  Runner Startup (STARTUP)",
                                             "value": "NOTIFY_STARTUP"},
                                            {"label": " 🛑  Runner Shutdown (SHUTDOWN)",
                                             "value": "NOTIFY_SHUTDOWN"},
                                            {"label": " 📡  Data Fetch Error (DATA_ERROR)",
                                             "value": "NOTIFY_DATA_ERROR"},
                                        ],
                                        value=[
                                            k for k, default in {
                                                "NOTIFY_SIGNAL":     True,
                                                "NOTIFY_NO_SIGNAL":  False,
                                                "NOTIFY_ERROR":      True,
                                                "NOTIFY_STARTUP":    False,
                                                "NOTIFY_SHUTDOWN":   True,
                                                "NOTIFY_DATA_ERROR": True,
                                            }.items()
                                            if os.environ.get(
                                                k, "true" if default else "false"
                                            ).lower() not in ("false", "0", "no", "off")
                                        ],
                                        inputStyle={"marginRight": "8px",
                                                    "accentColor": C_BLUE,
                                                    "cursor": "pointer",
                                                    "width": "15px", "height": "15px"},
                                        labelStyle={"display": "flex",
                                                    "alignItems": "center",
                                                    "cursor": "pointer",
                                                    "color": C_TEXT,
                                                    "backgroundColor": C_BG,
                                                    "border": f"1px solid {C_BORDER}",
                                                    "borderRadius": "6px",
                                                    "padding": "10px 14px",
                                                    "marginBottom": "8px",
                                                    "fontSize": "13px"},
                                    ),

                                    html.P(
                                        "Changes take effect after clicking ‘Save Settings’.",
                                        style={"color": C_MUTED, "fontSize": "11px",
                                               "marginTop": "12px"},
                                    ),
                                ], style={
                                    "backgroundColor": C_PANEL,
                                    "border": f"1px solid {C_BORDER}",
                                    "borderRadius": "8px",
                                    "padding": "20px 22px",
                                }),
                            ],
                        ),
                    ],
                ),
            ],
        ),
    ],
)


# ── Callback ──────────────────────────────────────────────────────────────────
@app.callback(
    Output("chart", "figure"),
    Output("signal-box", "children"),
    Output("status-bar", "children"),
    Input("refresh-btn", "n_clicks"),
    Input("symbol-dd", "value"),
    Input("align-toggle", "value"),
    Input("split-slider", "value"),
)
def update(n_clicks, symbol, align_value, split_value):
    align_scales = bool(align_value)
    top_pct = (split_value or 55) / 100
    row_heights = [top_pct, round(1 - top_pct, 2)]
    try:
        df_4h, df_1h = fetch_4h_and_1h(symbol, limit_4h=200, limit_1h=200)
        df_4h = df_4h.iloc[:-1]   # drop the still-open candle
        df_1h = df_1h.iloc[:-1]

        rules     = TradingRules()
        signal    = rules.analyze(df_4h, df_1h, account_balance=10_000.0)
        structure = evaluate_4h_structure(df_4h)
        pivots    = find_pivots(df_4h)

        fig = _build_figure(symbol, df_4h, df_1h, pivots, structure, signal,
                            align_scales=align_scales, row_heights=row_heights)
        box = _signal_panel(signal)
        status = (
            f"Last updated  ·  {len(df_4h)} × 4H bars  ·  "
            f"{len(df_1h)} × 1H bars  ·  "
            f"latest close: {df_1h['close'].iloc[-1]:.2f}"
        )
        return fig, box, status

    except Exception as exc:
        err_fig = go.Figure()
        err_fig.update_layout(
            paper_bgcolor=C_BG,
            plot_bgcolor=C_PANEL,
            font_color=C_TEXT,
            annotations=[dict(
                text=f"⚠  {exc}",
                x=0.5, y=0.5, showarrow=False,
                font=dict(size=14, color=C_RED),
                xref="paper", yref="paper",
            )],
        )
        return err_fig, html.Div(str(exc), style={"color": C_RED}), "Error"


# ── Notifications callback ──────────────────────────────────────────────

_ALL_EVENT_KEYS = [
    "NOTIFY_SIGNAL", "NOTIFY_NO_SIGNAL", "NOTIFY_ERROR",
    "NOTIFY_STARTUP", "NOTIFY_SHUTDOWN", "NOTIFY_DATA_ERROR",
]


@app.callback(
    Output("notif-status", "children"),
    Input("save-email-btn", "n_clicks"),
    Input("test-email-btn", "n_clicks"),
    State("smtp-host-input",     "value"),
    State("smtp-port-input",     "value"),
    State("smtp-user-input",     "value"),
    State("smtp-password-input", "value"),
    State("smtp-from-input",     "value"),
    State("notify-to-input",     "value"),
    State("smtp-tls-check",      "value"),
    State("event-checklist",     "value"),
    prevent_initial_call=True,
)
def handle_email_settings(save_n, test_n, host, port, user, password,
                          from_addr, to_addrs, use_tls, event_vals):
    """Save SMTP settings to env (and .env file) or send a test email."""
    from dash import ctx

    # Apply form values to the running process environment
    os.environ["SMTP_HOST"]     = host     or ""
    os.environ["SMTP_PORT"]     = str(port or "587")
    os.environ["SMTP_USER"]     = user     or ""
    os.environ["SMTP_PASSWORD"] = password or ""
    os.environ["SMTP_FROM"]     = from_addr or ""
    os.environ["NOTIFY_TO"]     = to_addrs or ""
    os.environ["SMTP_USE_TLS"]  = "true" if use_tls else "false"

    # Apply per-event toggles
    selected = set(event_vals or [])
    for key in _ALL_EVENT_KEYS:
        os.environ[key] = "true" if key in selected else "false"

    triggered = ctx.triggered_id

    # ── Save Settings ────────────────────────────────────────────────
    if triggered == "save-email-btn":
        lines = [
            f"SMTP_HOST={os.environ.get('SMTP_HOST', '')}",
            f"SMTP_PORT={os.environ.get('SMTP_PORT', '587')}",
            f"SMTP_USER={os.environ.get('SMTP_USER', '')}",
            f"SMTP_PASSWORD={os.environ.get('SMTP_PASSWORD', '')}",
            f"SMTP_FROM={os.environ.get('SMTP_FROM', '')}",
            f"NOTIFY_TO={os.environ.get('NOTIFY_TO', '')}",
            f"SMTP_USE_TLS={os.environ.get('SMTP_USE_TLS', 'true')}",
        ] + [f"{k}={os.environ.get(k, '')}" for k in _ALL_EVENT_KEYS]
        try:
            with open(".env", "w") as fh:
                fh.write("\n".join(lines) + "\n")
            return html.Div(
                "✅ Settings saved to .env — restart runner to reload from file.",
                style={"color": C_GREEN},
            )
        except OSError as e:
            return html.Div(
                f"⚠️ Applied to session but .env write failed: {e}",
                style={"color": C_ORANGE},
            )

    # ── Send Test Email ──────────────────────────────────────────────
    if triggered == "test-email-btn":
        notifier = EmailNotifier()  # reads updated env vars
        if not notifier._is_configured:
            return html.Div(
                "❌ SMTP not configured. Fill in Host, User, Password and To fields first.",
                style={"color": C_RED},
            )
        try:
            ok = notifier.test()
            if ok:
                return html.Div(
                    f"✅ Test email sent → {', '.join(notifier.to_addrs)}",
                    style={"color": C_GREEN},
                )
            return html.Div(
                "❌ Failed to send — check SMTP credentials and server logs.",
                style={"color": C_RED},
            )
        except Exception as exc:
            return html.Div(f"❌ Error: {exc}", style={"color": C_RED})

    return ""


# ── All-signals callback ──────────────────────────────────────────────────

@app.callback(
    Output("signals-table",  "children"),
    Output("signals-status", "children"),
    Input("scan-btn",        "n_clicks"),
    prevent_initial_call=True,
)
def update_signals_table(_n_clicks):
    """Scan all symbols once and refresh the signals table."""
    records    = scan_all_symbols(symbols=SYMBOLS)
    scanned_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    return _scan_table(records), f"Last scan: {scanned_at}"


# ── Figure builder ────────────────────────────────────────────────────────────
def _build_figure(symbol, df_4h, df_1h, pivots, structure, signal,
                  align_scales=False, row_heights=None):
    if row_heights is None:
        row_heights = [0.55, 0.45]
    fig = make_subplots(
        rows=2, cols=1,
        row_heights=row_heights,
        shared_xaxes=align_scales,
        subplot_titles=[
            f"{symbol}  ·  4H  —  Structure & Pivot Points",
            f"{symbol}  ·  1H  —  Fibonacci Entry",
        ],
        vertical_spacing=0.10,
    )

    # ── 4H candlesticks ───────────────────────────────────────────────────────
    fig.add_trace(_candles(df_4h, "4H"), row=1, col=1)

    # ── All pivot markers ─────────────────────────────────────────────────────
    ph = [p for p in pivots if p["type"] == "high"]
    pl = [p for p in pivots if p["type"] == "low"]

    if ph:
        fig.add_trace(go.Scatter(
            x=[p["ts"] for p in ph],
            y=[p["price"] for p in ph],
            mode="markers",
            name="Pivot High",
            marker=dict(symbol="triangle-down", size=10, color=C_ORANGE,
                        line=dict(color=C_ORANGE, width=1)),
            hovertemplate="<b>Pivot High</b><br>%{x|%Y-%m-%d %H:%M}<br>%{y:.2f}<extra></extra>",
        ), row=1, col=1)

    if pl:
        fig.add_trace(go.Scatter(
            x=[p["ts"] for p in pl],
            y=[p["price"] for p in pl],
            mode="markers",
            name="Pivot Low",
            marker=dict(symbol="triangle-up", size=10, color=C_BLUE,
                        line=dict(color=C_BLUE, width=1)),
            hovertemplate="<b>Pivot Low</b><br>%{x|%Y-%m-%d %H:%M}<br>%{y:.2f}<extra></extra>",
        ), row=1, col=1)

    # ── Highlight the 4 structure pivots with a ring ───────────────────────────
    if structure:
        for p in structure["pivots"]:
            ring_color = C_GREEN if p["type"] == "low" else C_RED
            fig.add_trace(go.Scatter(
                x=[p["ts"]],
                y=[p["price"]],
                mode="markers",
                showlegend=False,
                marker=dict(
                    symbol="circle-open",
                    size=20,
                    color=ring_color,
                    line=dict(color=ring_color, width=2.5),
                ),
                hovertemplate=(
                    f"<b>Structure {p['type'].capitalize()}</b>"
                    f"<br>%{{x|%Y-%m-%d %H:%M}}<br>{p['price']:.2f}<extra></extra>"
                ),
            ), row=1, col=1)

        # Fibonacci retracement level on 4H
        fib4h = compute_fib_level(structure["impulse"])
        fig.add_hline(
            y=fib4h,
            line=dict(color=C_ORANGE, width=1.5, dash="dash"),
            row=1, col=1,
            annotation_text=f"  Fib 61.8%: {fib4h:.2f}",
            annotation_font_color=C_ORANGE,
            annotation_position="right",
        )

        # Impulse direction badge
        imp = structure["impulse"]
        arrow = "↑" if imp["end"] > imp["start"] else "↓"
        mid_price = (imp["start"] + imp["end"]) / 2
        fig.add_annotation(
            xref="x domain", yref="y",
            x=0.02, y=mid_price,
            text=f"{arrow} Impulse",
            showarrow=False,
            font=dict(color=C_PURPLE, size=12, family="'Courier New', monospace"),
            bgcolor=C_PANEL,
            bordercolor=C_PURPLE,
            borderwidth=1,
            borderpad=4,
            row=1, col=1,
        )

    # ── 1H candlesticks ───────────────────────────────────────────────────────
    fig.add_trace(_candles(df_1h, "1H", show_legend=False), row=2, col=1)

    if signal:
        fib   = signal["fib_level"]
        entry = signal["entry_price"]
        stop  = signal["stop_loss"]
        tgt   = signal["position"]["target_price"]
        e_ts  = signal["entry_ts"]

        # Horizontal levels
        for y_val, color, label in [
            (fib,   C_ORANGE, f"  Fib: {fib:.2f}"),
            (entry, C_BLUE,   f"  Entry: {entry:.2f}"),
            (stop,  C_RED,    f"  Stop: {stop:.2f}"),
            (tgt,   C_GREEN,  f"  Target: {tgt:.2f}"),
        ]:
            is_dashed = y_val in (fib, stop, tgt)
            fig.add_hline(
                y=y_val,
                line=dict(color=color, width=1.5 if y_val != fib else 1,
                          dash="dot" if is_dashed else "solid"),
                row=2, col=1,
                annotation_text=label,
                annotation_font_color=color,
                annotation_position="right",
            )

        # Entry signal star
        fig.add_trace(go.Scatter(
            x=[e_ts],
            y=[entry],
            mode="markers",
            name="Entry Signal",
            marker=dict(
                symbol="star",
                size=20,
                color=C_BLUE,
                line=dict(color="white", width=1),
            ),
            hovertemplate=f"<b>Entry Signal</b><br>%{{x|%Y-%m-%d %H:%M}}<br>{entry:.4f}<extra></extra>",
        ), row=2, col=1)

        # Shaded risk zone between stop and entry
        fig.add_hrect(
            y0=min(stop, entry),
            y1=max(stop, entry),
            fillcolor=C_RED,
            opacity=0.07,
            line_width=0,
            row=2, col=1,
        )
        # Shaded reward zone between entry and target
        fig.add_hrect(
            y0=min(entry, tgt),
            y1=max(entry, tgt),
            fillcolor=C_GREEN,
            opacity=0.07,
            line_width=0,
            row=2, col=1,
        )

    # ── Global layout ─────────────────────────────────────────────────────────
    fig.update_layout(
        paper_bgcolor=C_BG,
        plot_bgcolor=C_PANEL,
        font=dict(color=C_TEXT, family="'Courier New', Courier, monospace", size=12),
        legend=dict(
            bgcolor=C_PANEL,
            bordercolor=C_BORDER,
            borderwidth=1,
            x=0, y=1.0,
            orientation="h",
            yanchor="bottom",
        ),
        margin=dict(l=70, r=140, t=60, b=20),
        dragmode="pan",
        hovermode="x unified",
        hoverlabel=dict(bgcolor=C_PANEL, bordercolor=C_BORDER, font_color=C_TEXT),
        xaxis_rangeslider_visible=False,
        xaxis2_rangeslider_visible=False,
    )
    fig.update_xaxes(gridcolor="#21262d", linecolor=C_BORDER, zerolinecolor=C_BORDER, showgrid=True)
    fig.update_yaxes(gridcolor="#21262d", linecolor=C_BORDER, zerolinecolor=C_BORDER, showgrid=True)

    # When aligned, initialise the shared x-range to the 1H window so both
    # charts open on the same overlapping time period.
    if align_scales and not df_1h.empty:
        fig.update_xaxes(
            range=[df_1h.index[0], df_1h.index[-1]],
            row=1, col=1,
        )

    # Style subplot titles
    for ann in fig.layout.annotations:
        if ann.text and "·" in ann.text:
            ann.font.color = C_MUTED
            ann.font.size = 13

    return fig


# ── Candlestick helper ────────────────────────────────────────────────────────
def _candles(df: pd.DataFrame, name: str, show_legend: bool = True) -> go.Candlestick:
    return go.Candlestick(
        x=df.index,
        open=df["open"],
        high=df["high"],
        low=df["low"],
        close=df["close"],
        name=name,
        increasing=dict(line=dict(color=C_GREEN, width=1), fillcolor=C_GREEN),
        decreasing=dict(line=dict(color=C_RED,   width=1), fillcolor=C_RED),
        showlegend=show_legend,
        hovertext=[
            f"O: {o:.2f}  H: {h:.2f}  L: {l:.2f}  C: {c:.2f}"
            for o, h, l, c in zip(df["open"], df["high"], df["low"], df["close"])
        ],
    )

# ── All-signals scan table ──────────────────────────────────────────────────

def _scan_table(records: list) -> html.Div:
    """Render scan_all_symbols() results as a styled summary table."""
    if not records:
        return html.P("No results.", style={"color": C_MUTED, "fontSize": "13px"})

    _COLS = ["Symbol", "Status", "Direction", "Price",
             "Entry", "Stop", "Target", "Fib 61.8%", "R:R", "Entry TS"]

    def _th(text: str, i: int) -> html.Th:
        return html.Th(text, style={
            "padding": "8px 14px",
            "backgroundColor": C_PANEL,
            "color": C_MUTED,
            "textAlign": "left" if i < 2 else "right",
            "fontSize": "11px",
            "textTransform": "uppercase",
            "letterSpacing": "0.5px",
            "borderBottom": f"1px solid {C_BORDER}",
            "whiteSpace": "nowrap",
        })

    def _td(text: str, color: str = C_TEXT, bold: bool = False,
            align: str = "right") -> html.Td:
        return html.Td(str(text), style={
            "padding": "9px 14px",
            "color": color,
            "fontWeight": "700" if bold else "normal",
            "textAlign": align,
            "borderBottom": f"1px solid {C_BORDER}",
            "fontSize": "13px",
            "whiteSpace": "nowrap",
        })

    thead = html.Thead(html.Tr([_th(c, i) for i, c in enumerate(_COLS)]))
    rows: list = []

    for r in records:
        sym   = r["symbol"]
        price = r.get("latest_price")
        sig   = r.get("signal")
        err   = r.get("error")
        scanned = str(r.get("scanned_at", ""))[:19]

        if err:
            rows.append(html.Tr([
                _td(sym, C_TEXT, bold=True, align="left"),
                html.Td(f"❌  {err[:70]}", colSpan=9, style={
                    "padding": "9px 14px", "color": C_RED,
                    "fontSize": "12px",
                    "borderBottom": f"1px solid {C_BORDER}",
                }),
            ]))
        elif sig is None:
            p = f"{price:.2f}" if price is not None else "—"
            rows.append(html.Tr([
                _td(sym,             C_TEXT, bold=True, align="left"),
                _td("⚪  No Signal",  C_MUTED, align="left"),
                _td("—",             C_MUTED),
                _td(p,               C_TEXT),
                *[_td("—",           C_MUTED) for _ in range(6)],
            ]))
        else:
            direction = sig["direction"].upper()
            dc        = C_GREEN if sig["direction"] == "bull" else C_RED
            pos       = sig["position"]
            rr        = sig.get("RR") or 0.0
            rr_color  = C_GREEN if rr >= 2 else (C_ORANGE if rr >= 1 else C_RED)
            p         = f"{price:.2f}" if price is not None else "—"
            ets       = str(sig.get("entry_ts", ""))[:16]
            icon      = "🐂" if direction == "BULL" else "🐻"
            rows.append(html.Tr([
                _td(sym,                          C_TEXT, bold=True, align="left"),
                _td("✅  SIGNAL",                 dc,     bold=True, align="left"),
                _td(f"{icon}  {direction}",       dc),
                _td(p,                            C_TEXT),
                _td(f"{sig['entry_price']:.4f}",  C_BLUE),
                _td(f"{sig['stop_loss']:.4f}",    C_RED),
                _td(f"{pos['target_price']:.4f}", C_GREEN),
                _td(f"{sig['fib_level']:.4f}",    C_ORANGE),
                _td(f"1 : {rr:.2f}",             rr_color),
                _td(ets,                          C_MUTED, align="left"),
            ]))

    n_active = sum(1 for r in records if r.get("signal"))
    n_err    = sum(1 for r in records if r.get("error"))

    return html.Div([
        html.Div(style={"overflowX": "auto"}, children=[
            html.Table(
                [thead, html.Tbody(rows)],
                style={
                    "width": "100%",
                    "borderCollapse": "collapse",
                    "backgroundColor": C_BG,
                    "border": f"1px solid {C_BORDER}",
                    "borderRadius": "8px",
                    "fontFamily": "'Courier New', Courier, monospace",
                },
            ),
        ]),
        html.P(
            f"{len(records)} symbol(s) scanned  ·  "
            f"{n_active} active signal(s)  ·  {n_err} error(s)",
            style={"color": C_MUTED, "fontSize": "12px", "marginTop": "10px"},
        ),
    ])

# ── Signal summary panel ──────────────────────────────────────────────────────
def _signal_panel(signal) -> html.Div:
    if signal is None:
        return html.Div(
            "⚠  No qualifying signal — no 4H structure match or 1H Fibonacci entry found.",
            style={
                "color": C_MUTED,
                "fontSize": "13px",
                "padding": "16px 20px",
                "backgroundColor": C_PANEL,
                "borderRadius": "8px",
                "border": f"1px solid {C_BORDER}",
            },
        )

    dir_color = C_GREEN if signal["direction"] == "bull" else C_RED
    dir_icon  = "🐂" if signal["direction"] == "bull" else "🐻"
    pos       = signal["position"]
    rr        = signal.get("RR") or 0.0
    e_ts      = str(signal["entry_ts"])[:19]

    return html.Div([
        html.Div([
            html.Span(
                f"{dir_icon}  {signal['direction'].upper()} SIGNAL",
                style={"color": dir_color, "fontWeight": "700", "fontSize": "17px"},
            ),
        ], style={"marginBottom": "14px"}),

        html.Div(
            style={"display": "grid", "gridTemplateColumns": "repeat(4, 1fr)", "gap": "10px"},
            children=[
                _kv("Direction",  signal["direction"].capitalize(), dir_color),
                _kv("Entry",      f"{signal['entry_price']:.4f}",   C_BLUE),
                _kv("Stop Loss",  f"{signal['stop_loss']:.4f}",     C_RED),
                _kv("Target",     f"{pos['target_price']:.4f}",     C_GREEN),
                _kv("Fib Level",  f"{signal['fib_level']:.4f}",     C_ORANGE),
                _kv("Risk $",     f"${pos['risk_amount']:.2f}",     C_TEXT),
                _kv("Qty",        f"{pos['quantity']:.6f}",         C_TEXT),
                _kv("R : R",      f"1 : {rr:.2f}",
                    C_GREEN if rr >= 2 else C_ORANGE if rr >= 1 else C_RED),
            ],
        ),

        html.Div(
            f"⏱  Entry confirmed at  {e_ts}",
            style={"marginTop": "12px", "color": C_MUTED, "fontSize": "12px"},
        ),
    ], style={
        "backgroundColor": C_PANEL,
        "border": f"1px solid {C_BORDER}",
        "borderRadius": "8px",
        "padding": "18px 20px",
    })


def _kv(label: str, value: str, color: str = C_TEXT) -> html.Div:
    return html.Div([
        html.Div(label, style={
            "color": C_MUTED,
            "fontSize": "10px",
            "marginBottom": "4px",
            "textTransform": "uppercase",
            "letterSpacing": "0.6px",
        }),
        html.Div(value, style={"color": color, "fontWeight": "bold", "fontSize": "14px"}),
    ], style={
        "backgroundColor": C_BG,
        "border": f"1px solid {C_BORDER}",
        "borderRadius": "6px",
        "padding": "10px 14px",
    })


# ── Entry point ───────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(description="Trading Rules GUI (Dash)")
    ap.add_argument("--port",       type=int, default=8050, help="Port to serve on (default: 8050)")
    ap.add_argument("--no-browser", action="store_true",    help="Do not open browser automatically")
    args = ap.parse_args()

    if not args.no_browser:
        url = f"http://127.0.0.1:{args.port}"
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    print(f"\n  🚀  Trading Rules GUI  →  http://127.0.0.1:{args.port}\n")
    app.run(host="0.0.0.0", port=args.port, debug=False)


if __name__ == "__main__":
    main()
