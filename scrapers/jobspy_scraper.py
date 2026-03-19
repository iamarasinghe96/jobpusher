"""
JobSpy scraper for LinkedIn and Indeed.
Docs: https://github.com/speedyapply/JobSpy
"""

import logging
from datetime import datetime
from typing import Optional

import pandas as pd

from .locations import ALBURY_REGION, VLINE_CORRIDOR, MELBOURNE

logger = logging.getLogger(__name__)


def scrape_jobspy(
    job_titles: list[str],
    sites: list[str],
    results_per_site: int = 30,
    hours_old: int = 48,
    include_remote: bool = True,
    proxies: Optional[list] = None,
) -> pd.DataFrame:
    """
    Scrape jobs from LinkedIn and/or Indeed via JobSpy.

    Args:
        job_titles: List of job titles/search queries.
        sites: List of sites to scrape ('linkedin', 'indeed', 'glassdoor').
        results_per_site: Max results per site per search query.
        hours_old: Only include jobs posted within this many hours.
        include_remote: Whether to include remote jobs.
        proxies: Optional list of proxy URLs.

    Returns:
        DataFrame with standardised job columns.
    """
    try:
        from jobspy import scrape_jobs
    except ImportError:
        logger.error("python-jobspy not installed. Run: pip install python-jobspy")
        return pd.DataFrame()

    # Filter sites to only JobSpy-supported ones
    supported = {"linkedin", "indeed", "glassdoor", "google", "zip_recruiter"}
    active_sites = [s for s in sites if s.lower() in supported]
    if not active_sites:
        logger.warning("No JobSpy-supported sites in config. Skipping JobSpy scraper.")
        return pd.DataFrame()

    all_jobs = []

    # Build location list: Albury region + Vline corridor + Melbourne
    location_groups = {
        "albury_region": ALBURY_REGION,
        "vline_corridor": VLINE_CORRIDOR,
        "melbourne": MELBOURNE,
    }

    for group_name, locations in location_groups.items():
        # Use the primary location for each group (JobSpy searches a wide area)
        # We pick key locations rather than querying every suburb
        primary_locations = _primary_locations(group_name, locations)

        for location in primary_locations:
            for title in job_titles:
                logger.info(f"[JobSpy] Searching '{title}' in '{location}' on {active_sites}")
                try:
                    jobs_df = scrape_jobs(
                        site_name=active_sites,
                        search_term=title,
                        location=location,
                        results_wanted=results_per_site,
                        hours_old=hours_old,
                        country_indeed="Australia",
                        proxies=proxies or [],
                        linkedin_fetch_description=True,
                    )

                    if jobs_df is not None and not jobs_df.empty:
                        jobs_df["search_query"] = title
                        jobs_df["search_location"] = location
                        jobs_df["location_group"] = group_name
                        all_jobs.append(jobs_df)
                        logger.info(f"  -> Found {len(jobs_df)} jobs")

                except Exception as e:
                    logger.warning(f"  -> Error scraping '{title}' in '{location}': {e}")

    if not all_jobs:
        logger.warning("[JobSpy] No jobs found across all queries.")
        return pd.DataFrame()

    combined = pd.concat(all_jobs, ignore_index=True)

    # Add remote jobs (LinkedIn/Indeed support remote search)
    if include_remote:
        for title in job_titles:
            logger.info(f"[JobSpy] Searching remote '{title}'")
            try:
                remote_df = scrape_jobs(
                    site_name=active_sites,
                    search_term=title,
                    location="Australia",
                    is_remote=True,
                    results_wanted=results_per_site,
                    hours_old=hours_old,
                    country_indeed="Australia",
                    proxies=proxies or [],
                    linkedin_fetch_description=True,
                )
                if remote_df is not None and not remote_df.empty:
                    remote_df["search_query"] = title
                    remote_df["search_location"] = "Remote Australia"
                    remote_df["location_group"] = "remote"
                    combined = pd.concat([combined, remote_df], ignore_index=True)
            except Exception as e:
                logger.warning(f"  -> Error fetching remote jobs: {e}")

    return _normalise(combined)


def _primary_locations(group_name: str, locations: list[str]) -> list[str]:
    """Pick representative locations per group to avoid redundant API calls."""
    if group_name == "albury_region":
        return ["Albury NSW", "Wodonga VIC", "Wangaratta VIC"]
    elif group_name == "vline_corridor":
        return ["Seymour VIC"]  # Already covered Wodonga/Wangaratta above
    elif group_name == "melbourne":
        return ["Melbourne VIC"]
    return locations[:2]


def _normalise(df: pd.DataFrame) -> pd.DataFrame:
    """Standardise column names and types across scrapers."""
    rename_map = {
        "id": "job_id",
        "site": "source",
        "job_url": "url",
        "job_url_direct": "url_direct",
        "title": "title",
        "company": "company",
        "location": "location",
        "date_posted": "date_posted",
        "job_type": "job_type",
        "salary_source": "salary_source",
        "interval": "salary_interval",
        "min_amount": "salary_min",
        "max_amount": "salary_max",
        "currency": "currency",
        "description": "description",
        "company_url": "company_url",
        "company_logo": "company_logo",
    }

    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    # Ensure required columns exist
    for col in ["job_id", "title", "company", "location", "source", "url", "description", "date_posted", "location_group"]:
        if col not in df.columns:
            df[col] = None

    # Deduplicate by URL
    df = df.drop_duplicates(subset=["url"], keep="first")

    # Convert date_posted to string ISO format
    if "date_posted" in df.columns:
        df["date_posted"] = pd.to_datetime(df["date_posted"], errors="coerce").dt.strftime("%Y-%m-%d")

    df["scraped_at"] = datetime.now().isoformat()
    df["match_score"] = None
    df["match_summary"] = None
    df["matched_skills"] = None
    df["missing_skills"] = None

    return df
