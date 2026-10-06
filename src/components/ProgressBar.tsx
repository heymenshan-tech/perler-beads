import React from 'react';

interface ProgressBarProps {
  progressPercentage: number;
  recommendedCell?: { row: number; col: number } | null;
  colorInfo?: {
    color: string;
    name: string;
    total: number;
    completed: number;
  };
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progressPercentage,
  recommendedCell
}) => {
  // 진행률을 나타내는 7개의 원형 표시 생성
  const progressDots = Array.from({ length: 7 }, (_, index) => {
    const threshold = (index + 1) * (100 / 7);
    const isFilled = progressPercentage >= threshold;
    
    return (
      <div
        key={index}
        className={`w-3 h-3 rounded-full ${
          isFilled ? 'bg-blue-500' : 'bg-gray-300'
        }`}
      />
    );
  });

  return (
    <div className="h-10 bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-2">
        {progressDots}
        <span className="ml-2 text-sm font-medium text-gray-700">
          {progressPercentage}%
        </span>
      </div>
      
      <div className="text-xs text-gray-500">
        {recommendedCell ? (
          <span>다음 칸 → {recommendedCell.row + 1},{recommendedCell.col + 1}</span>
        ) : (
          <span>현재 색상 완성</span>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
