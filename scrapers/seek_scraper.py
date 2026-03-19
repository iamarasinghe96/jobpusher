"""
Seek.com.au scraper using their internal search API.
Covers Albury/Wodonga region and Melbourne.

Note: Scraping is subject to Seek's Terms of Service.
This scraper is for personal/research use only.
"""

import logging
import time
from datetime import datetime
from typing import Optional

import requests
import pandas as pd

logger = logging.getLogger(__name__)

# Seek search API endpoint
SEEK_API = "https://www.seek.com.au/api/jobsearch/v5/search"
SEEK_JOB_API = "https://www.seek.com.au/api/jobsearch/v5/job/{job_id}"

# Seek location IDs for target regions (suburb -> seek location ID)
# These are Seek's internal IDs for location filtering
SEEK_LOCATION_IDS = {
    "Albury NSW": 3004721,          # Albury
    "Wodonga VIC": 3001680,          # Wodonga
    "Wangaratta VIC": 3009284,       # Wangaratta
    "Benalla VIC": 3008843,          # Benalla
    "Corowa NSW": None,              # Falls back to text search
    "Seymour VIC": 3009285,          # Seymour
    "Melbourne VIC": 3000,           # Melbourne metro
}

# Seek classification codes (job categories)
# 6281 = Information & Communication Technology
# 1200 = Engineering
# 1209 = Construction
# 6123 = Administration & Office Support
# 6142 = Consulting & Strategy
# 6165 = Government & Defence
# 1209 = Manufacturing, Transport & Logistics
SEEK_CLASSIFICATIONS = []  # Empty = all classifications


SEEK_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-AU,en;q=0.9",
    "Origin": "https://www.seek.com.au",
    "Referer": "https://www.seek.com.au/",
}


def scrape_seek(
    job_titles: list[str],
    seek_regions: list[str],
    results_per_query: int = 30,
    hours_old: int = 48,
    proxies: Optional[dict] = None,
) -> pd.DataFrame:
    """
    Scrape jobs from Seek.com.au.

    Args:
        job_titles: List of job title search queries.
        seek_regions: List of location strings for Seek (e.g. ['Albury NSW', 'Melbourne VIC']).
        results_per_query: Max results per (query, location) pair.
        hours_old: Only include jobs from the last N hours. Seek supports: 1, 3, 24, 72, 168 (days 1-7).
        proxies: Optional dict of proxies e.g. {'http': 'http://...', 'https': 'http://...'}.

    Returns:
        DataFrame with standardised job columns.
    """
    all_jobs = []
    date_range = _hours_to_seek_daterange(hours_old)

    for location in seek_regions:
        for title in job_titles:
            logger.info(f"[Seek] Searching '{title}' in '{location}'")
            jobs = _search_seek(
                keywords=title,
                where=location,
                date_range=date_range,
                max_results=results_per_query,
                proxies=proxies,
            )
            if jobs:
                all_jobs.extend(jobs)
                logger.info(f"  -> Found {len(jobs)} jobs")
            time.sleep(1.5)  # Be respectful with rate limiting

    if not all_jobs:
        logger.warning("[Seek] No jobs found.")
        return pd.DataFrame()

    return _to_dataframe(all_jobs)


