"""
Score jobs with Claude AI — reads CSV or Excel, writes scores back.

Usage:
    python score_with_claude.py jobs.csv
    python score_with_claude.py jobs.xlsx
    python score_with_claude.py jobs.csv --min-score 70
    python score_with_claude.py jobs.csv --model claude-haiku-4-5   # cheaper

Requirements:
    pip install anthropic pandas openpyxl

Setup:
    Set ANTHROPIC_API_KEY in your environment or in a .env file.
"""

import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv

load_dotenv()

# ── CV text loaded from profile.md (same source as the rest of the pipeline) ──
CV_FILE = Path(__file__).parent / "cv_bank" / "profile.md"

DEFAULT_MODEL = "claude-opus-4-6"   # change to claude-haiku-4-5 for lower cost
DELAY_SECONDS = 0.5                 # pause between requests (be kind to the API)


def load_cv() -> str:
    if CV_FILE.exists():
        return CV_FILE.read_text(encoding="utf-8").strip()
    # Fallback inline summary
    return """
Delivery Lead / Project Manager, 6.5+ years.
Skills: ESG/sustainable finance, PCAF, TNFD, CSRD, AI integration,
Excel automation, stakeholder management, Agile delivery, data analytics.
Recent: Acuity Knowledge Partners (climate transition tool, 2000+ clients),
Huawei Technologies (KAM, $1.3M sales).
Location: Albury NSW, open to remote or Vline corridor.
Visa: Subclass 485, unrestricted, valid 2029.
""".strip()


def score_job(client, job: dict, cv_text: str, model: str) -> dict:
    """Call Claude to score one job. Returns dict with score fields."""
    title = job.get("title", "")
    company = job.get("company", "")
    location = job.get("location", "")
    description = str(job.get("description", ""))[:3000]

    prompt = f"""You are an expert job matching assistant.

=== CANDIDATE PROFILE ===
{cv_text[:4000]}

=== JOB POSTING ===
Title: {title}
Company: {company}
Location: {location}

Description:
{description}

=== INSTRUCTIONS ===
Score how well the candidate matches this job on a scale of 0-100.
Respond with ONLY a valid JSON object, nothing else:
{{
  "score": <integer 0-100>,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "summary": "<2-3 sentence explanation>",
  "recommendation": "<apply|consider|skip>"
}}"""

    response = client.messages.create(
        model=model,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )

    import json
    text = response.content[0].text.strip()
    # Strip markdown fences if present
    text = text.replace("```json", "").replace("```", "").strip()
    result = json.loads(text)

    return {
        "match_score": result.get("score", 0),
        "match_summary": result.get("summary", ""),
        "matched_skills": ", ".join(result.get("matched_skills", [])),
        "missing_skills": ", ".join(result.get("missing_skills", [])),
        "recommendation": result.get("recommendation", ""),
    }


def main():
    parser = argparse.ArgumentParser(description="Score jobs with Claude AI")
    parser.add_argument("file", help="Path to CSV or Excel file with jobs")
    parser.add_argument("--min-score", type=int, default=60,
                        help="Minimum score to flag (default: 60)")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help=f"Claude model to use (default: {DEFAULT_MODEL})")
    parser.add_argument("--skip-scored", action="store_true", default=True,
                        help="Skip rows that already have a match_score (default: true)")
    args = parser.parse_args()

    # Check API key
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.")
        print("  Set it in your .env file or run: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    # Load file
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"ERROR: File not found: {file_path}")
        sys.exit(1)

    print(f"Loading: {file_path}")
    if file_path.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(file_path)
    else:
        df = pd.read_csv(file_path)
    print(f"Loaded {len(df)} rows")

    # Ensure output columns exist
    for col in ["match_score", "match_summary", "matched_skills", "missing_skills", "recommendation"]:
        if col not in df.columns:
            df[col] = ""

    # Load CV
    cv_text = load_cv()

    # Init Claude client
    import anthropic
    client = anthropic.Anthropic(api_key=api_key)

    # Score rows
    scored = skipped = failed = 0
    for i, row in df.iterrows():
        existing = row.get("match_score", "")
        if args.skip_scored and str(existing).strip() not in ("", "nan", "None", "FAILED"):
            skipped += 1
            continue

        title = row.get("title", row.get("Title", ""))
        description = row.get("description", row.get("Description", ""))
        if not title and not description:
            skipped += 1
            continue

        print(f"  [{i+1}/{len(df)}] Scoring: {title} @ {row.get('company', row.get('Company', ''))}")

        try:
            result = score_job(client, dict(row), cv_text, args.model)
            for col, val in result.items():
                df.at[i, col] = val
            scored += 1
        except Exception as e:
            print(f"    FAILED: {e}")
            df.at[i, "match_score"] = "FAILED"
            failed += 1

        time.sleep(DELAY_SECONDS)

    # Save output
    out_path = file_path.parent / (file_path.stem + "_scored" + file_path.suffix)
    if file_path.suffix.lower() in (".xlsx", ".xls"):
        df.to_excel(out_path, index=False)
    else:
        df.to_csv(out_path, index=False)

    # Summary
    try:
        above = len(df[pd.to_numeric(df["match_score"], errors="coerce") >= args.min_score])
    except Exception:
        above = 0

    print()
    print("=" * 50)
    print(f"Done!  Scored: {scored}  Skipped: {skipped}  Failed: {failed}")
    print(f"Jobs above {args.min_score}%: {above}")
    print(f"Output saved to: {out_path}")
    print("=" * 50)


if __name__ == "__main__":
    main()
