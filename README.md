# Tadasana Pose Analysis

A web app that analyzes Tadasana (Mountain Pose, arms-overhead variant) using
MediaPipe BlazePose and a rule-based scoring engine. Three input methods:

1. **Upload Video** - upload a pre-recorded video file
2. **Upload Photo** - upload a photo
3. **Record Video** - record live in the browser (uses MediaRecorder API,
   no third-party API key needed)

Built with **Flask** (no Streamlit dependency).

## Project structure

```
tadasana-app/
├── app.py                      # Flask web app
├── requirements.txt            # Python dependencies
├── render.yaml                 # Render deployment config
├── .python-version             # Python 3.10.14
├── .gitignore
├── README.md
├── src/                        # Core pose-analysis logic (unchanged from Streamlit version)
│   ├── __init__.py
│   ├── pose_detector.py        # MediaPipe wrapper
│   ├── pose_analyzer.py        # Frame loop + features + visibility rules
│   ├── scorer.py               # 6-step Tadasana rule engine
│   └── feedback.py             # Gemini / rule-based coaching feedback
├── templates/                  # Jinja2 HTML
│   ├── base.html
│   ├── index.html              # Upload + record page
│   └── result.html             # 6-step results dashboard
└── static/
    ├── css/styles.css          # Dark theme
    └── js/
        ├── recorder.js         # MediaRecorder API integration
        └── main.js             # Tab switching, form submission
```

## Scoring rules (6 steps)

| # | Step | Weight | What it measures |
|---|------|--------|------------------|
| 1 | Stance | 10% | Feet together or hip-width |
| 2 | Body Balance | 15% | Weight evenly distributed |
| 3 | Legs & Knees | 20% | Straight but not locked |
| 4 | Spine | 20% | Vertical alignment |
| 5 | Shoulders & Arms | 25% | Arms raised overhead, elbows straight |
| 6 | Head & Neck | 10% | Head balanced, gaze forward |

### Key rules

- **Visibility-zero rule**: If a body part needed for a step isn't visible
  (visibility < 0.5), that step scores 0 with a "not visible" message.
- **Compound penalties**: Multiple very-bad steps reduce the final score.
- **Hard caps**: Worst step below 15 caps total at 45.

## Running locally

```bash
python3.10 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY=your_key_here  # optional
python app.py
# Open http://localhost:5000
```

## Deploying to Render

1. Push this directory as a GitHub repo.
2. In Render: **New +** -> **Web Service** -> connect your repo.
3. Render reads `render.yaml` automatically.
4. In **Environment**, set `GEMINI_API_KEY` (optional - rule-based feedback used otherwise).
5. Build takes ~5-8 minutes first time.

## Browser requirements

- **Upload Video / Photo**: any modern browser
- **Record Video**: requires HTTPS (Render provides this), camera permission,
  Chrome / Firefox / Safari / Edge (iOS Safari 14.3+)

## What changed from the Streamlit version

Same core scoring/analysis logic - only the web framework changed:

- `app.py` is now a Flask app instead of Streamlit
- New `templates/` directory with Jinja2 HTML
- New `static/` directory with custom CSS and JS
- `static/js/recorder.js` adds in-browser video recording (no third-party API)

The pose-analysis logic in `src/` is **byte-for-byte identical** to the Streamlit version.
