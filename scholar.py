"""Conservative public Google Scholar *profile page* fetcher.

No undocumented API key, CAPTCHA bypass, proxy rotation, or authentication.
The Google Scholar HTML may change and access may be rate-limited or blocked.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from urllib.parse import parse_qs, urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

BASE_URL = "https://scholar.google.com/citations"
USER_RE = re.compile(r"^[A-Za-z0-9_-]{8,40}$")


@dataclass
class ScholarError(Exception):
    message: str
    status_code: int | None = None

    def __str__(self) -> str:
        return self.message


def _text(node) -> str:
    return node.get_text(" ", strip=True) if node else ""


def parse_profile_page(html: str, profile_user: str) -> tuple[str | None, list[dict]]:
    """Extract publication rows from a Scholar author profile HTML page."""
    soup = BeautifulSoup(html, "html.parser")
    name = _text(soup.select_one("#gsc_prf_in")) or None
    rows = soup.select("tr.gsc_a_tr")
    papers = []
    for row in rows:
        link = row.select_one("a.gsc_a_at")
        if not link:
            continue
        title = _text(link)
        href = link.get("href", "")
        query = parse_qs(urlparse(href).query)
        view_id = query.get("citation_for_view", [""])[0]
        if not view_id:
            # A stable fallback for unusual layouts; avoid depending on title alone.
            view_id = f"{profile_user}:{len(papers)}:{title[:24]}"
        year_string = _text(row.select_one(".gsc_a_y span"))
        year = int(year_string) if year_string.isdigit() and len(year_string) == 4 else None
        grays = row.select(".gs_gray")
        authors = _text(grays[0]) if grays else ""
        venue = _text(grays[1]) if len(grays) > 1 else ""
        cites_node = row.select_one(".gsc_a_c a")
        cites_text = _text(cites_node)
        citations = int(cites_text.replace(",", "")) if cites_text.replace(",", "").isdigit() else 0
        papers.append({
            "id": view_id,
            "title": title,
            "year": year,
            "authors": authors,
            "venue": venue,
            "citations": citations,
            "url": urljoin("https://scholar.google.com", href) if href else f"{BASE_URL}?user={profile_user}",
            "abstract": "",
            "areas": [],
        })
    return name, papers


def fetch_profile(
    user: str,
    *,
    max_pages: int = 5,
    pause_seconds: float = 2.5,
    client: httpx.Client | None = None,
) -> dict:
    if not USER_RE.fullmatch(user):
        raise ValueError("Invalid Google Scholar profile user ID")
    if not 1 <= max_pages <= 20:
        raise ValueError("max_pages must be between 1 and 20")
    owned_client = client is None
    if client is None:
        client = httpx.Client(
            timeout=14,
            follow_redirects=True,
            headers={
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
    try:
        papers_by_id: dict[str, dict] = {}
        name = None
        for page in range(max_pages):
            if page:
                time.sleep(pause_seconds)
            try:
                response = client.get(BASE_URL, params={
                    "user": user, "hl": "en", "cstart": page * 100, "pagesize": 100,
                })
            except httpx.RequestError as exc:
                raise ScholarError(f"Could not contact Google Scholar: {exc}") from exc
            if response.status_code in (403, 429):
                raise ScholarError(
                    f"Google Scholar refused access (HTTP {response.status_code}). "
                    "Wait and retry later; cached publications remain available.",
                    response.status_code,
                )
            if response.status_code != 200:
                raise ScholarError(f"Google Scholar returned HTTP {response.status_code}.", response.status_code)
            html = response.text
            if any(marker in html.lower() for marker in ("unusual traffic", "not a robot", "recaptcha")):
                raise ScholarError("Google Scholar presented a traffic/CAPTCHA challenge. No bypass attempted.")
            parsed_name, papers = parse_profile_page(html, user)
            name = name or parsed_name
            if page == 0 and not papers:
                raise ScholarError(
                    "No publication rows were found. Scholar may be blocking access or may have changed its page layout."
                )
            for item in papers:
                papers_by_id[item["id"]] = item
            if len(papers) < 100:
                break
        
        return {
            "profile_name": name or "Google Scholar author",
            "publications": list(papers_by_id.values()),
        }
    finally:
        if owned_client:
            client.close()
