"""Build a static website from a local sync.

Usage:

    python scripts/export_static.py --output dist

Copy dist/ into a static/ (e.g., using Hugo) directory to publish
"""
from __future__ import annotations
import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from classify import read_areas  # noqa: E402


def export(output: Path) -> None:
    source = ROOT / "data" / "publications.json"
    if not source.exists():
        raise RuntimeError("No data cache found. Run the app and refresh first.")
    data = json.loads(source.read_text(encoding="utf-8"))
    output.mkdir(parents=True, exist_ok=True)
    (output / "assets").mkdir(exist_ok=True)
    (output / "data").mkdir(exist_ok=True)
    for asset in ("style.css", "app.js"):
        shutil.copy2(ROOT / "web" / "assets" / asset, output / "assets" / asset)
    shutil.copy2(ROOT / "web" / "index.html", output / "index.html")
    payload = {
        "profile_name": data.get("profile_name", "ScholarNaut"),
        "profile_url": data.get("profile_url", "https://scholar.google.com/citations?user=RGlv4ZUAAAAJ&hl=en"),
        "publications": data["publications"],
        "areas": read_areas(),
        "fetched_at": data.get("fetched_at"),
        "editable": False,
        "status": {"refreshing": False, "error": None, "cooldown_seconds": 0},
    }
    (output / "data" / "publications.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (output / "config.js").write_text('window.ATLAS_MODE = "static";\n', encoding="utf-8")
    print(f"Static explorer written to {output.resolve()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    export(args.output)
