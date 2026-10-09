#!/bin/bash
# On macOS, double-click this file (or run ./start.command from Terminal).
set -e
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.10+ is required. Visit https://www.python.org/downloads/"
  read -r -p "Press Enter to close..."
  exit 1
fi
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install -r requirements.txt
if command -v open >/dev/null 2>&1; then
  (sleep 2 && open 'http://127.0.0.1:8000') &
fi
echo 'ScholarNaut: http://127.0.0.1:8000'
echo 'Press Ctrl-C to stop.'
python app.py
