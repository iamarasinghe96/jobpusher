"""
Job Pusher - Main Pipeline Orchestrator

Runs the full pipeline:
  1. Scrape jobs from LinkedIn, Indeed (via JobSpy) + Seek
  2. Keyword pre-filter (fast, no API cost)
  3. AI scoring via Google Gemini
  4. Export results to jobs.json (for web UI) + optionally Google Sheets

Usage:
    python run_pipeline.py               # Run once
    python run_pipeline.py --schedule    # Run daily at 7am
    python run_pipeline.py --no-ai       # Scrape only, skip Gemini scoring
    python run_pipeline.py --min-score 70  # Override minimum match score
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
import yaml
from dotenv import load_dotenv

load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("jobpusher.log"),
    ],
)
logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"
CV_FILE = BASE_DIR / "cv_bank" / "profile.md"
CONFIG_FILE = BASE_DIR / "config.yaml"
CACHE_FILE = OUTPUT_DIR / "score_cache.json"


def _load_score_cache() -> dict:
    """Load previously scored jobs from cache. Returns {job_id: score_fields}."""
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_score_cache(cache: dict, new_rows: pd.DataFrame):
    """Append newly scored rows into the cache and persist to disk."""
    score_fields = ["match_score", "match_summary", "matched_skills", "missing_skills", "recommendation"]
    for _, row in new_rows.iterrows():
        job_id = row.get("job_id")
        if not job_id:
            continue
        cache[str(job_id)] = {f: row.get(f) for f in score_fields if f in row}
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, default=str)
    logger.info(f"[Cache] {len(cache)} total scored jobs saved to score_cache.json")


def load_config() -> dict:
    with open(CONFIG_FILE, "r") as f:
        return yaml.safe_load(f)


def run_pipeline(
    config: dict,
    gemini_key: str,
    skip_ai: bool = False,
    min_score_override: int = None,
    use_sheets: bool = True,
) -> dict:
    """
    Run the full scrape → filter → score → export pipeline.

    Returns:
        Summary dict with counts and output file path.
    """
    start_time = datetime.now()
    logger.info("=" * 60)
    logger.info("JOB PUSHER PIPELINE STARTING")
    logger.info(f"Time: {start_time.strftime('%Y-%m-%d %H:%M')}")
    logger.info("=" * 60)

    OUTPUT_DIR.mkdir(exist_ok=True)

    # --- Load CV ---
    cv_text = _load_cv()
    if not cv_text:
        logger.error(f"CV file is empty or missing: {CV_FILE}")
        logger.error("Please fill in cv_bank/profile.md with your professional profile.")
        sys.exit(1)

    # --- Step 1: Scrape jobs ---
    all_jobs_df = _scrape_all(config)

    if all_jobs_df.empty:
        logger.warning("No jobs scraped. Exiting.")
        return {"total_scraped": 0, "total_matched": 0}

    logger.info(f"Total jobs scraped: {len(all_jobs_df)}")

    # Save raw jobs to CSV
    raw_csv = OUTPUT_DIR / f"raw_jobs_{datetime.now().strftime('%Y%m%d')}.csv"
    all_jobs_df.to_csv(raw_csv, index=False)
    logger.info(f"Raw jobs saved to: {raw_csv}")

    # --- Step 2: Keyword pre-filter ---
    from matching.keyword_filter import pre_filter_jobs

    min_kw = config["matching"].get("keyword_filter_min", 2)
    extra_kw = config["search"].get("keywords", [])

    passing_df, rejected_df = pre_filter_jobs(
        jobs_df=all_jobs_df,
        cv_text=cv_text,
        extra_keywords=extra_kw,
        min_keyword_matches=min_kw,
    )

    logger.info(f"After keyword filter: {len(passing_df)} pass, {len(rejected_df)} rejected")

    if passing_df.empty:
        logger.warning("No jobs passed keyword filter. Consider lowering keyword_filter_min in config.")
        # Write empty results
        _export_json(pd.DataFrame(), OUTPUT_DIR)
        return {"total_scraped": len(all_jobs_df), "total_matched": 0}

    # --- Step 3: AI Scoring (optional) ---
    matched_df = passing_df.copy()

    if not skip_ai and gemini_key:
        from matching.gemini_matcher import score_jobs_with_gemini

        min_score = min_score_override or config["matching"].get("default_min_score", 65)
        gemini_model = config["matching"].get("gemini_model", "gemini-2.0-flash")

        # Split into cached (already scored) vs new (need Gemini)
        score_cache = _load_score_cache()
        score_fields = ["match_score", "match_summary", "matched_skills", "missing_skills", "recommendation"]

        is_cached = matched_df["job_id"].astype(str).isin(score_cache)
        cached_df = matched_df[is_cached].copy()
        new_df = matched_df[~is_cached].copy()

        logger.info(f"[Cache] {len(cached_df)} jobs reused from cache, {len(new_df)} new jobs to score")

        # Restore cached scores
        for field in score_fields:
            cached_df[field] = cached_df["job_id"].astype(str).map(
                lambda jid, f=field: score_cache.get(jid, {}).get(f)
            )

        # Score only new jobs
        if not new_df.empty:
            new_df = score_jobs_with_gemini(
                jobs_df=new_df,
                cv_text=cv_text,
                gemini_api_key=gemini_key,
                model=gemini_model,
                min_score=0,
                requests_per_minute=14,
            )
            _save_score_cache(score_cache, new_df)
        else:
            logger.info("[Cache] All jobs already scored — skipping Gemini entirely")

        matched_df = pd.concat([cached_df, new_df], ignore_index=True)
        matched_df = matched_df.sort_values("match_score", ascending=False).reset_index(drop=True)

    elif skip_ai:
        logger.info("[Pipeline] Skipping AI scoring (--no-ai flag)")
        matched_df["match_score"] = matched_df.get("keyword_score", 0)
    else:
        logger.warning("[Pipeline] No Gemini API key - using keyword score only")
        matched_df["match_score"] = matched_df.get("keyword_score", 0)

    # --- Step 4: Export ---
    _export_json(matched_df, OUTPUT_DIR)

    # Save matched jobs CSV
    matched_csv = OUTPUT_DIR / f"matched_jobs_{datetime.now().strftime('%Y%m%d')}.csv"
    matched_df.to_csv(matched_csv, index=False)
    logger.info(f"Matched jobs saved to: {matched_csv}")

    # --- Step 5: Google Sheets (optional) ---
    if use_sheets:
        _sync_to_sheets(config, all_jobs_df, matched_df)

    # Summary
    duration = (datetime.now() - start_time).seconds
    min_score = min_score_override or config["matching"].get("default_min_score", 65)
    above_threshold = len(matched_df[matched_df["match_score"] >= min_score]) if not matched_df.empty else 0

    summary = {
        "total_scraped": len(all_jobs_df),
        "keyword_filtered": len(passing_df),
        "total_scored": len(matched_df),
        "above_threshold": above_threshold,
        "min_score": min_score,
        "duration_seconds": duration,
        "output_file": str(OUTPUT_DIR / "jobs.json"),
    }

    logger.info("=" * 60)
    logger.info("PIPELINE COMPLETE")
    logger.info(f"  Scraped:           {summary['total_scraped']}")
    logger.info(f"  Passed keyword:    {summary['keyword_filtered']}")
    logger.info(f"  Scored by AI:      {summary['total_scored']}")
    logger.info(f"  Above {min_score}% match: {summary['above_threshold']}")
    logger.info(f"  Duration:          {duration}s")
    logger.info(f"  Web UI data:       {summary['output_file']}")
    logger.info("=" * 60)
    logger.info("Open web/index.html in your browser to view results!")

    return summary


def _scrape_all(config: dict) -> pd.DataFrame:
    """Run all configured scrapers and return combined DataFrame."""
    all_dfs = []
    sites = config["search"].get("sites", ["linkedin", "indeed"])
    job_titles = config["search"].get("job_titles", [])
    results_per = config["search"].get("results_per_site", 30)
    hours_old = config["search"].get("hours_old", 48)
    include_remote = config["search"].get("include_remote", True)

    jobspy_sites = [s for s in sites if s in {"linkedin", "indeed", "glassdoor"}]
    seek_enabled = "seek" in [s.lower() for s in sites]

    # JobSpy (LinkedIn + Indeed)
    if jobspy_sites:
        logger.info(f"[Pipeline] Running JobSpy for: {jobspy_sites}")
        from scrapers.jobspy_scraper import scrape_jobspy
        df = scrape_jobspy(
            job_titles=job_titles,
            sites=jobspy_sites,
            results_per_site=results_per,
            hours_old=hours_old,
            include_remote=include_remote,
        )
        if not df.empty:
            all_dfs.append(df)
            logger.info(f"[Pipeline] JobSpy found {len(df)} jobs")

    # Seek scraper
    if seek_enabled:
        logger.info("[Pipeline] Running Seek scraper")
        from scrapers.seek_scraper import scrape_seek
        seek_regions = config["locations"].get("seek_regions", ["Albury NSW", "Melbourne VIC"])
        df = scrape_seek(
            job_titles=job_titles,
            seek_regions=seek_regions,
            results_per_query=results_per,
            hours_old=hours_old,
        )
        if not df.empty:
            all_dfs.append(df)
            logger.info(f"[Pipeline] Seek found {len(df)} jobs")

    if not all_dfs:
        return pd.DataFrame()

    combined = pd.concat(all_dfs, ignore_index=True)

    # Global deduplication by URL
    before = len(combined)
    combined = combined.drop_duplicates(subset=["url"], keep="first")
    logger.info(f"[Pipeline] Deduplication: {before} -> {len(combined)} jobs")

    return combined.reset_index(drop=True)


def _load_cv() -> str:
    """Load CV text from file."""
    if not CV_FILE.exists():
        logger.error(f"CV file not found: {CV_FILE}")
        return ""
    text = CV_FILE.read_text(encoding="utf-8").strip()
    if not text or text.startswith("# YOUR NAME"):
        logger.error("CV file contains only the template. Please fill in your details.")
        return ""
    return text


def _export_json(df: pd.DataFrame, output_dir: Path):
    """Export jobs to jobs.json for the web UI."""
    output_file = output_dir / "jobs.json"

    if df.empty:
        jobs_data = {"jobs": [], "meta": _meta()}
        with open(output_file, "w") as f:
            json.dump(jobs_data, f, indent=2)
        logger.info(f"Exported 0 jobs to {output_file}")
        return

    # Convert DataFrame to list of dicts, cleaning up NaN/None
    records = []
    for _, row in df.iterrows():
        record = {}
        for col, val in row.items():
            if pd.isna(val) if not isinstance(val, (list, dict)) else False:
                record[col] = None
            elif isinstance(val, float) and val == int(val):
                record[col] = int(val)
            else:
                record[col] = val
        records.append(record)

    jobs_data = {
        "jobs": records,
        "meta": _meta(len(records)),
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(jobs_data, f, indent=2, ensure_ascii=False, default=str)

    logger.info(f"Exported {len(records)} jobs to {output_file}")


def _meta(count: int = 0) -> dict:
    return {
        "total_jobs": count,
        "last_updated": datetime.now().isoformat(),
        "last_updated_display": datetime.now().strftime("%d %b %Y at %H:%M"),
    }


def _sync_to_sheets(config: dict, raw_df: pd.DataFrame, matched_df: pd.DataFrame):
    """Sync results to Google Sheets if configured."""
    sheets_config = config.get("sheets", {})
    spreadsheet_id = sheets_config.get("spreadsheet_id") or os.getenv("GOOGLE_SHEETS_ID")
    creds_file = sheets_config.get("credentials_file") or os.getenv("GOOGLE_SHEETS_CREDENTIALS_FILE", "credentials.json")

    if not spreadsheet_id:
        logger.info("[Sheets] Skipping (no spreadsheet_id configured)")
        return

    if not Path(creds_file).exists():
        logger.info(f"[Sheets] Skipping (credentials file not found: {creds_file})")
        return

    from sheets.sheets_client import write_raw_jobs, write_matched_jobs

    write_raw_jobs(
        spreadsheet_id=spreadsheet_id,
        jobs_df=raw_df,
        credentials_file=creds_file,
        sheet_name=sheets_config.get("raw_jobs_tab", "Raw Jobs"),
    )

    write_matched_jobs(
        spreadsheet_id=spreadsheet_id,
        jobs_df=matched_df,
        credentials_file=creds_file,
        sheet_name=sheets_config.get("matched_jobs_tab", "Matched Jobs"),
    )


def schedule_daily(config: dict, gemini_key: str):
    """Schedule the pipeline to run daily at 7am."""
    import schedule
    import time

    logger.info("[Scheduler] Pipeline scheduled to run daily at 07:00")
    schedule.every().day.at("07:00").do(run_pipeline, config, gemini_key)

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Job Pusher Pipeline")
    parser.add_argument("--no-ai", action="store_true", help="Skip Gemini AI scoring")
    parser.add_argument("--score-only", action="store_true", help="Score existing CSV without re-scraping (uses most recent raw_jobs_*.csv)")
    parser.add_argument("--csv", type=str, help="Path to CSV to score (used with --score-only)")
    parser.add_argument("--min-score", type=int, help="Override minimum match score (0-100)")
    parser.add_argument("--schedule", action="store_true", help="Run daily at 7am")
    parser.add_argument("--no-sheets", action="store_true", help="Skip Google Sheets sync")
    args = parser.parse_args()

    config = load_config()
    gemini_key = os.getenv("GEMINI_API_KEY", "")

    if not gemini_key and not args.no_ai:
        logger.warning("GEMINI_API_KEY not set. Use --no-ai to run without AI scoring.")
        logger.warning("Or set GEMINI_API_KEY in your .env file.")

    if args.score_only:
        # Score existing CSV without re-scraping
        import subprocess, sys as _sys
        cmd = [_sys.executable, str(BASE_DIR / "score_existing.py")]
        if args.csv:
            cmd += ["--csv", args.csv]
        if args.min_score:
            cmd += ["--min-score", str(args.min_score)]
        subprocess.run(cmd)
    elif args.schedule:
        schedule_daily(config, gemini_key)
    else:
        run_pipeline(
            config=config,
            gemini_key=gemini_key,
            skip_ai=args.no_ai,
            min_score_override=args.min_score,
            use_sheets=not args.no_sheets,
        )
