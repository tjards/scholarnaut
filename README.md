# ScholarNaut — Google Scholar publication explorer

A complete, local-first prototype inspired by research-area timelines: each paper appears as one or more colored nodes on a time axis, with faint bridges between areas for interdisciplinary work. It defaults to **Google Scholar profile `RGlv4ZUAAAAJ`**.

**What it does:** Queries the public Google Scholar author-profile HTML directly (server-side), caches results, auto-classifies each paper into research areas, allows local tag corrections, and generates a fully static HTML/JS/CSS edition for Hugo / GitHub Pages.

> **Important:** Google Scholar has no stable, officially supported public profile API. It may reject automated page requests with HTTP 403/429, a CAPTCHA, or layout changes. This tool makes ordinary public-profile requests only. It does not try to evade challenges. **Live fetching cannot be guaranteed**.

## 1. Run locally (macOS / Linux)

Requires Python **3.10+** and internet access when syncing Scholar. There is **no Node/npm build step** and the frontend has **no third-party JS dependencies**.

On macOS, try double-clicking **`start.command`**, or run:

```bash
cd scholar-research-atlas
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:8000** in your browser. The app starts one background Scholar request on the first visit if the cache is missing or more than 24 hours old. On a successful fetch, the app displays your publication metadata. If Scholar blocks the request, the app will show an error and retain your previous cache if available.

A **Refresh Scholar** button is also available. To avoid repeated requests, a **15-minute cooldown** applies after each attempt. Multiple pages are fetched in batches of up to 100, with a short pause between requests (maximum 500 records by default). To stop, use Ctrl-C in Terminal.

To change the Google Scholar profile, set `SCHOLAR_USER` before starting the server:

```bash
SCHOLAR_USER=RGlv4ZUAAAAJ python app.py
```

On Windows, create/activate a Python virtual environment, install `requirements.txt`, and run `python app.py`.

## 2. Use the explorer

- **Timeline:** Hover over colored dots for a preview; click a dot to pin its paper in the right-hand details panel. Vertical lines connect papers tagged across multiple research areas.
- **Search/filter:** Search titles, authors, venues or years. Click research-area chips to highlight a subset. Restrict years via the From/To dropdowns.
- **Index:** Browse publications, sort by year/title/citations, and click a publication to inspect it.
- **Adjust research areas:** Click a paper to pin it, toggle the six research area tags in the right sidebar, then click **Save classification**. Your changes are stored in `data/publications.json` and persist across syncs.
- **Export:** The footer’s **Export data** link downloads a JSON snapshot, but only after a real successful Scholar sync.

Automatic classification is a **heuristic starting point**, not a scholarly claim. Edit `config/areas.json` to rename areas, change colors, or adjust keyword rules. The default categories are sensing, robotics, multi-agent coordination, planning, control, and learning. A publication may belong to multiple categories. Paper metadata come from Scholar’s author listing; this prototype does **not** fetch abstracts or full-text papers.

## 3. Deploy on a Hugo site / GitHub Pages

**GitHub Pages cannot execute a Python backend, and browsers generally cannot fetch Scholar directly because of CORS / anti-bot controls.** The intended production model is to sync on your computer, then publish the static snapshot. Interactions and filters continue to work with no backend.

First obtain a successful local Scholar sync. The resulting raw cache is `data/publications.json` and is excluded from git by default. Then:

```bash
python scripts/export_static.py --output dist
```

Copy the contents of `dist/` into your Hugo repository at, for example:

```text
<your-hugo-repo>/static/research-atlas/
  index.html
  config.js
  data.json
  assets/
    app.js
    style.css
```

After Hugo builds, visit `https://tjards.github.io/research-atlas/` (assuming `tjards.github.io` is the site root). A Hugo page can also embed the published explorer with:

```html
<iframe src="/scholarnaut/" title="Interactive publication explorer"
        style="width:100%;height:1250px;border:0;" loading="lazy"></iframe>
```

To generate a **static export** for Hugo or GitHub Pages:

```bash
python scripts/export_static.py --output dist
```

The sync process does not automatically push changes to GitHub. A later iteration could use a scheduled GitHub Actions job, but such jobs may also encounter Scholar blocking.

## 4. File guide

```text
scholar-research-atlas/
├── app.py                    FastAPI server, cache, refresh, editing API
├── scholar.py                Google Scholar public-profile HTML parser/fetcher
├── classify.py               Keyword area classification
├── config/areas.json         Category names, colors, keyword lists
├── data/publications.json    Cache (created after sync, gitignored)
├── web/index.html            App layout
├── web/config.js             Local-server configuration
├── web/assets/style.css      Responsive styling
├── web/assets/app.js         SVG timeline, search, filtering, inspector
├── scripts/export_static.py  Static export for Hugo/GitHub Pages
├── tests/test_app.py         Mocked parser, API, and error-path tests
├── requirements.txt
├── start.command             macOS launcher
└── README.md
```

## 5. Development checks

```bash
python -m pip install pytest
python -m pytest -q
node --check web/assets/app.js  # optional, requires Node.js
```

The tests **do not contact Google Scholar**. To check a real fetch, run the server on your own machine and inspect the status banner and the resulting `data/publications.json`. Once present, it will continue to work even if Scholar becomes temporarily unavailable.

## Security and respectful use

The local app has an unauthenticated editing endpoint designed for **localhost only**. Run on `127.0.0.1`, not on a public web server. Only public profile data are requested. Respect Scholar's usage restrictions, and do not use aggressive polling, rotating proxies or CAPTCHA-bypass services. To publish publicly, deploy **only the exported `dist/` files**, not the Python server.
