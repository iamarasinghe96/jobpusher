"""
JobPusher scraper — LinkedIn (via JobSpy) + Seek (direct API)
Outputs combined results to a pandas DataFrame for push_to_sheets.py to consume.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime
from typing import Any

import pandas as pd
import requests
from dotenv import load_dotenv
from jobspy import scrape_jobs

load_dotenv()

# ---------------------------------------------------------------------------
# Config — override via .env or GitHub Actions secrets / env vars
# ---------------------------------------------------------------------------
SEARCH_TERMS: list[str] = os.getenv(
    "SEARCH_TERMS",
    "data analyst,business analyst,project manager,software engineer",
).split(",")

LOCATIONS: list[str] = os.getenv(
    "LOCATIONS",
    "Melbourne VIC,Sydney NSW,Brisbane QLD,Remote Australia",
).split(",")

RESULTS_PER_SEARCH = int(os.getenv("RESULTS_PER_SEARCH", "30"))

SEEK_SITE_ID = "au"  # Seek Australia


# ---------------------------------------------------------------------------
# LinkedIn / Indeed / Glassdoor  (JobSpy)
# ---------------------------------------------------------------------------
def scrape_via_jobspy() -> pd.DataFrame:
    """Scrape LinkedIn (and optionally Indeed) using JobSpy."""
    frames: list[pd.DataFrame] = []

    for term in SEARCH_TERMS:
        for location in LOCATIONS:
            print(f"[JobSpy] {term} @ {location}")
            try:
                df = scrape_jobs(
                    site_name=["linkedin", "indeed"],
                    search_term=term.strip(),
                    location=location.strip(),
                    results_wanted=RESULTS_PER_SEARCH,
                    hours_old=24,
                    country_indeed="Australia",
                )
                if df is not None and not df.empty:
                    frames.append(df)
            except Exception as exc:
                print(f"  [JobSpy] error: {exc}")
            time.sleep(2)  # polite delay

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames, ignore_index=True)
    combined = combined.drop_duplicates(subset=["job_url"])
    return combined


def normalise_jobspy(df: pd.DataFrame) -> pd.DataFrame:
    """Map JobSpy columns → unified schema."""
    if df.empty:
        return df

    col_map = {
        "title": "title",
        "company": "company",
        "location": "location",
        "description": "description",
        "job_url": "url",
        "site": "source",
        "date_posted": "date_posted",
        "min_amount": "salary_min",
        "max_amount": "salary_max",
        "job_type": "job_type",
    }
    existing = {k: v for k, v in col_map.items() if k in df.columns}
    out = df.rename(columns=existing)[list(existing.values())].copy()

    # ensure all expected columns exist
    for col in ["title", "company", "location", "description", "url", "source",
                "date_posted", "salary_min", "salary_max", "job_type"]:
        if col not in out.columns:
            out[col] = ""

    out["scraped_at"] = datetime.utcnow().strftime("%Y-%m-%d")
    return out


# ---------------------------------------------------------------------------
# Seek  (direct search API — same approach as qinscode/SeekSpider)
# ---------------------------------------------------------------------------
SEEK_SEARCH_URL = "https://www.seek.com.au/api/chalice-search/v4/search"

SEEK_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.seek.com.au/",
}

SEEK_LOCATION_MAP: dict[str, str] = {
    "Melbourne VIC": "Melbourne VIC 3000",
    "Sydney NSW": "Sydney NSW 2000",
    "Brisbane QLD": "Brisbane QLD 4000",
    "Remote Australia": "",
}


def _seek_job_detail(job_id: str, session: requests.Session) -> str:
    """Fetch full job description from Seek job detail API."""
    try:
        url = f"https://www.seek.com.au/job/{job_id}"
        # Use the structured data endpoint
        detail_url = f"https://www.seek.com.au/api/jobdetails/{job_id}"
        resp = session.get(detail_url, headers=SEEK_HEADERS, timeout=10)
        if resp.ok:
            data = resp.json()
            return data.get("jobAdDetails", {}).get("content", "")
    except Exception:
        pass
    return ""


def scrape_seek() -> pd.DataFrame:
    """Scrape Seek jobs using the search API."""
    session = requests.Session()
    rows: list[dict[str, Any]] = []

    for term in SEARCH_TERMS:
        for location, seek_location in SEEK_LOCATION_MAP.items():
            print(f"[Seek] {term} @ {location}")
            try:
                params: dict[str, Any] = {
                    "siteKey": "AU-Main",
                    "where": seek_location,
                    "keywords": term.strip(),
                    "pageSize": RESULTS_PER_SEARCH,
                    "page": 1,
                    "locale": "en-AU",
                    "include": "seodata",
                    "dateRange": "1",  # last 24h
                }
                resp = session.get(
                    SEEK_SEARCH_URL,
                    headers=SEEK_HEADERS,
                    params=params,
                    timeout=15,
                )
                resp.raise_for_status()
                data = resp.json()
                job_list = data.get("data", [])

                for job in job_list:
                    rows.append(
                        {
                            "title": job.get("title", ""),
                            "company": job.get("advertiser", {}).get("description", ""),
                            "location": job.get("suburb", "") or location,
                            "description": job.get("teaser", ""),
                            "url": f"https://www.seek.com.au/job/{job.get('id', '')}",
                            "source": "seek",
                            "date_posted": job.get("listingDate", "")[:10],
                            "salary_min": "",
                            "salary_max": "",
                            "job_type": job.get("workType", ""),
                            "scraped_at": datetime.utcnow().strftime("%Y-%m-%d"),
                        }
                    )
            except Exception as exc:
                print(f"  [Seek] error: {exc}")
            time.sleep(2)

    if not rows:
        return pd.DataFrame()
    return pd.DataFrame(rows).drop_duplicates(subset=["url"])


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def run() -> pd.DataFrame:
    print("=== Scraping LinkedIn / Indeed via JobSpy ===")
    jobspy_raw = scrape_via_jobspy()
    jobspy_df = normalise_jobspy(jobspy_raw)
    print(f"  → {len(jobspy_df)} jobs from JobSpy")

    print("=== Scraping Seek ===")
    seek_df = scrape_seek()
    print(f"  → {len(seek_df)} jobs from Seek")

    frames = [f for f in [jobspy_df, seek_df] if not f.empty]
    if not frames:
        print("No jobs scraped.")
        return pd.DataFrame()

    all_jobs = pd.concat(frames, ignore_index=True)
    all_jobs = all_jobs.drop_duplicates(subset=["url"])
    print(f"Total unique jobs: {len(all_jobs)}")
    return all_jobs


if __name__ == "__main__":
    df = run()
    if not df.empty:
        df.to_csv("scraped_jobs.csv", index=False)
        print("Saved to scraped_jobs.csv")
