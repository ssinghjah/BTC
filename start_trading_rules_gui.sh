#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON="$SCRIPT_DIR/.venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
    echo "❌  Virtual environment not found at .venv/"
    echo "    Run: python -m venv .venv && .venv/bin/pip install -r backend/trading_rules/requirements.txt"
    exit 1
fi

echo "🚀  Starting Trading Rules GUI…"
exec "$PYTHON" -m backend.trading_rules.gui "$@"
