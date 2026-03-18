'use client';

import { JobListing } from '@/types';
import MatchBadge from './MatchBadge';
import SourceBadge from './SourceBadge';

interface JobCardProps {
  job: JobListing;
  onClick: () => void;
  isMatching?: boolean;
}

export default function JobCard({ job, onClick, isMatching }: JobCardProps) {
  return (
    <div
      onClick={onClick}
      className="group bg-white border border-gray-200 rounded-2xl p-5 cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all duration-200 hover:-translate-y-0.5 relative overflow-hidden"
    >
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 to-blue-50/0 group-hover:from-blue-50/30 group-hover:to-indigo-50/20 transition-all duration-300 rounded-2xl pointer-events-none" />

      <div className="relative">
        {/* Top row */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <SourceBadge source={job.source} />
              {job.jobType && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">
                  {job.jobType}
                </span>
              )}
            </div>
            <h3 className="font-bold text-gray-900 text-base leading-tight group-hover:text-blue-700 transition-colors line-clamp-2">
              {job.title}
            </h3>
          </div>

          <div className="flex-shrink-0">
            {isMatching ? (
              <div className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-full">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Matching...
              </div>
            ) : job.matchScore !== undefined ? (
              <MatchBadge score={job.matchScore} />
            ) : null}
          </div>
        </div>

        {/* Company & location */}
        <p className="text-sm font-semibold text-gray-700 mb-1">{job.company}</p>
        <div className="flex items-center gap-1 text-sm text-gray-500 mb-3">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {job.location}
        </div>

        {/* Short description */}
        <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed mb-3">
          {job.shortDescription}
        </p>

        {/* Bottom row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {job.salary && (
              <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                {job.salary}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {job.postedDate && (
              <span className="text-xs text-gray-400">
                {new Date(job.postedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
            )}
            <span className="text-xs text-blue-600 font-medium group-hover:underline flex items-center gap-0.5">
              View details
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
