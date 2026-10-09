# ScholarNaut: Publication Explorer

- Explore an interactive map of research themes and connections over time.
- Fetches data from Google Scholar profiles, stores locally, and produces interactive visualizations.
- Demo hosted [here](https://tjards.github.io/scholarnaut/).

## Setup

**Requirements:** Python 3.10+

### 1. Install
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Run 
```bash
python app.py
```

### 4. View
Open **http://127.0.0.1:8000** in browser.

## Static vs Server Modes

- Edit **`web/config.js`** to toggle between `static` and `server` modes.
- *Static* mode pulls from a locally cached Google Scholar profile.
- *Server* mode fetches data from a user-defined profile using a backend server. 
- To generate a standalone HTML/JS/CSS site in `dist/` that doesn't require the Python backend, export static snapshot for deployment:

```bash
python scripts/export_static.py --output dist
```


