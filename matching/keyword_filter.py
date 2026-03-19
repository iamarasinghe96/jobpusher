"""
Keyword pre-filter to reduce AI API calls.
Computes a fast keyword overlap score between the CV bank and each job description.
Jobs below the minimum keyword match count are skipped before sending to Gemini.
"""

import re
import logging
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Common stop words to exclude from keyword matching
STOP_WORDS = {
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "must", "not", "no",
    "this", "that", "these", "those", "it", "its", "we", "you", "they",
    "their", "our", "your", "his", "her", "as", "if", "so", "than", "then",
    "when", "where", "which", "who", "what", "how", "all", "any", "both",
    "each", "few", "more", "most", "other", "some", "such", "own", "same",
    "up", "out", "about", "into", "through", "during", "role", "work",
    "experience", "required", "including", "ability", "strong", "excellent",
    "skills", "team", "working", "based", "position", "responsibilities",
    "requirements", "preferred", "demonstrated", "proven", "minimum",
    "years", "year", "degree", "plus", "well", "also", "including",
    "ensure", "support", "across", "high", "new", "key", "within",
}


def extract_keywords(text: str, min_length: int = 3) -> set[str]:
    """
    Extract meaningful keywords from text.
    Returns a set of lowercase, normalised tokens.
    """
    if not text or not isinstance(text, str):
        return set()

    # Lowercase and extract alphabetic tokens
    tokens = re.findall(r"\b[a-zA-Z][a-zA-Z0-9\+\#\.]*\b", text.lower())

    # Filter: min length, not a stop word
    keywords = {
        t for t in tokens
        if len(t) >= min_length and t not in STOP_WORDS
    }

    return keywords


def keyword_match_score(cv_keywords: set[str], job_text: str) -> dict:
    """
    Compute keyword overlap between CV keywords and a job description.

    Returns:
        dict with 'matched_keywords', 'match_count', 'keyword_score' (0-100)
    """
    job_keywords = extract_keywords(job_text)

    if not cv_keywords or not job_keywords:
        return {"matched_keywords": [], "match_count": 0, "keyword_score": 0}

    matched = cv_keywords & job_keywords
    match_count = len(matched)

    # Score: percentage of CV keywords found in JD (capped at 100)
    keyword_score = min(100, int((match_count / max(len(cv_keywords), 1)) * 100))

    return {
        "matched_keywords": sorted(matched),
        "match_count": match_count,
        "keyword_score": keyword_score,
    }


def pre_filter_jobs(
    jobs_df: pd.DataFrame,
    cv_text: str,
    extra_keywords: list[str],
    min_keyword_matches: int = 2,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """
    Pre-filter jobs using keyword matching before AI scoring.

    Args:
        jobs_df: DataFrame of scraped jobs.
        cv_text: Full CV/profile text.
        extra_keywords: Additional keywords from config.
        min_keyword_matches: Minimum keyword matches to pass filter.

    Returns:
        (passing_df, rejected_df) - jobs that passed / failed the filter.
    """
    if jobs_df.empty:
        return jobs_df.copy(), pd.DataFrame()

    # Build CV keyword set from both CV text and configured keywords
    cv_keywords = extract_keywords(cv_text)
    for kw in extra_keywords:
        cv_keywords.update(extract_keywords(kw))
        cv_keywords.add(kw.lower().strip())

    logger.info(f"[KeywordFilter] CV has {len(cv_keywords)} unique keywords")

    passing = []
    rejected = []

    for idx, row in jobs_df.iterrows():
        # Combine title + description for matching
        job_text = f"{row.get('title', '')} {row.get('description', '')}"
        result = keyword_match_score(cv_keywords, job_text)

        jobs_df.at[idx, "keyword_match_count"] = result["match_count"]
        jobs_df.at[idx, "keyword_score"] = result["keyword_score"]
        jobs_df.at[idx, "keyword_matches"] = ", ".join(result["matched_keywords"][:20])

        if result["match_count"] >= min_keyword_matches:
            passing.append(idx)
        else:
            rejected.append(idx)

    passing_df = jobs_df.loc[passing].copy() if passing else pd.DataFrame()
    rejected_df = jobs_df.loc[rejected].copy() if rejected else pd.DataFrame()

    logger.info(
        f"[KeywordFilter] {len(passing_df)} passed filter, "
        f"{len(rejected_df)} rejected (min {min_keyword_matches} matches)"
    )

    return passing_df, rejected_df


def load_cv_text(cv_path: str) -> str:
    """Load CV bank text from file."""
    try:
        with open(cv_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        logger.error(f"CV file not found: {cv_path}")
        return ""
    except Exception as e:
        logger.error(f"Error loading CV: {e}")
        return ""
