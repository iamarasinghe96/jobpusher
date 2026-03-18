'use client';

import { JobListing } from '@/types';

const SOURCE_CONFIG: Record<JobListing['source'], { label: string; bg: string; text: string }> = {
  seek: { label: 'Seek', bg: 'bg-[#e8f5e9]', text: 'text-[#1b5e20]' },
  linkedin: { label: 'LinkedIn', bg: 'bg-[#e3f2fd]', text: 'text-[#0d47a1]' },
  indeed: { label: 'Indeed', bg: 'bg-[#fff3e0]', text: 'text-[#e65100]' },
  glassdoor: { label: 'Glassdoor', bg: 'bg-[#f3e5f5]', text: 'text-[#6a1b9a]' },
  mock: { label: 'Demo', bg: 'bg-gray-100', text: 'text-gray-600' },
};

export default function SourceBadge({ source }: { source: JobListing['source'] }) {
  const config = SOURCE_CONFIG[source] || SOURCE_CONFIG.mock;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
}
