import axios from 'axios';
import { JobListing } from '@/types';

// Seek API via RapidAPI
interface SeekJob {
  id: string;
  title: string;
  advertiser: { description: string };
  location: string;
  area: string;
  salary?: string;
  workType?: string;
  listingDate?: string;
  jobDescription?: string;
  teaser: string;
  bulletPoints?: string[];
  shareLink?: string;
}

export async function fetchSeekJobs(
  keywords: string,
  location: string,
  apiKey: string
): Promise<JobListing[]> {
  try {
    const response = await axios.get('https://seek-job-search.p.rapidapi.com/api/seekJobs', {
      params: {
        keywords,
        location,
        country: 'AU',
        pageSize: 20,
      },
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'seek-job-search.p.rapidapi.com',
      },
      timeout: 10000,
    });

    const jobs: SeekJob[] = response.data?.jobs || response.data?.data || [];

    return jobs.map((job) => ({
      id: `seek-${job.id}`,
      title: job.title,
      company: job.advertiser?.description || 'Unknown',
      location: `${job.location || ''} ${job.area || ''}`.trim(),
      description: job.jobDescription || job.teaser || '',
      shortDescription: job.teaser || truncate(job.jobDescription || '', 180),
      salary: job.salary,
      jobType: job.workType,
      postedDate: job.listingDate?.split('T')[0],
      applyUrl: job.shareLink || `https://www.seek.com.au/job/${job.id}`,
      source: 'seek' as const,
      requirements: job.bulletPoints || [],
    }));
  } catch (err) {
    console.error('Seek API error:', err);
    return [];
  }
}

function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
}
