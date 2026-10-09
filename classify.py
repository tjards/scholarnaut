"""

Lightweight auto-tagging; explicitly editable and not claimed as authoritative.

Note: expand to include more metadata (e.g., abstract, venue, year) for better classification. 
Currently only uses title and keywords.
Consider autoclassification with clustering, embedding-based methods, etc.

"""
from __future__ import annotations
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
AREAS_PATH = ROOT / "config" / "areas.json"


def read_areas() -> list[dict]:
    return json.loads(AREAS_PATH.read_text(encoding="utf-8"))


def classify(paper: dict, areas: list[dict]) -> list[str]:
    allowed = {a["id"] for a in areas}
    # Deliberately use title only; venue text tends to introduce unrelated topics.
    title = paper.get("title", "").lower()
    ranked = []
    for area in areas:
        hits = sum(bool(re.search(r"(?<!\w)" + re.escape(k.lower()) + r"(?!\w)", title)) for k in area["keywords"])
        if hits:
            ranked.append((hits, area["id"]))
    ranked.sort(key=lambda x: -x[0])
    return [area_id for _, area_id in ranked[:3]] or ["robotics"]


def decorate(items: list[dict], areas: list[dict] | None = None) -> list[dict]:
    areas = areas or read_areas()
    return [{**p, "areas": classify(p, areas)} for p in items]
