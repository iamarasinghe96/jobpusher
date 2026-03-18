'use client';

interface ThresholdSliderProps {
  value: number;
  onChange: (value: number) => void;
}

const PRESETS = [
  { label: 'Exact', value: 85, color: 'text-emerald-600' },
  { label: 'Strong', value: 70, color: 'text-green-600' },
  { label: 'Good', value: 55, color: 'text-yellow-600' },
  { label: 'Any', value: 30, color: 'text-gray-500' },
];

export default function ThresholdSlider({ value, onChange }: ThresholdSliderProps) {
  const getColor = () => {
    if (value >= 80) return 'text-emerald-600';
    if (value >= 65) return 'text-green-600';
    if (value >= 50) return 'text-yellow-600';
    if (value >= 35) return 'text-orange-500';
    return 'text-gray-500';
  };

  const getLabel = () => {
    if (value >= 85) return 'Excellent matches only';
    if (value >= 70) return 'Strong matches';
    if (value >= 55) return 'Good matches';
    if (value >= 40) return 'Fair matches included';
    return 'All jobs included';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Min. Match Score</span>
        <span className={`text-lg font-bold ${getColor()}`}>{value}%</span>
      </div>

      <div className="relative">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-2 rounded-full appearance-none cursor-pointer accent-blue-600"
          style={{
            background: `linear-gradient(to right, #2563eb ${value}%, #e5e7eb ${value}%)`,
          }}
        />
      </div>

      <p className="text-xs text-gray-500">{getLabel()}</p>

      <div className="flex gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            onClick={() => onChange(preset.value)}
            className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-all ${
              value === preset.value
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
