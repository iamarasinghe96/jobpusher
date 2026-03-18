'use client';

interface MatchBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function MatchBadge({ score, size = 'md' }: MatchBadgeProps) {
  const getColors = () => {
    if (score >= 85) return { bg: 'bg-emerald-100', text: 'text-emerald-800', ring: 'ring-emerald-400', bar: 'bg-emerald-500' };
    if (score >= 70) return { bg: 'bg-green-100', text: 'text-green-800', ring: 'ring-green-400', bar: 'bg-green-500' };
    if (score >= 55) return { bg: 'bg-yellow-100', text: 'text-yellow-800', ring: 'ring-yellow-400', bar: 'bg-yellow-500' };
    if (score >= 40) return { bg: 'bg-orange-100', text: 'text-orange-800', ring: 'ring-orange-400', bar: 'bg-orange-500' };
    return { bg: 'bg-red-100', text: 'text-red-800', ring: 'ring-red-400', bar: 'bg-red-400' };
  };

  const getLabel = () => {
    if (score >= 85) return 'Excellent';
    if (score >= 70) return 'Strong';
    if (score >= 55) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Weak';
  };

  const { bg, text, ring, bar } = getColors();

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${bg} ${text} ${ring} ${sizeClasses[size]} font-semibold`}>
      <div className="w-12 h-1.5 rounded-full bg-gray-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span>{score}%</span>
      <span className="opacity-70 font-normal">{getLabel()}</span>
    </div>
  );
}
