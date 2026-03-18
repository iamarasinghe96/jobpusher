'use client';

import { useState, useEffect } from 'react';
import { JobListing } from '@/types';
import MatchBadge from './MatchBadge';
import SourceBadge from './SourceBadge';

interface JobModalProps {
  job: JobListing | null;
  onClose: () => void;
}

function formatDescription(text: string): string {
  // Convert markdown-ish formatting to readable text
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1');
}

export default function JobModal({ job, onClose }: JobModalProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    if (job) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [job]);

  if (!job) return null;

  const handleCopy = async () => {
    const text = `${job.title}\n${job.company} — ${job.location}\n${job.salary ? `Salary: ${job.salary}\n` : ''}${job.jobType ? `Type: ${job.jobType}\n` : ''}\n${job.description}\n\nApply: ${job.applyUrl}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderDescription = (desc: string) => {
    const lines = desc.split('\n');
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-2" />;
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        return <h3 key={i} className="font-semibold text-gray-900 mt-4 mb-1">{trimmed.slice(2, -2)}</h3>;
      }
      if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
        return (
          <div key={i} className="flex gap-2 ml-2 text-gray-700">
            <span className="text-gray-400 mt-0.5">•</span>
            <span>{trimmed.slice(2)}</span>
          </div>
        );
      }
      return <p key={i} className="text-gray-700 leading-relaxed">{formatDescription(trimmed)}</p>;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 sm:pt-16"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <SourceBadge source={job.source} />
              {job.jobType && (
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                  {job.jobType}
                </span>
              )}
              {job.matchScore !== undefined && (
                <MatchBadge score={job.matchScore} />
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{job.title}</h2>
            <p className="text-gray-600 mt-1 font-medium">{job.company}</p>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {job.location}
              </span>
              {job.salary && (
                <span className="flex items-center gap-1 text-emerald-700 font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {job.salary}
                </span>
              )}
              {job.postedDate && (
                <span>Posted {new Date(job.postedDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Match analysis (if available) */}
        {job.matchReason && (
          <div className="mx-6 mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-sm font-semibold text-blue-900 mb-1">AI Match Analysis</p>
            <p className="text-sm text-blue-800">{job.matchReason}</p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {renderDescription(job.description)}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 p-6 border-t border-gray-100">
          <a
            href={job.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Apply Now
          </a>
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border font-semibold text-sm transition-all ${
              copied
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy JD
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
