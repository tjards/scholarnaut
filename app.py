"""
ScholarNaut web server
"""
# Configuration and imports
from __future__ import annotations

import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from classify import decorate, read_areas
from scholar import ScholarError, fetch_profile, USER_RE

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PUBLICATIONS_CACHE = ROOT / "data" / "publications.json"

# Initialize Scholar user from environment or use default
_scholar_user = os.getenv("SCHOLAR_USER", "RGlv4ZUAAAAJ").strip()
if not USER_RE.fullmatch(_scholar_user):
    raise ValueError("SCHOLAR_USER must be a valid Google Scholar profile ID")

CACHE_TTL_SECONDS = 24 * 60 * 60
COOLDOWN_SECONDS = 60  # 1 minute cooldown

app = FastAPI(title="ScholarNaut", version="0.1.0")
app.mount("/assets", StaticFiles(directory=WEB / "assets"), name="assets")

_lock = threading.RLock()
_state = {"refreshing": False, "last_attempt": 0.0, "error": None}


# Cache and data utilities
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_cache() -> dict | None:
    if not PUBLICATIONS_CACHE.exists():
        return None
    try:
        data = json.loads(PUBLICATIONS_CACHE.read_text(encoding="utf-8"))
        if isinstance(data.get("publications"), list):
            return data
    except (ValueError, OSError):
        pass
    return None


def save_cache(data: dict) -> None:
    PUBLICATIONS_CACHE.parent.mkdir(parents=True, exist_ok=True)
    temp = PUBLICATIONS_CACHE.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temp.replace(PUBLICATIONS_CACHE)


# Background Scholar fetching
def _fetch_worker() -> None:
    try:
        with _lock:
            scholar_user = _scholar_user
            profile_url = f"https://scholar.google.com/citations?user={scholar_user}&hl=en"
        result = fetch_profile(scholar_user)
        # Never overwrite good data with an unexpected empty/partial error response.
        if not result["publications"]:
            raise ScholarError("Scholar returned no publications; existing cache was preserved.")
        # Decorate publications with areas before saving to cache
        decorated_publications = decorate(result["publications"])
        save_cache({**result, "publications": decorated_publications, "fetched_at": now_iso(), "profile_url": profile_url})
        with _lock:
            _state["error"] = None
    except (ScholarError, Exception) as exc:
        with _lock:
            _state["error"] = str(exc)
    finally:
        with _lock:
            _state["refreshing"] = False


# Refresh control
def start_refresh() -> bool:
    with _lock:
        if _state["refreshing"]:
            return False
        if COOLDOWN_SECONDS > 0 and (time.monotonic() - _state["last_attempt"]) < COOLDOWN_SECONDS:
            return False
        _state["refreshing"] = True
        _state["last_attempt"] = time.monotonic()
        _state["error"] = None
    threading.Thread(target=_fetch_worker, name="scholar-refresh", daemon=True).start()
    return True


# Build complete API response
def build_payload(*, auto_refresh: bool = True, auto_fetch_on_empty: bool = False) -> dict:
    cache = read_cache()
    if not cache:
        if auto_fetch_on_empty:
            start_refresh()
            with _lock:
                scholar_user = _scholar_user
            profile_url = f"https://scholar.google.com/citations?user={scholar_user}&hl=en"
            return {
                "profile_name": "ScholarNaut",
                "profile_url": profile_url,
                "publications": [],
                "areas": read_areas(),
                "fetched_at": None,
                "editable": True,
                "status": {
                    "refreshing": True,
                    "error": "Fetching Scholar profile...",
                    "cooldown_seconds": 0,
                },
            }
        raise RuntimeError("No Scholar data cached. Run the app and wait for Scholar to fetch, or manually sync.")
    stale = time.time() - PUBLICATIONS_CACHE.stat().st_mtime > CACHE_TTL_SECONDS
    if auto_refresh and stale:
        start_refresh()
    with _lock:
        scholar_user = _scholar_user
        status = {
            "refreshing": _state["refreshing"],
            "error": _state["error"],
            "cooldown_seconds": max(0, round(COOLDOWN_SECONDS - (time.monotonic() - _state["last_attempt"])))
            if _state["last_attempt"] else 0,
        }
    profile_url = f"https://scholar.google.com/citations?user={scholar_user}&hl=en"
    return {
        "profile_name": cache.get("profile_name", "ScholarNaut"),
        "profile_url": profile_url,
        "publications": cache.get("publications", []),
        "areas": read_areas(),
        "fetched_at": cache.get("fetched_at"),
        "editable": True,
        "status": status,
    }


