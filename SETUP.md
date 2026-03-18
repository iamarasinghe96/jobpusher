# JobPusher — Setup Guide

## Architecture

```
GitHub Actions (daily 7am AEST)
   └─► scraper/scrape_jobs.py   ← JobSpy (LinkedIn/Indeed) + Seek API
   └─► scraper/push_to_sheets.py ← pushes to Google Sheets

Google Sheets (your hub)
   ├── "Raw Jobs"     ← all scraped jobs land here
   ├── "CV"           ← paste your CV in cell A1
   ├── "Config"       ← threshold, exclude keywords
   └── "Shortlisted"  ← auto-populated by Apps Script

Google Apps Script (inside Sheets)
   └─► Code.gs   ← keyword filter + Gemini scoring + shortlist
```

---

## Step 1 — Google Sheets setup

1. Create a new Google Sheet
2. Note the **Spreadsheet ID** from the URL:
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit`
3. Create a sheet tab named **`CV`** and paste your full CV text in cell **A1**
4. The "Raw Jobs", "Config", and "Shortlisted" tabs are created automatically

---

## Step 2 — Google Service Account (for GitHub Actions to write to Sheets)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable **Google Sheets API** and **Google Drive API**
4. Go to **IAM & Admin → Service Accounts** → Create service account
5. Download the JSON key file
6. **Share your Google Sheet** with the service account email (Editor access)
7. The JSON file contents will become the `GOOGLE_SERVICE_ACCOUNT` secret (see Step 4)

---

## Step 3 — Gemini API Key (free)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key — it's free (Gemini 1.5 Flash: 15 req/min, 1500/day free)

---

## Step 4 — GitHub Secrets

In your repo → **Settings → Secrets and variables → Actions**, add:

| Secret name             | Value                                                        |
|-------------------------|--------------------------------------------------------------|
| `GOOGLE_SHEETS_ID`      | Your spreadsheet ID from the URL                             |
| `GOOGLE_SERVICE_ACCOUNT`| Entire contents of your service account JSON key file        |
| `SEARCH_TERMS`          | Comma-separated, e.g. `data analyst,business analyst,python` |
| `LOCATIONS`             | Comma-separated, e.g. `Melbourne VIC,Sydney NSW,Remote`      |

---

## Step 5 — Apps Script setup

1. In your Google Sheet → **Extensions → Apps Script**
2. Delete any existing code and paste the contents of `apps_script/Code.gs`
3. Click **Save** (disk icon)
4. Go to **Project Settings (⚙️) → Script Properties** → Add:
   - Key: `GEMINI_API_KEY`   Value: your Gemini API key from Step 3
5. Click **Run → onOpen** once to authorise permissions
6. Reload your Google Sheet — you'll see a **JobPusher** menu appear

---

## Step 6 — Configure matching

In the **Config** tab of your sheet (auto-created on first run):

| Key               | Default value                                     | Notes                              |
|-------------------|---------------------------------------------------|------------------------------------|
| `match_threshold` | `60`                                              | Minimum score to shortlist (0-100) |
| `exclude_keywords`| `senior,lead,head of,director,VP`                 | Jobs containing these are skipped  |
| `shortlist_tab`   | `Shortlisted`                                     | Tab name for shortlisted jobs      |

---

## Day-to-day usage

### Automated (recommended)
- GitHub Actions scrapes every day at 7am AEST → new jobs appear in "Raw Jobs"
- In the Sheet, click **JobPusher → Score New Jobs** to AI-score the new rows
- Or run **installDailyTrigger()** in Apps Script once to make scoring automatic too

### Manual test run
```bash
cd scraper
pip install -r requirements.txt
cp .env.example .env   # fill in your values
python push_to_sheets.py
```

`.env` file:
```
GOOGLE_SHEETS_ID=your_sheet_id_here
GOOGLE_SERVICE_ACCOUNT={"type":"service_account",...}   # full JSON on one line
SEARCH_TERMS=data analyst,business analyst
LOCATIONS=Melbourne VIC,Sydney NSW,Remote Australia
```

---

## How keyword pre-filtering works

Before calling Gemini (to save your free quota), the script:
1. Extracts the top ~80 keywords + bigrams from your CV automatically
2. For each job, checks if title+description contains **at least 2** of those keywords
3. Also removes jobs matching your `exclude_keywords` list
4. Only keyword-matched jobs go to Gemini for scoring

This typically reduces Gemini calls by 60-80%.

---

## Sheet columns (Raw Jobs)

| Column          | Description                                        |
|-----------------|----------------------------------------------------|
| scraped_at      | Date job was scraped                               |
| source          | linkedin / indeed / seek                           |
| title           | Job title                                          |
| company         | Company name                                       |
| location        | Location                                           |
| job_type        | Full-time / Part-time / Contract                   |
| salary_min/max  | Salary range (if listed)                           |
| url             | Direct link to job posting                         |
| description     | Job description (truncated to 2000 chars)          |
| keyword_match   | YES/NO — passed keyword pre-filter?                |
| gemini_score    | 0-100 match score from Gemini                      |
| gemini_reason   | One-sentence explanation                           |
| shortlisted     | YES/NO — above your threshold?                     |
