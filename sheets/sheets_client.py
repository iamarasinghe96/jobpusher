"""
Google Sheets integration for job pusher.
Writes raw scraped jobs and AI-matched jobs to a Google Spreadsheet.

Setup:
  1. Go to https://console.cloud.google.com/
  2. Create a new project
  3. Enable Google Sheets API and Google Drive API
  4. Create a Service Account
  5. Download the credentials JSON (save as credentials.json)
  6. Share your spreadsheet with the service account email address (Editor access)
  7. Set GOOGLE_SHEETS_CREDENTIALS_FILE and GOOGLE_SHEETS_ID in .env
"""

import logging
from datetime import datetime
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Columns to write to Google Sheets
RAW_COLUMNS = [
    "job_id", "title", "company", "location", "location_group",
    "source", "url", "date_posted", "job_type", "salary",
    "keyword_score", "keyword_match_count", "keyword_matches",
    "description", "scraped_at",
]

MATCHED_COLUMNS = [
    "job_id", "title", "company", "location", "location_group",
    "source", "url", "date_posted", "job_type", "salary",
    "match_score", "match_summary", "matched_skills", "missing_skills",
    "recommendation", "keyword_score", "scraped_at",
]


def get_sheets_client(credentials_file: str):
    """Create and return a gspread authorised client."""
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = [
            "https://spreadsheets.google.com/feeds",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = Credentials.from_service_account_file(credentials_file, scopes=scopes)
        return gspread.authorize(creds)
    except ImportError:
        logger.error("gspread not installed. Run: pip install gspread google-auth")
        return None
    except FileNotFoundError:
        logger.error(f"Credentials file not found: {credentials_file}")
        return None
    except Exception as e:
        logger.error(f"Failed to create Sheets client: {e}")
        return None


def write_raw_jobs(
    spreadsheet_id: str,
    jobs_df: pd.DataFrame,
    credentials_file: str,
    sheet_name: str = "Raw Jobs",
    append: bool = True,
) -> bool:
    """
    Write raw scraped jobs to Google Sheets.

    Args:
        spreadsheet_id: The Sheets spreadsheet ID.
        jobs_df: DataFrame of raw jobs.
        credentials_file: Path to service account credentials JSON.
        sheet_name: Name of the worksheet tab.
        append: If True, append to existing data; if False, overwrite.

    Returns:
        True on success, False on failure.
    """
    return _write_to_sheet(
        spreadsheet_id=spreadsheet_id,
        df=jobs_df,
        credentials_file=credentials_file,
        sheet_name=sheet_name,
        columns=RAW_COLUMNS,
        append=append,
    )


def write_matched_jobs(
    spreadsheet_id: str,
    jobs_df: pd.DataFrame,
    credentials_file: str,
    sheet_name: str = "Matched Jobs",
    append: bool = True,
) -> bool:
    """
    Write AI-matched jobs to Google Sheets.

    Args:
        spreadsheet_id: The Sheets spreadsheet ID.
        jobs_df: DataFrame of matched jobs (with match_score).
        credentials_file: Path to service account credentials JSON.
        sheet_name: Name of the worksheet tab.
        append: If True, append to existing data; if False, overwrite.

    Returns:
        True on success, False on failure.
    """
    return _write_to_sheet(
        spreadsheet_id=spreadsheet_id,
        df=jobs_df,
        credentials_file=credentials_file,
        sheet_name=sheet_name,
        columns=MATCHED_COLUMNS,
        append=append,
    )


def _write_to_sheet(
    spreadsheet_id: str,
    df: pd.DataFrame,
    credentials_file: str,
    sheet_name: str,
    columns: list[str],
    append: bool,
) -> bool:
    """Internal helper to write a DataFrame to a Google Sheets tab."""
    if df.empty:
        logger.warning(f"[Sheets] No data to write to '{sheet_name}'")
        return True

    client = get_sheets_client(credentials_file)
    if not client:
        return False

    try:
        spreadsheet = client.open_by_key(spreadsheet_id)
    except Exception as e:
        logger.error(f"[Sheets] Could not open spreadsheet {spreadsheet_id}: {e}")
        return False

    # Get or create the worksheet
    try:
        worksheet = spreadsheet.worksheet(sheet_name)
    except Exception:
        worksheet = spreadsheet.add_worksheet(title=sheet_name, rows=5000, cols=30)
        logger.info(f"[Sheets] Created new worksheet: {sheet_name}")

    # Prepare data: only include columns that exist in the DataFrame
    available_cols = [c for c in columns if c in df.columns]
    write_df = df[available_cols].copy()

    # Convert all values to strings/primitives for Sheets
    for col in write_df.columns:
        write_df[col] = write_df[col].fillna("").astype(str)

    rows = write_df.values.tolist()

    if append:
        existing = worksheet.get_all_values()
        if not existing:
            # Sheet is empty - write header first
            worksheet.append_row(available_cols)
        elif existing[0] != available_cols:
            # Header mismatch - warn and overwrite
            logger.warning("[Sheets] Header mismatch - overwriting sheet")
            worksheet.clear()
            worksheet.append_row(available_cols)

        # Deduplicate: skip rows where job_id already exists
        if "job_id" in available_cols and existing:
            existing_ids = {row[available_cols.index("job_id")] for row in existing[1:]}
            id_col = available_cols.index("job_id")
            rows = [r for r in rows if str(r[id_col]) not in existing_ids]
            logger.info(f"[Sheets] {len(rows)} new rows to append (after dedup)")

        if rows:
            worksheet.append_rows(rows, value_input_option="USER_ENTERED")
    else:
        # Overwrite entire sheet
        worksheet.clear()
        worksheet.append_row(available_cols)
        if rows:
            worksheet.append_rows(rows, value_input_option="USER_ENTERED")

    logger.info(f"[Sheets] Wrote {len(rows)} rows to '{sheet_name}'")
    return True


def read_jobs_from_sheet(
    spreadsheet_id: str,
    credentials_file: str,
    sheet_name: str = "Matched Jobs",
) -> pd.DataFrame:
    """Read jobs from a Google Sheets tab into a DataFrame."""
    client = get_sheets_client(credentials_file)
    if not client:
        return pd.DataFrame()

    try:
        spreadsheet = client.open_by_key(spreadsheet_id)
        worksheet = spreadsheet.worksheet(sheet_name)
        data = worksheet.get_all_records()
        return pd.DataFrame(data)
    except Exception as e:
        logger.error(f"[Sheets] Error reading from '{sheet_name}': {e}")
        return pd.DataFrame()
