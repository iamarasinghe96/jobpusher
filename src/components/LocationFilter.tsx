'use client';

import { LocationOption } from '@/types';

interface LocationFilterProps {
  locations: LocationOption[];
  onChange: (locations: LocationOption[]) => void;
}

const REGION_LABELS: Record<LocationOption['region'], string> = {
  'albury-wodonga': 'Albury–Wodonga Region',
  'vline-corridor': 'V/Line Corridor',
  'melbourne': 'Melbourne',
};

const REGION_ICONS: Record<LocationOption['region'], string> = {
  'albury-wodonga': '🏘️',
  'vline-corridor': '🚂',
  'melbourne': '🏙️',
};

export default function LocationFilter({ locations, onChange }: LocationFilterProps) {
  const regions = [...new Set(locations.map((l) => l.region))];

  const toggle = (id: string) => {
    onChange(locations.map((l) => l.id === id ? { ...l, enabled: !l.enabled } : l));
  };

  const toggleRegion = (region: LocationOption['region']) => {
    const regionLocs = locations.filter((l) => l.region === region);
    const allEnabled = regionLocs.every((l) => l.enabled);
    onChange(locations.map((l) => l.region === region ? { ...l, enabled: !allEnabled } : l));
  };

  return (
    <div className="space-y-4">
      {regions.map((region) => {
        const regionLocs = locations.filter((l) => l.region === region);
        const enabledCount = regionLocs.filter((l) => l.enabled).length;
        const allEnabled = enabledCount === regionLocs.length;
        const someEnabled = enabledCount > 0 && !allEnabled;

        return (
          <div key={region}>
            <button
              onClick={() => toggleRegion(region)}
              className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2 hover:text-blue-600 transition-colors w-full text-left group"
            >
              <span className="text-base">{REGION_ICONS[region]}</span>
              <span>{REGION_LABELS[region]}</span>
              <span className="text-xs font-normal text-gray-400 ml-auto group-hover:text-blue-500">
                {enabledCount}/{regionLocs.length}
              </span>
              <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                allEnabled ? 'bg-blue-600 border-blue-600' : someEnabled ? 'bg-blue-200 border-blue-400' : 'border-gray-300'
              }`}>
                {allEnabled && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {someEnabled && !allEnabled && <div className="w-1.5 h-1.5 bg-blue-600 rounded-sm" />}
              </div>
            </button>
            <div className="flex flex-wrap gap-2 ml-6">
              {regionLocs.map((loc) => (
                <button
                  key={loc.id}
                  onClick={() => toggle(loc.id)}
                  className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all ${
                    loc.enabled
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {loc.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
