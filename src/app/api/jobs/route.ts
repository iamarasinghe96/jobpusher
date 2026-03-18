import { NextRequest, NextResponse } from 'next/server';
import { fetchJSearchJobs } from '@/lib/scrapers/jsearch';
import { fetchSeekJobs } from '@/lib/scrapers/seek';
import { MOCK_JOBS } from '@/lib/mockJobs';
import { JobListing, SearchConfig } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config, keywords }: { config: SearchConfig; keywords: string } = body;

    const jsearchKey = process.env.RAPIDAPI_KEY;
    const seekKey = process.env.RAPIDAPI_KEY ?? '';

    const enabledLocations = config.locations.filter((l) => l.enabled);

    if (!jsearchKey) {
      // Return mock data with a flag indicating demo mode
      const filteredMocks = filterMocksByLocations(MOCK_JOBS, enabledLocations.map((l) => l.label));
      return NextResponse.json({
        jobs: filteredMocks,
        total: filteredMocks.length,
        demoMode: true,
        message: 'Running in demo mode — add RAPIDAPI_KEY to .env.local for live job data.',
      });
    }

    const allJobs: JobListing[] = [];
    const seen = new Set<string>();

    // Fetch from JSearch for each enabled location
    const searchKeywords = keywords || 'software engineer developer IT';

    for (const location of enabledLocations) {
      for (const searchTerm of location.searchTerms.slice(0, 1)) {
        const jobs = await fetchJSearchJobs(searchKeywords, searchTerm, jsearchKey);
        for (const job of jobs) {
          const key = `${job.title}-${job.company}`.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            allJobs.push(job);
          }
        }
      }
    }

    // Fetch from Seek for primary locations
    const primaryLocations = enabledLocations.filter(
      (l) => l.region === 'albury-wodonga' || l.region === 'melbourne'
    );
    for (const location of primaryLocations.slice(0, 3)) {
      const jobs = await fetchSeekJobs(searchKeywords, location.searchTerms[0], seekKey);
      for (const job of jobs) {
        const key = `${job.title}-${job.company}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          allJobs.push(job);
        }
      }
    }

    return NextResponse.json({
      jobs: allJobs,
      total: allJobs.length,
      demoMode: false,
    });
  } catch (err) {
    console.error('Jobs API error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch jobs', details: String(err) },
      { status: 500 }
    );
  }
}

function filterMocksByLocations(jobs: JobListing[], locationLabels: string[]): JobListing[] {
  if (locationLabels.length === 0) return jobs;
  return jobs.filter((job) =>
    locationLabels.some((label) =>
      job.location.toLowerCase().includes(label.toLowerCase().split(' ')[0])
    )
  );
}
