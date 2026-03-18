'use client';

import { useState, useCallback, useEffect } from 'react';
import JobCard from '@/components/JobCard';
import JobModal from '@/components/JobModal';
import ProfileSetup from '@/components/ProfileSetup';
import ThresholdSlider from '@/components/ThresholdSlider';
import LocationFilter from '@/components/LocationFilter';
import { JobListing, CVProfile, SearchConfig, LocationOption } from '@/types';
import { LOCATIONS, JOB_TYPES } from '@/lib/constants';

type SortOption = 'match' | 'recent' | 'salary';
type ViewMode = 'grid' | 'list';

const STORAGE_KEY_PROFILE = 'jobpusher_profile';
const STORAGE_KEY_CONFIG = 'jobpusher_config';

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? (JSON.parse(item) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Home() {
  const [profile, setProfile] = useState<CVProfile | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>(LOCATIONS);
  const [matchThreshold, setMatchThreshold] = useState(55);
  const [keywords, setKeywords] = useState('');
  const [selectedJobTypes, setSelectedJobTypes] = useState<string[]>([]);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchingIds, setMatchingIds] = useState<Set<string>>(new Set());
  const [selectedJob, setSelectedJob] = useState<JobListing | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('match');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const savedProfile = loadFromStorage<CVProfile | null>(STORAGE_KEY_PROFILE, null);
    const savedConfig = loadFromStorage<{ locations?: LocationOption[]; threshold?: number; keywords?: string } | null>(STORAGE_KEY_CONFIG, null);
    if (savedProfile) setProfile(savedProfile);
    if (savedConfig?.locations) setLocations(savedConfig.locations);
    if (savedConfig?.threshold) setMatchThreshold(savedConfig.threshold);
    if (savedConfig?.keywords) setKeywords(savedConfig.keywords);
  }, []);

  const saveConfig = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ locations, threshold: matchThreshold, keywords }));
    }
  }, [locations, matchThreshold, keywords]);

  const handleSaveProfile = (p: CVProfile) => {
    setProfile(p);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(p));
    }
  };

  const handleSearch = async () => {
    if (!profile) {
      setShowProfile(true);
      return;
    }
    setError(null);
    setIsLoading(true);
    setJobs([]);
    setHasSearched(true);
    saveConfig();

    const config: SearchConfig = {
      locations,
      radius: 76,
      matchThreshold,
      jobTypes: selectedJobTypes,
    };

    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch jobs');

      setDemoMode(data.demoMode);
      const fetchedJobs: JobListing[] = data.jobs || [];
      setJobs(fetchedJobs);
      setIsLoading(false);

      if (fetchedJobs.length > 0) {
        await runMatching(fetchedJobs);
      }
    } catch (err) {
      setError(String(err));
      setIsLoading(false);
    }
  };

  const runMatching = async (jobsToMatch: JobListing[]) => {
    if (!profile) return;
    setIsMatching(true);
    setMatchingIds(new Set(jobsToMatch.map((j) => j.id)));

    try {
      const BATCH = 5;
      for (let i = 0; i < jobsToMatch.length; i += BATCH) {
        const batch = jobsToMatch.slice(i, i + BATCH);
        const res = await fetch('/api/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile, jobs: batch }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const results: Array<{ id: string; match: { score: number; reason: string } }> = data.results || [];
        setJobs((prev) =>
          prev.map((job) => {
            const result = results.find((r) => r.id === job.id);
            if (!result) return job;
            return { ...job, matchScore: result.match.score, matchReason: result.match.reason };
          })
        );
        setMatchingIds((prev) => {
          const next = new Set(prev);
          batch.forEach((j) => next.delete(j.id));
          return next;
        });
      }
    } catch (err) {
      console.error('Matching error:', err);
    } finally {
      setIsMatching(false);
      setMatchingIds(new Set());
    }
  };

  const filteredJobs = jobs
    .filter((j) => {
      if (j.matchScore !== undefined && j.matchScore < matchThreshold) return false;
      if (selectedJobTypes.length > 0 && j.jobType) {
        if (!selectedJobTypes.some((t) => j.jobType?.toLowerCase().includes(t.toLowerCase()))) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'match') return (b.matchScore ?? 50) - (a.matchScore ?? 50);
      if (sortBy === 'recent') return (b.postedDate || '').localeCompare(a.postedDate || '');
      const getSalary = (s?: string) => parseInt((s || '0').replace(/[^0-9]/g, '')) || 0;
      return getSalary(b.salary) - getSalary(a.salary);
    });

  const enabledLocCount = locations.filter((l) => l.enabled).length;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selectedJob) {
      const updated = jobs.find((j) => j.id === selectedJob.id);
      if (updated) setSelectedJob(updated);
    }
  }, [jobs]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m8 0H8m8 0a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-base leading-tight">JobPusher</h1>
              <p className="text-xs text-gray-400 leading-tight">AI-powered job matching</p>
            </div>
          </div>

          <div className="flex-1 flex items-center gap-2 max-w-xl ml-4">
            <div className="relative flex-1">
              <input
                type="text"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Job title, skills, or keywords..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={handleSearch}
              disabled={isLoading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Searching...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors hidden sm:flex items-center gap-1.5 text-xs font-medium"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
            </button>
            <button
              onClick={() => setShowProfile(true)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                profile
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-gray-100 border border-gray-200 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {profile ? 'CV Loaded' : 'Add CV'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar */}
        {showSidebar && (
          <aside className="hidden sm:block w-72 flex-shrink-0">
            <div className="space-y-5 sticky top-20">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <ThresholdSlider value={matchThreshold} onChange={setMatchThreshold} />
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-800 text-sm mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                  Locations
                  <span className="ml-auto text-xs text-gray-400">{enabledLocCount} selected</span>
                </h3>
                <LocationFilter locations={locations} onChange={setLocations} />
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-800 text-sm mb-3">Job Type</h3>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() =>
                        setSelectedJobTypes((prev) =>
                          prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                        )
                      }
                      className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                        selectedJobTypes.includes(type)
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-blue-300'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`rounded-2xl border p-4 ${profile ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${profile ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                    <svg className={`w-4 h-4 ${profile ? 'text-emerald-600' : 'text-amber-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {profile ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      )}
                    </svg>
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${profile ? 'text-emerald-800' : 'text-amber-800'}`}>
                      {profile ? 'CV Profile Ready' : 'No CV Profile'}
                    </p>
                    <p className={`text-xs mt-0.5 ${profile ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {profile
                        ? `${profile.rawText.length.toLocaleString()} chars · AI matching enabled`
                        : 'Add your CV for AI match scoring'}
                    </p>
                    {!profile && (
                      <button
                        onClick={() => setShowProfile(true)}
                        className="text-xs font-semibold text-amber-700 underline underline-offset-2 mt-1 hover:text-amber-900"
                      >
                        Add CV now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {demoMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">Demo Mode — Sample Jobs</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Add <code className="bg-amber-100 px-1 rounded text-xs">RAPIDAPI_KEY</code> and <code className="bg-amber-100 px-1 rounded text-xs">ANTHROPIC_API_KEY</code> to <code className="bg-amber-100 px-1 rounded text-xs">.env.local</code> for live job data from Seek, LinkedIn &amp; Indeed.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
              <p className="text-sm font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700 mt-0.5">{error}</p>
            </div>
          )}

          {jobs.length > 0 && (
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {filteredJobs.length} jobs
                  {filteredJobs.length !== jobs.length && (
                    <span className="font-normal text-gray-500"> (of {jobs.length} total)</span>
                  )}
                </p>
                {isMatching && (
                  <p className="text-xs text-blue-600 mt-0.5 flex items-center gap-1">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    AI is scoring matches...
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
                >
                  <option value="match">Sort: Best Match</option>
                  <option value="recent">Sort: Most Recent</option>
                  <option value="salary">Sort: Highest Salary</option>
                </select>

                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'} transition-colors`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'} transition-colors`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse">
                  <div className="flex gap-2 mb-3">
                    <div className="h-5 w-14 bg-gray-200 rounded-full" />
                    <div className="h-5 w-16 bg-gray-200 rounded-full" />
                  </div>
                  <div className="h-5 w-3/4 bg-gray-200 rounded mb-2" />
                  <div className="h-4 w-1/2 bg-gray-200 rounded mb-4" />
                  <div className="h-3 w-full bg-gray-100 rounded mb-1.5" />
                  <div className="h-3 w-5/6 bg-gray-100 rounded mb-4" />
                  <div className="flex justify-between">
                    <div className="h-5 w-28 bg-gray-100 rounded-full" />
                    <div className="h-4 w-16 bg-gray-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isLoading && !hasSearched && (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2-2v2m8 0H8m8 0a2 2 0 012 2v6a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Find Your Next Role</h2>
              <p className="text-gray-500 mb-2 max-w-md mx-auto text-sm">
                Search Seek, LinkedIn &amp; Indeed for jobs across Albury–Wodonga, the V/Line corridor, and Melbourne — scored by Claude AI against your CV.
              </p>
              <p className="text-gray-400 text-xs mb-6">Locations: Albury · Wodonga · Wangaratta · Benalla · Seymour · Melbourne</p>
              <div className="flex items-center gap-3 justify-center flex-wrap">
                {!profile && (
                  <button
                    onClick={() => setShowProfile(true)}
                    className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    1. Add your CV
                  </button>
                )}
                <button
                  onClick={handleSearch}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {profile ? 'Search Jobs' : '2. Search Jobs'}
                </button>
              </div>
            </div>
          )}

          {!isLoading && hasSearched && filteredJobs.length === 0 && jobs.length > 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
              <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 mb-1">No jobs above {matchThreshold}% match</h3>
              <p className="text-sm text-gray-500 mb-3">{jobs.length} jobs below your threshold — try lowering the match slider.</p>
              <button onClick={() => setMatchThreshold(30)} className="text-sm text-blue-600 font-semibold hover:underline">
                Show all jobs
              </button>
            </div>
          )}

          {!isLoading && filteredJobs.length > 0 && (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'}>
              {filteredJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onClick={() => setSelectedJob(job)}
                  isMatching={matchingIds.has(job.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {showProfile && (
        <ProfileSetup profile={profile} onSave={handleSaveProfile} onClose={() => setShowProfile(false)} />
      )}
      {selectedJob && (
        <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      )}
    </div>
  );
}
