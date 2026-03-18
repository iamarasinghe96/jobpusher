export interface JobListing {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  shortDescription: string;
  salary?: string;
  jobType?: string;
  postedDate?: string;
  applyUrl: string;
  source: 'seek' | 'linkedin' | 'indeed' | 'glassdoor' | 'mock';
  matchScore?: number;
  matchReason?: string;
  requirements?: string[];
  benefits?: string[];
}

export interface CVProfile {
  rawText: string;
  name?: string;
  skills?: string[];
  experience?: string;
  education?: string;
  summary?: string;
}

export interface SearchConfig {
  locations: LocationOption[];
  radius: number;
  matchThreshold: number;
  keywords?: string;
  jobTypes: string[];
}

export interface LocationOption {
  id: string;
  label: string;
  searchTerms: string[];
  enabled: boolean;
  region: 'albury-wodonga' | 'vline-corridor' | 'melbourne';
}

export interface JobSearchRequest {
  profile: CVProfile;
  config: SearchConfig;
}

export interface MatchResult {
  score: number;
  reason: string;
  strengths: string[];
  gaps: string[];
}
