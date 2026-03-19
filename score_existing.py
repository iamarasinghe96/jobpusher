"""
Score existing scraped jobs with Gemini AI — no re-scraping.

Usage:
    python score_existing.py                    # Uses most recent raw_jobs_*.csv
    python score_existing.py --csv output/raw_jobs_20260319.csv
    python score_existing.py --min-score 70
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
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_score_cache(cache: dict, new_rows: pd.DataFrame):
    score_fields = ["match_score", "match_summary", "matched_skills", "missing_skills", "recommendation"]
    for _, row in new_rows.iterrows():
        job_id = row.get("job_id")
        if not job_id:
            continue
        cache[str(job_id)] = {f: row.get(f) for f in score_fields if f in row}
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, default=str)
    logger.info(f"[Cache] {len(cache)} total scored jobs saved to score_cache.json")


def find_latest_csv() -> Path:
    csvs = sorted(OUTPUT_DIR.glob("raw_jobs_*.csv"), reverse=True)
    if not csvs:
        logger.error("No raw_jobs_*.csv found in output/. Run pipeline with --no-ai first.")
        sys.exit(1)
    return csvs[0]


def export_json(df: pd.DataFrame):
    output_file = OUTPUT_DIR / "jobs.json"
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
        "meta": {
            "total_jobs": len(records),
            "last_updated": datetime.now().isoformat(),
            "last_updated_display": datetime.now().strftime("%d %b %Y at %H:%M"),
        },
    }
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(jobs_data, f, indent=2, ensure_ascii=False, default=str)
    logger.info(f"Exported {len(records)} jobs to {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Score existing scraped jobs with Gemini")
    parser.add_argument("--csv", type=str, help="Path to raw_jobs CSV (default: most recent)")
    parser.add_argument("--min-score", type=int, help="Override minimum match score (0-100)")
    args = parser.parse_args()

    # Load config
    with open(CONFIG_FILE) as f:
        config = yaml.safe_load(f)

    gemini_key = os.getenv("GEMINI_API_KEY", "")
    if not gemini_key:
        logger.error("GEMINI_API_KEY not set in .env")
        sys.exit(1)

    # Load CV
    cv_text = CV_FILE.read_text(encoding="utf-8").strip()
    if not cv_text:
        logger.error("CV file is empty.")
        sys.exit(1)

    # Load raw jobs CSV
    csv_path = Path(args.csv) if args.csv else find_latest_csv()
    logger.info(f"Loading jobs from: {csv_path}")
    all_jobs_df = pd.read_csv(csv_path)
    logger.info(f"Loaded {len(all_jobs_df)} jobs")

    # Keyword pre-filter
    from matching.keyword_filter import pre_filter_jobs
    min_kw = config["matching"].get("keyword_filter_min", 2)
    extra_kw = config["search"].get("keywords", [])
    passing_df, rejected_df = pre_filter_jobs(
        jobs_df=all_jobs_df,
        cv_text=cv_text,
        extra_keywords=extra_kw,
        min_keyword_matches=min_kw,
    )
    logger.info(f"Keyword filter: {len(passing_df)} pass, {len(rejected_df)} rejected")

    if passing_df.empty:
        logger.warning("No jobs passed keyword filter.")
        sys.exit(0)

    # Gemini scoring (with cache)
    from matching.gemini_matcher import score_jobs_with_gemini
    min_score = args.min_score or config["matching"].get("default_min_score", 65)
    gemini_model = config["matching"].get("gemini_model", "gemini-2.0-flash")

    score_cache = _load_score_cache()
    score_fields = ["match_score", "match_summary", "matched_skills", "missing_skills", "recommendation"]

    is_cached = passing_df["job_id"].astype(str).isin(score_cache)
    cached_df = passing_df[is_cached].copy()
    new_df = passing_df[~is_cached].copy()

    logger.info(f"[Cache] {len(cached_df)} already scored, {len(new_df)} new to score")

    for field in score_fields:
        cached_df[field] = cached_df["job_id"].astype(str).map(
            lambda jid, f=field: score_cache.get(jid, {}).get(f)
        )

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
        logger.info("[Cache] All jobs already scored — skipping Gemini")

    matched_df = pd.concat([cached_df, new_df], ignore_index=True)
    matched_df = matched_df.sort_values("match_score", ascending=False).reset_index(drop=True)

    # Save matched CSV
    matched_csv = OUTPUT_DIR / f"matched_jobs_{datetime.now().strftime('%Y%m%d')}.csv"
    matched_df.to_csv(matched_csv, index=False)
    logger.info(f"Matched jobs saved to: {matched_csv}")

    # Export to web UI
    export_json(matched_df)

    above = len(matched_df[matched_df["match_score"] >= min_score])
    logger.info("=" * 50)
    logger.info(f"DONE — {above} jobs above {min_score}% match")
    logger.info("Open http://localhost:8080/web/ to view results")
    logger.info("=" * 50)


if __name__ == "__main__":
    main()
