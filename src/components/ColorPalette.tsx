'use client';

import React from 'react';
import { getDisplayColorKey, ColorSystem } from '../utils/colorSystemUtils';

// 팔레트에서 사용하는 색상 데이터 구조 정의
interface ColorData {
  key: string;
  color: string;
  isExternal?: boolean; // 투명/지우개 기능을 지원하기 위한 isExternal 속성 추가
}

// 추가: 색상 교체 관련 인터페이스
interface ColorReplaceState {
  isActive: boolean;
  step: 'select-source' | 'select-target'; // 교체 단계: 원본 색상 선택 | 대상 색상 선택
  sourceColor?: ColorData; // 교체할 색상
}

interface ColorPaletteProps {
  colors: ColorData[];
  selectedColor: ColorData | null;
  onColorSelect: (colorData: ColorData) => void;
  transparentKey?: string; // 투명/지우개를 식별하기 위한 선택적 매개변수
  selectedColorSystem?: ColorSystem; // 색상 코드 시스템 매개변수
  // 추가: 원클릭 지우기 관련 props
  isEraseMode?: boolean;
  onEraseToggle?: () => void;
  // 추가: 강조 표시 관련 props
  onHighlightColor?: (colorHex: string) => void; // 특정 색상 강조 표시
  // 추가: 전체 팔레트 관련 props
  fullPaletteColors?: ColorData[]; // 사용자 지정 팔레트의 모든 색상
  showFullPalette?: boolean; // 전체 팔레트 표시 여부
  onToggleFullPalette?: () => void; // 전체 팔레트 표시 전환
  // 추가: 색상 교체 관련 props
  colorReplaceState?: ColorReplaceState; // 색상 교체 상태
  onColorReplaceToggle?: () => void; // 색상 교체 모드 전환
  onColorReplace?: (sourceColor: ColorData, targetColor: ColorData) => void; // 색상 교체 실행
}

