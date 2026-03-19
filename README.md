# 🎯 Job Pusher

Automated job opportunity matcher for **Albury/Wodonga region, Vline corridor, and Melbourne**.

Scrapes jobs daily from **LinkedIn, Indeed, and Seek**, scores them against your CV using **Google Gemini AI**, and presents them in a clean web dashboard with match percentages.

---

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                        PIPELINE                             │
│                                                             │
│  1. SCRAPE          2. KEYWORD FILTER    3. AI SCORING      │
│  LinkedIn/Indeed ──► Fast keyword match ──► Gemini scores  │
│  via JobSpy         (no API cost)          each job 0-100  │
│  Seek.com.au ──────►                                        │
│                                                             │
│  4. EXPORT          5. VIEW                                 │
│  jobs.json ────────► Web UI (browser)                       │
│  Google Sheets (optional)                                   │
└─────────────────────────────────────────────────────────────┘
```

**Locations covered:**
- Albury NSW (76km radius): Wodonga, Wangaratta, Benalla, Corowa, Yarrawonga, Beechworth, Myrtleford, Chiltern, Rutherglen, Bright
- Vline corridor: Seymour → Benalla → Wangaratta → Wodonga → Albury
- Melbourne CBD and metro

---

## Quick Start

### 1. Clone & Install

```bash
git clone <your-repo>
cd jobpusher

# Create a virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Set Up Your CV

Edit `cv_bank/profile.md` with your:
- Professional summary
- Skills and competencies
- Work experience
- Education and certifications
- Target job titles and keywords

This is the **most important step** — the better your CV bank, the more accurate the matching.

### 3. Configure

Edit `config.yaml`:

```yaml
search:
  job_titles:
    - "Project Manager"
    - "Business Analyst"
    # Add your target job titles

  keywords:
    - "Agile"
    - "Stakeholder Management"
    # Add your key skills

matching:
  default_min_score: 65  # Show jobs with 65%+ match
```

### 4. Get a Free Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Create API key"**
4. Copy the key

### 5. Set Environment Variables

```bash
cp .env.example .env
# Edit .env and paste your Gemini API key:
# GEMINI_API_KEY=your_key_here
```

### 6. Run the Pipeline

```bash
python run_pipeline.py
```

**Options:**
```bash
python run_pipeline.py --no-ai          # Scrape only (no Gemini, uses keyword score)
python run_pipeline.py --min-score 70   # Override minimum match score
python run_pipeline.py --schedule       # Run daily at 7am (leave running)
```

### 7. View Results

```bash
# Serve the web UI locally
python -m http.server 8080

# Then open in your browser:
# http://localhost:8080/web/
```

---

## Web UI Features

| Feature | Description |
|---------|-------------|
| **Match Score Slider** | Drag to filter jobs by AI match % (e.g. 65%+) |
| **Region Tabs** | Filter by Albury Region / Vline Corridor / Melbourne / Remote |
| **Source Filter** | Show only LinkedIn / Indeed / Seek jobs |
| **Search** | Search by title, company, or keywords |
| **Job Cards** | Shows match %, company, location, matched skills |
| **Click to Expand** | Full job description in a modal |
| **Copy JD** | One-click copy of full job description |
| **Apply Button** | Direct link to apply on the source site |

---

## Automated Daily Scraping (GitHub Actions)

To run the pipeline automatically every day at 7am AEDT:

1. Push this repo to GitHub
2. Go to **Settings → Secrets and variables → Actions**
3. Add secrets:
   - `GEMINI_API_KEY` — your Gemini API key
   - `GOOGLE_SHEETS_ID` — (optional) your spreadsheet ID
4. The workflow in `.github/workflows/daily_scrape.yml` runs automatically

You can also trigger it manually from the **Actions** tab.

---

## Google Sheets Integration (Optional)