def _search_seek(
    keywords: str,
    where: str,
    date_range: int = 1,
    max_results: int = 30,
    proxies: Optional[dict] = None,
) -> list[dict]:
    """Make paginated requests to Seek search API."""
    jobs = []
    page = 1
    pages_to_fetch = max(1, max_results // 20)

    while page <= pages_to_fetch:
        params = {
            "siteKey": "AU-Main",
            "sourcesystem": "houston",
            "page": page,
            "seekSelectAllPages": "true",
            "keywords": keywords,
            "where": where,
            "include": "seodata",
            "locale": "en-AU",
            "pageSize": 20,
        }

        if date_range:
            params["daterange"] = date_range

        try:
            resp = requests.get(
                SEEK_API,
                params=params,
                headers=SEEK_HEADERS,
                proxies=proxies,
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()

            job_list = data.get("data", [])
            if not job_list:
                break

            for job in job_list:
                parsed = _parse_seek_job(job, where)
                if parsed:
                    jobs.append(parsed)

            # Check if there are more pages
            total = data.get("totalCount", 0)
            if page * 20 >= total:
                break

            page += 1
            time.sleep(0.8)

        except requests.exceptions.HTTPError as e:
            logger.warning(f"[Seek] HTTP error: {e}")
            break
        except requests.exceptions.RequestException as e:
            logger.warning(f"[Seek] Request error: {e}")
            break
        except Exception as e:
            logger.warning(f"[Seek] Unexpected error: {e}")
            break

    return jobs


def _parse_seek_job(job: dict, search_location: str) -> Optional[dict]:
    """Parse a single job from Seek API response."""
    try:
        job_id = job.get("id", "")
        title = job.get("title", "")
        company = job.get("advertiser", {}).get("description", "")
        location_data = job.get("locations", [{}])[0] if job.get("locations") else {}
        suburb = location_data.get("label", "")
        area = location_data.get("area", {}).get("label", "")
        location_str = f"{suburb}, {area}" if area else suburb

        teaser = job.get("teaser", "")
        bullet_points = " | ".join(job.get("bulletPoints", []))
        description = f"{teaser}\n\n{bullet_points}" if bullet_points else teaser

        url = f"https://www.seek.com.au/job/{job_id}"

        listing_date = job.get("listingDate", "")
        if listing_date:
            date_posted = listing_date[:10]  # Extract YYYY-MM-DD
        else:
            date_posted = datetime.now().strftime("%Y-%m-%d")

        work_types = job.get("workTypes", {})
        job_type = ", ".join(work_types.get("label", "").split(",")) if work_types else ""

        salary_label = job.get("salary", "")

        # Determine location group
        location_group = _determine_location_group(suburb + " " + area)

        return {
            "job_id": str(job_id),
            "title": title,
            "company": company,
            "location": location_str,
            "search_location": search_location,
            "location_group": location_group,
            "source": "seek",
            "url": url,
            "url_direct": url,
            "description": description,
            "date_posted": date_posted,
            "job_type": job_type,
            "salary": salary_label,
            "scraped_at": datetime.now().isoformat(),
            "match_score": None,
            "match_summary": None,
            "matched_skills": None,
            "missing_skills": None,
        }
    except Exception as e:
        logger.debug(f"Error parsing Seek job: {e}")
        return None


def fetch_seek_full_description(job_id: str, proxies: Optional[dict] = None) -> str:
    """Fetch full job description from Seek job detail page."""
    try:
        url = f"https://www.seek.com.au/job/{job_id}"
        resp = requests.get(url, headers=SEEK_HEADERS, proxies=proxies, timeout=15)
        resp.raise_for_status()

        # Seek embeds job data in a script tag as JSON
        from bs4 import BeautifulSoup
        import json
        import re

        soup = BeautifulSoup(resp.text, "lxml")

        # Try to find the job detail JSON in script tags
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string)
                if data.get("@type") == "JobPosting":
                    return data.get("description", "")
            except Exception:
                continue

        # Fallback: look for data in next.js __NEXT_DATA__ or similar
        next_data = soup.find("script", id="__NEXT_DATA__")
        if next_data:
            try:
                data = json.loads(next_data.string)
                # Navigate to job description in the nested structure
                props = data.get("props", {}).get("pageProps", {})
                job_detail = props.get("jobDetail", props.get("job", {}))
                return job_detail.get("content", {}).get("description", "") or \
                       job_detail.get("description", "")
            except Exception:
                pass

        # Last resort: extract visible text from the job ad section
        job_section = soup.find("div", {"data-automation": "jobAdDetails"}) or \
                      soup.find("div", class_=lambda c: c and "job-detail" in c.lower())
        if job_section:
            return job_section.get_text(separator="\n").strip()

        return ""
    except Exception as e:
        logger.debug(f"Could not fetch full description for job {job_id}: {e}")
        return ""


def _determine_location_group(location_text: str) -> str:
    """Classify a location string into a group."""
    text = location_text.lower()
    melbourne_keywords = ["melbourne", "cbd", "richmond", "fitzroy", "collingwood",
                          "south yarra", "st kilda", "footscray", "brunswick"]
    albury_keywords = ["albury", "wodonga", "wangaratta", "corowa", "yarrawonga",
                       "beechworth", "myrtleford", "chiltern", "rutherglen", "bright"]
    vline_keywords = ["seymour", "benalla", "nagambie", "shepparton"]

    if any(k in text for k in melbourne_keywords):
        return "melbourne"
    elif any(k in text for k in vline_keywords):
        return "vline_corridor"
    elif any(k in text for k in albury_keywords):
        return "albury_region"
    return "other"


def _hours_to_seek_daterange(hours: int) -> int:
    """Convert hours to Seek's daterange parameter (1=24h, 3=72h, 7=week)."""
    if hours <= 24:
        return 1
    elif hours <= 72:
        return 3
    elif hours <= 168:
        return 7
    return 14


def _to_dataframe(jobs: list[dict]) -> pd.DataFrame:
    """Convert list of job dicts to a deduplicated DataFrame."""
    df = pd.DataFrame(jobs)
    if df.empty:
        return df
    df = df.drop_duplicates(subset=["url"], keep="first")
    df = df.drop_duplicates(subset=["job_id"], keep="first")
    return df.reset_index(drop=True)