const ColorPalette: React.FC<ColorPaletteProps> = ({ 
  colors, 
  selectedColor, 
  onColorSelect,
  transparentKey,
  selectedColorSystem,
  isEraseMode,
  onEraseToggle,
  onHighlightColor,
  fullPaletteColors,
  showFullPalette,
  onToggleFullPalette,
  colorReplaceState,
  onColorReplaceToggle,
  onColorReplace
}) => {
  if (!colors || colors.length === 0) {
    // 다크 모드 텍스트 색상 적용
    return <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">현재 도안에 사용할 수 있는 색상이 없습니다.</p>;
  }

  // 표시할 색상 목록 결정
  // 전체 팔레트를 표시할 경우 투명 색상은 전체 팔레트에 포함되지 않으므로 별도로 처리
  const colorsToShow = showFullPalette && fullPaletteColors 
    ? [colors.find(c => transparentKey && c.key === transparentKey), ...fullPaletteColors].filter(Boolean) as ColorData[]
    : colors;

  return (
    // 컨테이너에 다크 모드 스타일 적용
    <div className="bg-white dark:bg-gray-900 rounded border border-blue-200 dark:border-gray-700">
      {/* 팔레트 전환 버튼 영역 */}
      {fullPaletteColors && fullPaletteColors.length > 0 && onToggleFullPalette && (
        <div className="flex justify-center p-2 border-b border-blue-100 dark:border-gray-700">
          <button
            onClick={onToggleFullPalette}
            className={`px-3 py-1.5 text-xs rounded-md transition-all duration-200 flex items-center gap-1.5 ${
              showFullPalette
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-600'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {showFullPalette ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                도안에 사용된 색상만 표시
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
                </svg>
                전체 팔레트 펼치기 ({fullPaletteColors.length}색)
              </>
            )}
          </button>
        </div>
      )}
      
      {/* 색상 교체 상태 안내 */}
      {colorReplaceState?.isActive && (
        <div className="p-3 border-b border-purple-100 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span className="text-sm font-medium text-purple-700 dark:text-purple-300">색상 교체 모드</span>
            </div>
            
            {colorReplaceState.step === 'select-source' ? (
              <div className="text-xs text-purple-600 dark:text-purple-400">
                <p className="mb-1">1/2단계: 도안에서 교체할 색상을 클릭하세요</p>
                <p className="text-gray-500 dark:text-gray-400">선택하면 해당 색상의 모든 위치가 강조 표시됩니다</p>
              </div>
            ) : (
              <div className="text-xs text-purple-600 dark:text-purple-400">
                <p className="mb-1">2/2단계: 아래 팔레트에서 교체할 색상을 선택하세요</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-gray-500 dark:text-gray-400">교체할 색상:</span>
                  <div className="flex items-center gap-1">
                    <span
                      className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500"
                      style={{ backgroundColor: colorReplaceState.sourceColor?.color }}
                    ></span>
                    <span className="font-mono text-xs">
                      {selectedColorSystem ? getDisplayColorKey(colorReplaceState.sourceColor?.color || '', selectedColorSystem) : colorReplaceState.sourceColor?.key}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 원클릭 지우기 상태 안내 */}
      {isEraseMode && (
        <div className="p-3 border-b border-orange-100 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span className="text-sm font-medium text-orange-700 dark:text-orange-300">배경 지우기 모드</span>
            </div>
            
            <div className="text-xs text-orange-600 dark:text-orange-400">
              <p className="mb-1">도안에서 원하는 색상을 클릭하면 연결된 색상 영역 전체가 삭제됩니다</p>
              <p className="text-gray-500 dark:text-gray-400">플러드 필 알고리즘을 사용하여 연결된 동일 색상 영역을 한 번에 지웁니다</p>
            </div>
          </div>
        </div>
      )}
      
      {/* 지우개 선택 상태 안내 */}
      {selectedColor?.key === transparentKey && !isEraseMode && !colorReplaceState?.isActive && (
        <div className="p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">지우개 모드</span>
            </div>
            
            <div className="text-xs text-gray-600 dark:text-gray-400">
              <p className="mb-1">도안에서 원하는 위치를 클릭하여 한 칸씩 지웁니다</p>
              <p className="text-gray-500 dark:text-gray-400">필요 없는 색상을 한 칸씩 삭제하며 다른 칸에는 영향을 주지 않습니다</p>
            </div>
          </div>
        </div>
      )}
      
      {/* 색상 버튼 영역 */}
      <div className="flex flex-wrap justify-center gap-2 p-2">
        {/* 원클릭 지우기 버튼 */}
        {onEraseToggle && (
          <button
            onClick={onEraseToggle}
            className={`w-12 h-12 rounded border-2 flex-shrink-0 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 dark:focus:ring-blue-500 flex items-center justify-center ${
              isEraseMode
                ? 'border-red-500 bg-red-100 dark:bg-red-900 ring-2 ring-offset-1 ring-red-400 dark:ring-red-500 scale-110 shadow-md'
                : 'border-orange-300 dark:border-orange-600 bg-orange-100 dark:bg-orange-800 hover:border-orange-500 dark:hover:border-orange-400'
            }`}
            title={isEraseMode ? '원클릭 지우기 모드 종료' : '원클릭 지우기 (연결된 동일 색상 영역 삭제)'}
            aria-label={isEraseMode ? '원클릭 지우기 모드 종료' : '원클릭 지우기 모드 시작'}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-5 w-5 ${isEraseMode ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        
        {/* 색상 교체 버튼 */}
        {onColorReplaceToggle && (
          <button
            onClick={onColorReplaceToggle}
            className={`w-12 h-12 rounded border-2 flex-shrink-0 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 dark:focus:ring-blue-500 flex items-center justify-center ${
              colorReplaceState?.isActive
                ? 'border-purple-500 bg-purple-100 dark:bg-purple-900 ring-2 ring-offset-1 ring-purple-400 dark:ring-purple-500 scale-110 shadow-md'
                : 'border-purple-300 dark:border-purple-600 bg-purple-100 dark:bg-purple-800 hover:border-purple-500 dark:hover:border-purple-400'
            }`}
            title={colorReplaceState?.isActive ? '색상 교체 모드 종료' : '색상 교체 (도안의 A 색상을 모두 B 색상으로 교체)'}
            aria-label={colorReplaceState?.isActive ? '색상 교체 모드 종료' : '색상 교체 모드 시작'}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className={`h-5 w-5 ${colorReplaceState?.isActive ? 'text-purple-600 dark:text-purple-400' : 'text-purple-600 dark:text-purple-400'}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor" 
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
          </button>
        )}
        
        {colorsToShow.map((colorData) => {
        // 현재 색상이 투명/지우개인지 확인
        const isTransparent = transparentKey && colorData.key === transparentKey;
        const isSelected = selectedColor?.key === colorData.key;
        
        // 표시할 색상 코드 가져오기
        const displayColorKey = isTransparent 
          ? '' 
          : (selectedColorSystem ? getDisplayColorKey(colorData.color, selectedColorSystem) : colorData.key);
        
        // 텍스트 표시에 사용할 대비 색상 가져오기
        const getContrastColor = (hex: string): string => {
          const rgb = {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
          };
          // 밝기 계산
          const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
          return luma > 0.5 ? '#000000' : '#FFFFFF';
        };
        
        return (
          <button
            key={colorData.key}
              onClick={() => {
                // 색상 교체 모드에서의 특수 처리
                if (colorReplaceState?.isActive && colorReplaceState.step === 'select-target' && !isTransparent && onColorReplace && colorReplaceState.sourceColor) {
                  // 2단계: 대상 색상을 선택하고 교체 실행
                  onColorReplace(colorReplaceState.sourceColor, colorData);
                  return;
                }
                
                // 일반 색상 선택 로직
                onColorSelect(colorData);
                
                // 투명 색상이 아니고 강조 표시 콜백이 있으면 강조 효과 실행
                if (!isTransparent && onHighlightColor) {
                  onHighlightColor(colorData.color);
                }
              }}
            className={`relative w-12 h-12 rounded border-2 flex-shrink-0 transition-transform transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 dark:focus:ring-blue-500 flex items-center justify-center ${ 
              isSelected
                // 선택 상태에 다크 모드 스타일 적용
                ? 'border-black dark:border-gray-100 ring-2 ring-offset-1 ring-blue-400 dark:ring-blue-500 scale-110 shadow-md'
                // 기본/호버 상태에 다크 모드 스타일 적용
                : 'border-gray-300 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-400'
            } ${isTransparent ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
            style={isTransparent ? {} : { backgroundColor: colorData.color }}
            title={isTransparent 
              ? '지우개 선택 (칸 지우기)' 
                : `${displayColorKey} 선택 (${colorData.color})`}
              aria-label={isTransparent ? '지우개 선택' : `색상 ${displayColorKey} 선택`}
          >
            {/* 투명/지우개 버튼이면 X 아이콘 표시 */}
            {isTransparent ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              // 색상 코드 텍스트 표시
              <span 
                className="text-xs font-bold font-mono leading-none text-center px-1"
                style={{ 
                  color: getContrastColor(colorData.color),
                  textShadow: '0 0 2px rgba(0,0,0,0.5)',
                  wordBreak: 'break-all',
                  lineHeight: '1.1'
                }}
              >
                {displayColorKey}
              </span>
            )}
          </button>
        );
      })}
      </div>
    </div>
  );
};

export default ColorPalette;
