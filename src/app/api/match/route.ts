import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { CVProfile, JobListing, MatchResult } from '@/types';

const client = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const { profile, jobs }: { profile: CVProfile; jobs: JobListing[] } = await request.json();

    if (!profile?.rawText) {
      return NextResponse.json({ error: 'Profile CV text is required' }, { status: 400 });
    }

    if (!jobs?.length) {
      return NextResponse.json({ results: [] });
    }

    // Batch jobs to avoid huge prompts — process in groups of 5
    const BATCH_SIZE = 5;
    const allResults: Array<{ id: string; match: MatchResult }> = [];

    for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
      const batch = jobs.slice(i, i + BATCH_SIZE);
      const batchResults = await matchBatch(profile, batch);
      allResults.push(...batchResults);
    }

    return NextResponse.json({ results: allResults });
  } catch (err) {
    console.error('Match API error:', err);
    return NextResponse.json(
      { error: 'Matching failed', details: String(err) },
      { status: 500 }
    );
  }
}

async function matchBatch(
  profile: CVProfile,
  jobs: JobListing[]
): Promise<Array<{ id: string; match: MatchResult }>> {
  const jobsBlock = jobs
    .map(
      (j, idx) =>
        `--- JOB ${idx + 1} (id: ${j.id}) ---
Title: ${j.title}
Company: ${j.company}
Location: ${j.location}
Description: ${j.description.substring(0, 1500)}`
    )
    .join('\n\n');

  const prompt = `You are an expert career advisor and recruiter. Analyse how well a candidate's CV matches each job listing.

CANDIDATE CV:
${profile.rawText}

JOBS TO EVALUATE:
${jobsBlock}

For EACH job, return a JSON object with these exact keys:
- "id": the job id string
- "score": integer 0–100 (how well the candidate matches)
- "reason": 1–2 sentence summary explaining the score
- "strengths": array of 2–3 bullet strings showing what matches well
- "gaps": array of 1–2 bullet strings showing what's missing or weak

Scoring guide:
90–100: Exceptional match — candidate exceeds requirements
75–89: Strong match — most requirements met, minor gaps
60–74: Good match — core skills align, some gaps
45–59: Moderate match — transferable skills but notable gaps
30–44: Weak match — some relevance but significant gaps
0–29: Poor match

Return a JSON array of objects only. No markdown, no explanation outside JSON.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    // Strip any markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return parsed.map((item: { id: string; score: number; reason: string; strengths: string[]; gaps: string[] }) => ({
      id: item.id,
      match: {
        score: item.score,
        reason: item.reason,
        strengths: item.strengths || [],
        gaps: item.gaps || [],
      } as MatchResult,
    }));
  } catch {
    console.error('Failed to parse match response:', text);
    // Fallback: return 50% for all
    return jobs.map((j) => ({
      id: j.id,
      match: { score: 50, reason: 'Unable to compute match score.', strengths: [], gaps: [] },
    }));
  }
}
