'use client';

import { useState } from 'react';
import { CVProfile } from '@/types';
import { SAMPLE_CV } from '@/lib/constants';

interface ProfileSetupProps {
  profile: CVProfile | null;
  onSave: (profile: CVProfile) => void;
  onClose: () => void;
}

export default function ProfileSetup({ profile, onSave, onClose }: ProfileSetupProps) {
  const [text, setText] = useState(profile?.rawText || '');
  const [charCount, setCharCount] = useState(profile?.rawText?.length || 0);

  const handleChange = (val: string) => {
    setText(val);
    setCharCount(val.length);
  };

  const handleLoadSample = () => {
    handleChange(SAMPLE_CV);
  };

  const handleSave = () => {
    if (!text.trim()) return;
    onSave({ rawText: text.trim() });
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (ev) => handleChange(ev.target?.result as string || '');
      reader.readAsText(file);
    } else {
      alert('Please upload a .txt file. For PDF/DOCX, copy and paste the text below.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Your CV / Profile</h2>
            <p className="text-sm text-gray-500 mt-0.5">Claude AI uses this to score job matches</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Tips */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
            <p className="text-sm text-blue-800 font-semibold mb-1">Tips for best results:</p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Include your skills, experience, and education</li>
              <li>More detail = more accurate matching</li>
              <li>Copy from your CV / LinkedIn / resume</li>
              <li>Stored locally in your browser only</li>
            </ul>
          </div>

          {/* Upload or Sample */}
          <div className="flex items-center gap-3 mb-4">
            <label className="flex items-center gap-2 cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Upload .txt CV
              <input type="file" accept=".txt" className="hidden" onChange={handleFileUpload} />
            </label>
            <button
              onClick={handleLoadSample}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
            >
              Load sample profile
            </button>
          </div>

          {/* Text area */}
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="Paste your CV text here...

Include:
- Your name and contact details
- Professional summary
- Key skills and technologies
- Work experience (with descriptions)
- Education and certifications"
              className="w-full h-72 p-4 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none leading-relaxed font-mono"
            />
            <div className="absolute bottom-3 right-3 text-xs text-gray-400">
              {charCount.toLocaleString()} chars
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium text-sm transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Save Profile
          </button>
        </div>
      </div>
    </div>
  );
}
