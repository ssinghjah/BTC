#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔧  Setting up Trading Rules environment…"

# ── Create virtual environment ────────────────────────────────────────────────
if [[ ! -d ".venv" ]]; then
    echo "📦  Creating virtual environment…"
    python3 -m venv .venv
else
    echo "✅  Virtual environment already exists, skipping creation."
fi

PYTHON=".venv/bin/python"

# ── Upgrade pip ───────────────────────────────────────────────────────────────
echo "⬆️   Upgrading pip…"
"$PYTHON" -m pip install --upgrade pip --quiet

# ── Install Python dependencies ───────────────────────────────────────────────
echo "📥  Installing Python dependencies…"
"$PYTHON" -m pip install -r backend/trading_rules/requirements.txt

echo ""
echo "✅  Setup complete!"
echo ""
echo "   Start the GUI:    ./start_trading_rules_gui.sh"
echo "   Start the runner: .venv/bin/python -m backend.trading_rules"
