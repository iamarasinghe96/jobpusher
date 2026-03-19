"""
Gemini AI-powered job matching.
Uses Google Gemini 1.5 Flash (free tier) to score each job against your CV.

Free tier limits (as of 2024):
  - 15 requests per minute
  - 1,500 requests per day
  - 1M tokens per minute
"""

import json
import logging
import time
import re
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# Gemini scoring prompt template
SCORING_PROMPT = """You are an expert job matching assistant. Analyse how well this candidate matches the job.

=== CANDIDATE PROFILE ===
{cv_bank}

=== JOB POSTING ===
Title: {job_title}
Company: {company}
Location: {location}
Job Type: {job_type}

Description:
{job_description}

=== INSTRUCTIONS ===
Score how well the candidate matches this job on a scale of 0-100.

Consider:
- Skills alignment (technical and soft skills)
- Experience level match
- Industry/sector fit
- Location suitability
- Responsibility overlap

Respond with ONLY a valid JSON object (no markdown, no explanation outside JSON):
{{
  "score": <integer 0-100>,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "summary": "<2-3 sentence explanation of the match>",
  "recommendation": "<apply|consider|skip>"
}}

Score guide:
- 85-100: Excellent match - candidate exceeds most requirements
- 70-84: Strong match - candidate meets most requirements
- 55-69: Moderate match - candidate meets core requirements
- 40-54: Partial match - some transferable skills
- 0-39: Poor match - limited alignment
"""


def score_jobs_with_gemini(
    jobs_df: pd.DataFrame,
    cv_text: str,
    gemini_api_key: str,
    model: str = "gemini-1.5-flash",
    min_score: int = 0,
    requests_per_minute: int = 14,
) -> pd.DataFrame:
    """
    Score each job in the DataFrame using Gemini AI.

    Args:
        jobs_df: DataFrame of jobs to score (pre-filtered).
        cv_text: Full CV/profile text.
        gemini_api_key: Google Gemini API key.
        model: Gemini model to use.
        min_score: Minimum score to include (0 = include all scored jobs).
        requests_per_minute: Rate limit (Gemini free = 15 RPM).

    Returns:
        DataFrame with match_score, match_summary, matched_skills, missing_skills added.
    """
    if jobs_df.empty:
        return jobs_df

    try:
        import google.generativeai as genai
    except ImportError:
        logger.error("google-generativeai not installed. Run: pip install google-generativeai")
        return jobs_df

    genai.configure(api_key=gemini_api_key)
    gemini = genai.GenerativeModel(model)

    delay = 60.0 / requests_per_minute  # Seconds between requests
    total = len(jobs_df)
    scored = []

    logger.info(f"[Gemini] Scoring {total} jobs (rate: {requests_per_minute} RPM)...")

    for i, (idx, row) in enumerate(jobs_df.iterrows(), 1):
        job_title = str(row.get("title", ""))
        company = str(row.get("company", ""))
        location = str(row.get("location", ""))
        job_type = str(row.get("job_type", ""))
        description = str(row.get("description", ""))

        # Truncate description to avoid token limits (keep first ~3000 chars)
        description = description[:3000] if len(description) > 3000 else description

        prompt = SCORING_PROMPT.format(
            cv_bank=cv_text[:4000],  # Limit CV to ~4000 chars
            job_title=job_title,
            company=company,
            location=location,
            job_type=job_type,
            job_description=description,
        )

        logger.info(f"[Gemini] ({i}/{total}) Scoring: {job_title} @ {company}")

        result = _call_gemini_with_retry(gemini, prompt)

        if result:
            jobs_df.at[idx, "match_score"] = result.get("score", 0)
            jobs_df.at[idx, "match_summary"] = result.get("summary", "")
            jobs_df.at[idx, "matched_skills"] = json.dumps(result.get("matched_skills", []))
            jobs_df.at[idx, "missing_skills"] = json.dumps(result.get("missing_skills", []))
            jobs_df.at[idx, "recommendation"] = result.get("recommendation", "")
            scored.append(idx)
        else:
            jobs_df.at[idx, "match_score"] = 0
            jobs_df.at[idx, "match_summary"] = "Scoring failed"

        # Respect rate limit
        if i < total:
            time.sleep(delay)

    logger.info(f"[Gemini] Scored {len(scored)}/{total} jobs successfully")

    # Filter by minimum score
    if min_score > 0:
        jobs_df = jobs_df[jobs_df["match_score"] >= min_score]
        logger.info(f"[Gemini] {len(jobs_df)} jobs above minimum score {min_score}")

    return jobs_df.sort_values("match_score", ascending=False).reset_index(drop=True)


def _call_gemini_with_retry(
    model,
    prompt: str,
    max_retries: int = 3,
) -> Optional[dict]:
    """Call Gemini with retry logic for rate limits."""
    for attempt in range(max_retries):
        try:
            response = model.generate_content(prompt)
            text = response.text.strip()

            # Strip markdown code blocks if present
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```$", "", text)

            return json.loads(text)

        except json.JSONDecodeError as e:
            logger.warning(f"[Gemini] JSON parse error (attempt {attempt + 1}): {e}")
            logger.debug(f"Raw response: {response.text[:500]}")
            # Try to extract JSON from partial response
            extracted = _extract_json(response.text)
            if extracted:
                return extracted

        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "quota" in error_str.lower():
                wait_time = (attempt + 1) * 30
                logger.warning(f"[Gemini] Rate limit hit. Waiting {wait_time}s...")
                time.sleep(wait_time)
            else:
                logger.warning(f"[Gemini] Error (attempt {attempt + 1}): {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)

    return None


def _extract_json(text: str) -> Optional[dict]:
    """Try to extract a JSON object from text that may have extra content."""
    # Look for { ... } pattern
    match = re.search(r'\{[^{}]*"score"[^{}]*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass

    # Try finding any valid JSON object
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except Exception:
            pass

    return None


def generate_cv_prompt_template(cv_text: str) -> str:
    """
    Generate a standalone prompt template you can use manually in Claude/Gemini.
    Paste job keywords after the CV section and run it yourself.
    """
    template = f"""
=== JOB MATCHING PROMPT (Manual Use) ===
Paste this into Claude or Gemini, then add the job keywords/description at the bottom.

CANDIDATE PROFILE:
{cv_text}

JOB DESCRIPTION / KEYWORDS:
[PASTE JOB DESCRIPTION OR KEYWORDS HERE]

TASK:
Score the match between the candidate and this job (0-100).
Output a table with:
| Category | Score (0-10) | Notes |
|----------|-------------|-------|
| Skills Match | | |
| Experience Level | | |
| Industry Fit | | |
| Responsibilities | | |
| Overall | | |

Overall Match: X/100

Top 5 matching keywords:
Top 3 missing keywords:
Recommendation: apply | consider | skip
"""
    return template
