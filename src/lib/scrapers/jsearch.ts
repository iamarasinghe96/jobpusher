import axios from 'axios';
import { JobListing } from '@/types';

interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_city: string;
  job_state: string;
  job_country: string;
  job_description: string;
  job_salary_currency?: string;
  job_min_salary?: number;
  job_max_salary?: number;
  job_employment_type?: string;
  job_posted_at_datetime_utc?: string;
  job_apply_link?: string;
  job_publisher?: string;
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
    Benefits?: string[];
  };
}

export async function fetchJSearchJobs(
  query: string,
  location: string,
  apiKey: string
): Promise<JobListing[]> {
  try {
    const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
      params: {
        query: `${query} in ${location}`,
        page: '1',
        num_pages: '2',
        date_posted: 'week',
      },
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
      timeout: 10000,
    });

    if (!response.data?.data) return [];

    return response.data.data.map((job: JSearchJob) => {
      const salary = formatSalary(job);
      const source = mapSource(job.job_publisher);
      return {
        id: `jsearch-${job.job_id}`,
        title: job.job_title,
        company: job.employer_name,
        location: `${job.job_city || ''} ${job.job_state || ''}`.trim(),
        description: job.job_description || '',
        shortDescription: truncate(job.job_description || '', 180),
        salary,
        jobType: job.job_employment_type,
        postedDate: job.job_posted_at_datetime_utc?.split('T')[0],
        applyUrl: job.job_apply_link || '',
        source,
        requirements: job.job_highlights?.Qualifications || [],
        benefits: job.job_highlights?.Benefits || [],
      } as JobListing;
    });
  } catch (err) {
    console.error('JSearch API error:', err);
    return [];
  }
}

function formatSalary(job: JSearchJob): string | undefined {
  if (!job.job_min_salary && !job.job_max_salary) return undefined;
  const currency = job.job_salary_currency || 'AUD';
  if (job.job_min_salary && job.job_max_salary) {
    return `${currency} $${job.job_min_salary.toLocaleString()}–$${job.job_max_salary.toLocaleString()}`;
  }
  return `${currency} $${(job.job_min_salary || job.job_max_salary)?.toLocaleString()}`;
}

function mapSource(publisher?: string): JobListing['source'] {
  const p = (publisher || '').toLowerCase();
  if (p.includes('linkedin')) return 'linkedin';
  if (p.includes('indeed')) return 'indeed';
  if (p.includes('glassdoor')) return 'glassdoor';
  if (p.includes('seek')) return 'seek';
  return 'indeed';
}

function truncate(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.substring(0, length).trim() + '...';
}