To sync jobs to a Google Spreadsheet:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project
3. Enable **Google Sheets API** and **Google Drive API**
4. Create a **Service Account** (IAM → Service Accounts)
5. Create and download a **JSON key** (save as `credentials.json` in the project root)
6. Create a Google Spreadsheet
7. **Share** it with the service account email (Editor access)
8. Copy the spreadsheet ID from the URL and add to `.env`:
   ```
   GOOGLE_SHEETS_ID=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
   ```

The pipeline will automatically create two tabs:
- **Raw Jobs** — all scraped jobs
- **Matched Jobs** — AI-scored jobs above your threshold

---

## Manual Workflow (Alternative)

If you prefer to run scrapers manually and review in Google Sheets:

1. **Run scrapers** and export CSV:
   ```bash
   python run_pipeline.py --no-ai
   # Output: output/raw_jobs_YYYYMMDD.csv
   ```

2. **Paste CSV into Google Sheets** (File → Import)

3. **Use the prompt template** to manually score in Claude or Gemini:
   ```python
   from matching.gemini_matcher import generate_cv_prompt_template
   from matching.keyword_filter import load_cv_text

   cv = load_cv_text("cv_bank/profile.md")
   print(generate_cv_prompt_template(cv))
   ```
   Copy the output, paste a JD at the bottom, and send to Claude/Gemini.

---

## Project Structure

```
jobpusher/
├── scrapers/
│   ├── jobspy_scraper.py      # LinkedIn + Indeed (via JobSpy)
│   ├── seek_scraper.py        # Seek.com.au
│   └── locations.py           # Location definitions
├── matching/
│   ├── keyword_filter.py      # Fast keyword pre-filter
│   └── gemini_matcher.py      # Gemini AI scoring
├── sheets/
│   └── sheets_client.py       # Google Sheets sync
├── web/
│   ├── index.html             # Job board UI
│   ├── styles.css
│   └── app.js
├── cv_bank/
│   └── profile.md             # ← Fill this in!
├── output/
│   └── jobs.json              # Generated by pipeline
├── .github/workflows/
│   └── daily_scrape.yml       # GitHub Actions automation
├── config.yaml                # ← Configure your search here
├── .env.example               # Copy to .env with your keys
├── requirements.txt
└── run_pipeline.py            # Main entry point
```

---

## Score Guide

| Score | Colour | Meaning |
|-------|--------|---------|
| 85–100% | 🟢 Green | Excellent match — apply now |
| 70–84%  | 🔵 Blue | Strong match — worth applying |
| 55–69%  | 🟠 Orange | Moderate match — consider |
| 0–54%   | ⚫ Gray | Poor match — likely not suitable |

---

## API & Rate Limits

**Gemini Free Tier (gemini-1.5-flash):**
- 15 requests/minute
- 1,500 requests/day
- The keyword pre-filter reduces calls significantly

**JobSpy (LinkedIn/Indeed):**
- No API key required
- Uses proxies if provided to avoid rate limits

**Seek:**
- No API key required
- Built-in 1.5s delay between requests

---

## Troubleshooting

**"No jobs found"**
- Check your internet connection
- LinkedIn/Indeed may be rate limiting — try adding proxies in `.env`
- Try running with `--no-ai` first to check scraping works

**"CV file is empty"**
- Fill in `cv_bank/profile.md` with your real details

**"Gemini quota exceeded"**
- You've hit the 1,500/day free limit
- Wait until tomorrow, or upgrade to a paid tier
- Use `--no-ai` flag to skip scoring

**Web UI shows no data**
- Make sure you're serving with `python -m http.server 8080`
- Don't open `index.html` directly from the filesystem (CORS)
- Check `output/jobs.json` exists

---

## Tips for Better Matches

1. **Be specific in your CV** — include exact skill names, tool names, methodologies
2. **List all job titles** you'd consider in `config.yaml`
3. **Keyword filter** is your friend — add domain-specific terms
4. **Lower the threshold** (50-60%) to see more options if too few results
5. **Run daily** — regional jobs move fast and may expire in days
