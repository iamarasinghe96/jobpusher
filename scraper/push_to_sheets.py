"""
Push scraped jobs to Google Sheets.

Sheet layout (single spreadsheet, multiple tabs):
  - "Raw Jobs"    : all scraped jobs (appended daily, deduped by URL)
  - "CV"          : cell A1 = your full CV text  (you fill this once)
  - "Config"      : A1=threshold (e.g. 60), A2=comma-separated extra keywords to EXCLUDE

Set env vars (or .env):
  GOOGLE_SHEETS_ID       — the spreadsheet ID from the URL
  GOOGLE_SERVICE_ACCOUNT — JSON string of your service account credentials
                           (paste the entire contents of your service-account .json file)
"""
from __future__ import annotations

import json
import os

import gspread
import pandas as pd
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials

load_dotenv()

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Columns written to "Raw Jobs" sheet (order matters — matches Apps Script expectations)
SHEET_COLUMNS = [
    "scraped_at",
    "source",
    "title",
    "company",
    "location",
    "job_type",
    "salary_min",
    "salary_max",
    "url",
    "description",
    # These columns are filled later by Apps Script
    "keyword_match",   # TRUE/FALSE — did it pass keyword pre-filter?
    "gemini_score",    # 0-100
    "gemini_reason",   # short explanation
    "shortlisted",     # YES/NO
]


def get_client() -> gspread.Client:
    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT")
    if not sa_json:
        raise ValueError(
            "GOOGLE_SERVICE_ACCOUNT env var not set. "
            "Set it to the full JSON of your service account key."
        )
    info = json.loads(sa_json)
    creds = Credentials.from_service_account_info(info, scopes=SCOPES)
    return gspread.authorize(creds)


def ensure_sheet(spreadsheet: gspread.Spreadsheet, name: str) -> gspread.Worksheet:
    """Return worksheet by name, creating it if it doesn't exist."""
    try:
        return spreadsheet.worksheet(name)
    except gspread.WorksheetNotFound:
        ws = spreadsheet.add_worksheet(title=name, rows=5000, cols=20)
        return ws


def push_jobs(df: pd.DataFrame) -> None:
    if df.empty:
        print("[Sheets] Nothing to push.")
        return

    sheet_id = os.environ.get("GOOGLE_SHEETS_ID")
    if not sheet_id:
        raise ValueError("GOOGLE_SHEETS_ID env var not set.")

    client = get_client()
    spreadsheet = client.open_by_key(sheet_id)

    raw_ws = ensure_sheet(spreadsheet, "Raw Jobs")

    # Ensure header row exists
    existing = raw_ws.get_all_values()
    if not existing:
        raw_ws.append_row(SHEET_COLUMNS, value_input_option="RAW")
        existing_urls: set[str] = set()
    else:
        # Collect already-present URLs to avoid duplicates
        try:
            url_col_idx = SHEET_COLUMNS.index("url")
            existing_urls = {
                row[url_col_idx]
                for row in existing[1:]  # skip header
                if len(row) > url_col_idx
            }
        except ValueError:
            existing_urls = set()

    # Filter to new jobs only
    new_rows: list[list[str]] = []
    for _, row in df.iterrows():
        url = str(row.get("url", ""))
        if url and url in existing_urls:
            continue

        sheet_row: list[str] = []
        for col in SHEET_COLUMNS:
            val = row.get(col, "")
            # Truncate description to 2000 chars to stay within cell limits
            if col == "description" and isinstance(val, str) and len(val) > 2000:
                val = val[:2000] + "…"
            sheet_row.append("" if pd.isna(val) else str(val))
        new_rows.append(sheet_row)

    if not new_rows:
        print("[Sheets] All jobs already exist in sheet — nothing new to add.")
        return

    raw_ws.append_rows(new_rows, value_input_option="RAW")
    print(f"[Sheets] Appended {len(new_rows)} new jobs to 'Raw Jobs'.")

    # Ensure CV and Config sheets exist (user fills them manually)
    ensure_sheet(spreadsheet, "CV")
    config_ws = ensure_sheet(spreadsheet, "Config")
    config_data = config_ws.get_all_values()
    if not config_data:
        config_ws.update(
            "A1:B4",
            [
                ["match_threshold", "60"],
                ["exclude_keywords", "senior,lead,head of,director,VP"],
                ["shortlist_tab", "Shortlisted"],
                ["", ""],
            ],
        )
        print("[Sheets] Created Config sheet with defaults.")


if __name__ == "__main__":
    from scrape_jobs import run

    df = run()
    push_jobs(df)
