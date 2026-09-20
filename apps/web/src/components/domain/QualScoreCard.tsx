import React from 'react';
import { LeadQualification } from '@/types/domain';

interface QualScoreCardProps {
  qualification: LeadQualification;
}

export function QualScoreCard({ qualification }: QualScoreCardProps) {
  const scorePercent = (qualification.score / qualification.maxScore) * 100;

  const getScoreColor = (percent: number) => {
    if (percent >= 80) return 'text-green-600';
    if (percent >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm text-center">
      <div className="text-xs uppercase font-bold text-gray-500 mb-2">Prospect Score</div>
      <div className={`text-5xl font-black ${getScoreColor(scorePercent)} mb-2`}>
        {Math.round(scorePercent)}%
      </div>
      <div className="text-sm text-gray-600 font-medium">{qualification.label}</div>
    </div>
  );
}