# Static routes and page serving
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(WEB / "index.html")


@app.get("/data/publications.json", include_in_schema=False)
def static_publications():
    """Serve the full payload in static mode."""
    return build_payload()


@app.get("/config.js", include_in_schema=False)
def config_js():
    return FileResponse(WEB / "config.js", media_type="text/javascript")

# Scholar refresh endpoint

# Publications API
@app.get("/api/publications")
def publications():
    return build_payload(auto_fetch_on_empty=True)


@app.post("/api/refresh")
def refresh():
    started = start_refresh()
    if not started:
        return JSONResponse({"started": False, "message": "Already refreshing or within the 15-minute request cooldown."}, status_code=429)
    return {"started": True, "message": "Fetching Scholar profile in background."}


# Scholar profile management
class ScholarIdRequest(BaseModel):
    scholar_id: str


@app.post("/api/set-scholar-id")
def set_scholar_id(req: ScholarIdRequest, request: Request):
    # This is a local editing tool with no authentication. Don't expose it to the Internet.
    if not request.client or request.client.host not in ("127.0.0.1", "::1", "localhost", "testclient"):
        raise HTTPException(403, "Scholar profile editing is only available locally.")
    
    scholar_id = req.scholar_id.strip()
    if not USER_RE.fullmatch(scholar_id):
        raise HTTPException(400, "Invalid Google Scholar ID format. Expected format: RGlv4ZUAAAAJ")
    
    global _scholar_user
    with _lock:
        _scholar_user = scholar_id
        _state["error"] = None
        _state["last_attempt"] = 0.0  # Reset cooldown for new profile
    
    # Start fetching the new profile (keep old cache available during transition)
    start_refresh()
    return {"message": f"Loading Scholar profile: {scholar_id}"}


# Area classification endpoint
class AreaSelection(BaseModel):
    paper_id: str
    areas: list[str]


@app.post("/api/areas")
def save_area_selection(selection: AreaSelection, request: Request):
    # This is a local editing tool with no authentication. Don't expose it to the Internet.
    if not request.client or request.client.host not in ("127.0.0.1", "::1", "localhost", "testclient"):
        raise HTTPException(403, "Classification editing is only available locally.")
    payload = build_payload(auto_refresh=False)
    valid_ids = {paper["id"] for paper in payload["publications"]}
    allowed = {area["id"] for area in payload["areas"]}
    if selection.paper_id not in valid_ids:
        raise HTTPException(404, "Publication not found")
    if not set(selection.areas).issubset(allowed):
        raise HTTPException(400, "Unknown research area")
    if len(selection.areas) != len(set(selection.areas)):
        raise HTTPException(400, "Duplicate research area")
    with _lock:
        # Update the publication directly in the cache
        cache = read_cache()
        if cache:
            for paper in cache["publications"]:
                if paper["id"] == selection.paper_id:
                    paper["areas"] = selection.areas
                    save_cache(cache)
                    break
    return {"saved": True, "paper_id": selection.paper_id, "areas": selection.areas}


# Data export
@app.get("/api/export")
def export_publications():
    cache = read_cache()
    if not cache:
        raise HTTPException(404, "No Scholar data cached yet.")
    return JSONResponse(cache, headers={
        "Content-Disposition": 'attachment; filename="scholar-publications.json"'
    })


# Server startup
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8000")))
