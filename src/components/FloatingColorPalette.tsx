'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { TRANSPARENT_KEY } from '../utils/pixelEditingUtils';
import { ColorReplaceState } from '../hooks/useManualEditingState';
import { ColorSystem, getColorKeyByHex } from '../utils/colorSystemUtils';

interface FloatingColorPaletteProps {
  colors: { key: string; color: string }[];
  selectedColor: MappedPixel | null;
  onColorSelect: (colorData: { key: string; color: string; isExternal?: boolean }) => void;
  selectedColorSystem: ColorSystem;
  isEraseMode: boolean;
  onEraseToggle: () => void;
  fullPaletteColors: { key: string; color: string }[];
  showFullPalette: boolean;
  onToggleFullPalette: () => void;
  colorReplaceState: ColorReplaceState;
  onColorReplaceToggle: () => void;
  onColorReplace: (sourceColor: { key: string; color: string }, targetColor: { key: string; color: string }) => void;
  onHighlightColor: (colorHex: string) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isActive: boolean;
  onActivate: () => void;
  canUndo: boolean;
  onUndo: () => void;
}

const FloatingColorPalette: React.FC<FloatingColorPaletteProps> = ({
  colors,
  selectedColor,
  onColorSelect,
  selectedColorSystem,
  isEraseMode,
  onEraseToggle,
  fullPaletteColors,
  showFullPalette,
  onToggleFullPalette,
  colorReplaceState,
  onColorReplaceToggle,
  onColorReplace,
  onHighlightColor,
  isOpen,
  onToggleOpen,
  isActive,
  onActivate,
  canUndo,
  onUndo
}) => {
  // 초기 위치를 계산하여 왼쪽 가장자리가 화면 안에 있도록 설정
  // 작은 화면에서는 오른쪽 가장자리가 화면 밖으로 나갈 수 있음
  const getInitialPosition = () => ({
    x: Math.max(0, Math.min(20, window.innerWidth - 280)), // 왼쪽 가장자리가 최소 0이 되도록 설정
    y: Math.max(0, Math.min(100, window.innerHeight - 400)) // 위쪽 가장자리가 최소 0이 되도록 설정
  });
  
  const [position, setPosition] = useState({ x: 20, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const paletteRef = useRef<HTMLDivElement>(null);

  // 드래그 시작 처리
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!paletteRef.current) return;
    
    onActivate(); // 팔레트를 활성화하여 최상단에 표시
    const rect = paletteRef.current.getBoundingClientRect();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    e.preventDefault();
  }, [onActivate]);

  // 터치 시작 처리
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!paletteRef.current) return;
    
    onActivate(); // 팔레트를 활성화하여 최상단에 표시
    const rect = paletteRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    setIsDragging(true);
    setDragOffset({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    });
    e.preventDefault();
  }, [onActivate]);

  // 이동 처리
  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (!isDragging) return;

      // 경계 제한을 제거하여 원하는 위치로 자유롭게 이동 가능
      const newX = clientX - dragOffset.x;
      const newY = clientY - dragOffset.y;

      setPosition({ x: newX, y: newY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
      // 페이지 스크롤 복원
      document.body.style.overflow = '';
    };

    if (isDragging) {
      // 페이지 스크롤 방지
      document.body.style.overflow = 'hidden';
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleEnd);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleEnd);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleEnd);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleEnd);
        // 정리 시 스크롤 복원
        document.body.style.overflow = '';
      };
    }
  }, [isDragging, dragOffset]);

  // 창 크기 변경 시 경계 조정을 제거하여 팔레트가 어느 위치에든 유지되도록 함

  // 팔레트를 열 때마다 화면 안쪽으로 위치 초기화
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      setPosition(getInitialPosition());
    }
  }, [isOpen]);

  // 색상 클릭 처리
  const handleColorClick = (colorData: { key: string; color: string }) => {
    if (colorReplaceState.isActive && colorReplaceState.step === 'select-target' && colorReplaceState.sourceColor) {
      // 색상 교체 실행
      onColorReplace(colorReplaceState.sourceColor, colorData);
    } else {
      // 색상 강조 표시
      onHighlightColor(colorData.color);
      // 색상 선택
      onColorSelect(colorData);
    }
  };

  const displayColors = showFullPalette ? fullPaletteColors : colors;

  // 팔레트가 닫혀 있으면 렌더링하지 않음
  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={paletteRef}
      className={`fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 select-none ${
        isActive ? 'z-[60]' : 'z-[50]'
      }`}
      style={{
        left: position.x,
        top: position.y,
        width: '280px',
        maxHeight: '400px'
      }}
      onClick={onActivate}
    >
      {/* 제목 표시줄 및 제어 버튼 */}
      <div
        className="flex items-center justify-between p-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-t-xl cursor-move"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-medium">팔레트</span>
        </div>
        
        <div className="flex items-center gap-1">
          {/* 닫기 버튼 */}
          <button
            onClick={onToggleOpen}
            className="p-1 hover:bg-white/20 rounded transition-colors"
            title="팔레트 닫기"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4"
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* 내용 영역 */}
      <div className="p-3 max-h-80 overflow-y-auto">
          {/* 모드 상태 표시 */}
          {colorReplaceState.isActive && (
            <div className="mb-3 p-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg text-xs">
              <div className="flex items-center gap-1 text-orange-700 dark:text-orange-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                <span>
                  {colorReplaceState.step === 'select-source' ? '도안에서 교체할 색상을 선택하세요' : '교체할 새 색상을 선택하세요'}
                </span>
              </div>
            </div>
          )}

          {/* 도구 버튼 */}
          <div className="flex gap-2 mb-3">
            {/* 실행 취소 버튼 */}
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-2 rounded-lg border transition-all duration-200 flex items-center justify-center text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="이전 작업 실행 취소"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
              </svg>
            </button>

            {/* 지우개 버튼 */}
            <button
              onClick={() => handleColorClick({ key: TRANSPARENT_KEY, color: '#FFFFFF' })}
              className={`flex-1 p-2 rounded-lg border transition-all duration-200 flex items-center justify-center gap-1 text-xs ${
                selectedColor?.key === TRANSPARENT_KEY
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-red-50 dark:hover:bg-red-900/20'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              지우개
            </button>

            {/* 영역 지우기 버튼 */}
            <button
              onClick={onEraseToggle}
              className={`flex-1 p-2 rounded-lg border transition-all duration-200 flex items-center justify-center gap-1 text-xs ${
                isEraseMode
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-orange-50 dark:hover:bg-orange-900/20'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              영역 지우기
            </button>

            {/* 색상 일괄 교체 버튼 */}
            <button
              onClick={onColorReplaceToggle}
              className={`flex-1 p-2 rounded-lg border transition-all duration-200 flex items-center justify-center gap-1 text-xs ${
                colorReplaceState.isActive
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/20'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              일괄 교체
            </button>
          </div>

          {/* 팔레트 전환 */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={onToggleFullPalette}
              className="w-full text-xs py-2 px-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              {showFullPalette ? `현재 팔레트 (${colors.length})` : `전체 팔레트 (${fullPaletteColors.length})`}
            </button>
          </div>

          {/* 색상 그리드 */}
          <div className="grid grid-cols-6 gap-1.5">
            {displayColors.map((colorData) => {
              const isSelected = selectedColor?.key === colorData.key && selectedColor?.color === colorData.color;
              const displayKey = getColorKeyByHex(colorData.color, selectedColorSystem);
              
              return (
                <button
                  key={`${colorData.key}-${colorData.color}`}
                  onClick={() => handleColorClick(colorData)}
                  className={`group relative aspect-square rounded-lg border-2 transition-all duration-200 hover:scale-110 ${
                    isSelected
                      ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800 scale-110'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: colorData.color }}
                  title={`${displayKey} (${colorData.color})`}
                >
                  {/* 선택 표시 */}
                  {isSelected && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full shadow-lg"></div>
                    </div>
                  )}
                  
                  {/* 마우스를 올리면 색상 코드 표시 */}
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 dark:bg-gray-700 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    {displayKey}
                  </div>
                </button>
              );
            })}
          </div>

          {/* 현재 선택한 색상 정보 */}
          {selectedColor && selectedColor.key !== TRANSPARENT_KEY && (
            <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-2 text-xs">
                <div
                  className="w-4 h-4 rounded border border-gray-300 dark:border-gray-500"
                  style={{ backgroundColor: selectedColor.color }}
                ></div>
                <span className="text-gray-700 dark:text-gray-300">
                  현재: {getColorKeyByHex(selectedColor.color, selectedColorSystem)}
                </span>
              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default FloatingColorPalette;
