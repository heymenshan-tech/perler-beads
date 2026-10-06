import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { getColorKeyByHex, ColorSystem } from '../utils/colorSystemUtils';

interface MagnifierToolProps {
  isActive: boolean;
  onToggle: () => void;
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColor: MappedPixel | null;
  selectedColorSystem: ColorSystem;
  onPixelEdit: (row: number, col: number, colorData: { key: string; color: string }) => void;
  cellSize: number;
  selectionArea: SelectionArea | null;
  onClearSelection: () => void;
  isFloatingActive: boolean;
  onActivateFloating: () => void;
  highlightColorKey?: string | null;
}

interface SelectionArea {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

const MagnifierTool: React.FC<MagnifierToolProps> = ({
  isActive,
  onToggle,
  mappedPixelData,
  selectedColor,
  selectedColorSystem,
  onPixelEdit,
  selectionArea,
  onClearSelection,
  isFloatingActive,
  onActivateFloating,
  highlightColorKey
}) => {
  // 초기 위치를 계산하여 화면 중앙에 배치
  const getInitialPosition = () => ({
    x: Math.max(50, (window.innerWidth - 400) / 2),
    y: Math.max(50, (window.innerHeight - 400) / 2)
  });
  
  const [magnifierPosition, setMagnifierPosition] = useState<{ x: number; y: number }>(getInitialPosition);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  
  // 돋보기를 활성화할 때마다 위치 초기화
  useEffect(() => {
    if (isActive) {
      setMagnifierPosition(getInitialPosition());
    }
  }, [isActive]);
  
  const magnifierRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 선택 영역 크기 계산
  const getSelectionDimensions = useCallback(() => {
    if (!selectionArea) return { width: 0, height: 0 };
    return {
      width: Math.abs(selectionArea.endCol - selectionArea.startCol) + 1,
      height: Math.abs(selectionArea.endRow - selectionArea.startRow) + 1
    };
  }, [selectionArea]);

  // 확대 화면 렌더링
  const renderMagnifiedView = useCallback(() => {
    if (!selectionArea || !mappedPixelData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = getSelectionDimensions();
    const magnifiedCellSize = 20; // 확대 후 각 픽셀의 크기
    
    // 캔버스 실제 크기 설정
    canvas.width = width * magnifiedCellSize;
    canvas.height = height * magnifiedCellSize;
    
    // 실제 크기를 유지하고 축소하지 않음
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 확대된 픽셀 렌더링
    const startRow = Math.min(selectionArea.startRow, selectionArea.endRow);
    const endRow = Math.max(selectionArea.startRow, selectionArea.endRow);
    const startCol = Math.min(selectionArea.startCol, selectionArea.endCol);
    const endCol = Math.max(selectionArea.startCol, selectionArea.endCol);

    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if (row >= 0 && row < mappedPixelData.length && col >= 0 && col < mappedPixelData[0].length) {
          const pixel = mappedPixelData[row][col];
          const canvasRow = row - startRow;
          const canvasCol = col - startCol;
          
          // 픽셀 그리기
          ctx.fillStyle = pixel.color;
          ctx.fillRect(
            canvasCol * magnifiedCellSize,
            canvasRow * magnifiedCellSize,
            magnifiedCellSize,
            magnifiedCellSize
          );

          // 강조 색상이 설정되어 있고 현재 픽셀이 대상 색상이 아니면 어두운 오버레이 추가
          if (highlightColorKey && pixel.color.toUpperCase() !== highlightColorKey.toUpperCase()) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; // 60% 투명도의 검은색 오버레이, 미리보기 캔버스와 동일
            ctx.fillRect(
              canvasCol * magnifiedCellSize,
              canvasRow * magnifiedCellSize,
              magnifiedCellSize,
              magnifiedCellSize
            );
          }

          // 그리드 선 그리기
          ctx.strokeStyle = '#e0e0e0';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            canvasCol * magnifiedCellSize,
            canvasRow * magnifiedCellSize,
            magnifiedCellSize,
            magnifiedCellSize
          );
        }
      }
    }
  }, [selectionArea, mappedPixelData, getSelectionDimensions, highlightColorKey]);

  // 확대 화면 클릭 처리
  const handleMagnifiedClick = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selectionArea || !mappedPixelData || !selectedColor || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // 캔버스에서 클릭한 상대 위치 가져오기 (확대/축소 고려)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    const magnifiedCellSize = 20;
    const clickedCol = Math.floor(x / magnifiedCellSize);
    const clickedRow = Math.floor(y / magnifiedCellSize);

    const startRow = Math.min(selectionArea.startRow, selectionArea.endRow);
    const startCol = Math.min(selectionArea.startCol, selectionArea.endCol);
    
    const actualRow = startRow + clickedRow;
    const actualCol = startCol + clickedCol;

    // 클릭 위치가 유효한 범위 내인지 확인
    if (actualRow >= 0 && actualRow < mappedPixelData.length && 
        actualCol >= 0 && actualCol < mappedPixelData[0].length) {
      onPixelEdit(actualRow, actualCol, selectedColor);
    }
  }, [selectionArea, mappedPixelData, selectedColor, onPixelEdit]);

  // 드래그 이동 처리 - 마우스 이벤트
  const handleTitleBarMouseDown = useCallback((event: React.MouseEvent) => {
    // 제목 표시줄 영역을 클릭했고 버튼이 아닌 경우에만 드래그 시작
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return; // 버튼 클릭 시 드래그하지 않음
    }
    
    if (magnifierRef.current) {
      const rect = magnifierRef.current.getBoundingClientRect();
      // 창 왼쪽 위를 기준으로 마우스의 상대 위치 기록
      setDragOffset({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      });
    }
    
    onActivateFloating(); // 돋보기를 활성화하여 최상단에 표시
    setIsDragging(true);
    // 페이지 스크롤 방지
    document.body.style.overflow = 'hidden';
    event.preventDefault();
  }, [onActivateFloating]);

  // 드래그 이동 처리 - 터치 이벤트
  const handleTitleBarTouchStart = useCallback((event: React.TouchEvent) => {
    // 제목 표시줄 영역을 터치했고 버튼이 아닌 경우에만 드래그 시작
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return; // 버튼 터치 시 드래그하지 않음
    }
    
    const touch = event.touches[0];
    if (!touch) return;
    
    if (magnifierRef.current) {
      const rect = magnifierRef.current.getBoundingClientRect();
      // 창 왼쪽 위를 기준으로 터치 위치의 상대 좌표 기록
      setDragOffset({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      });
    }
    
    onActivateFloating(); // 돋보기를 활성화하여 최상단에 표시
    setIsDragging(true);
    // 페이지 스크롤 방지
    document.body.style.overflow = 'hidden';
    event.preventDefault();
  }, [onActivateFloating]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (isDragging) {
      event.preventDefault();
      event.stopPropagation();
      // 경계를 제한하지 않고 창에 대한 마우스의 상대 위치를 유지하여 새 위치 계산
      const newX = event.clientX - dragOffset.x;
      const newY = event.clientY - dragOffset.y;
      setMagnifierPosition({ x: newX, y: newY });
    }
  }, [isDragging, dragOffset]);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (isDragging) {
      event.preventDefault();
      event.stopPropagation();
      const touch = event.touches[0];
      if (!touch) return;
      
      // 경계를 제한하지 않고 창에 대한 터치의 상대 위치를 유지하여 새 위치 계산
      const newX = touch.clientX - dragOffset.x;
      const newY = touch.clientY - dragOffset.y;
      setMagnifierPosition({ x: newX, y: newY });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // 페이지 스크롤 복원
    document.body.style.overflow = '';
  }, []);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    // 페이지 스크롤 복원
    document.body.style.overflow = '';
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
      document.addEventListener('touchend', handleTouchEnd);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
        // 정리 시 페이지 스크롤 복원
        document.body.style.overflow = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove, handleTouchEnd]);

  // 확대 화면 다시 렌더링
  useEffect(() => {
    renderMagnifiedView();
  }, [renderMagnifiedView]);

  if (!isActive) return null;

  return (
    <>
      {/* 선택 영역 안내 */}
      {!selectionArea && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg z-[70]">
          <div className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>도안에서 드래그하여 확대할 영역을 선택하세요</span>
          </div>
        </div>
      )}

      {/* 확대 화면 창 */}
      {selectionArea && (
        <div
          ref={magnifierRef}
          className={`fixed bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 select-none ${
            isFloatingActive ? 'z-[60]' : 'z-[50]'
          }`}
          style={{
            left: magnifierPosition.x,
            top: magnifierPosition.y
          }}
          onClick={onActivateFloating}
        >
          {/* 제목 표시줄 */}
          <div 
            className="flex items-center justify-between p-3 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-t-xl cursor-move"
            onMouseDown={handleTitleBarMouseDown}
            onTouchStart={handleTitleBarTouchStart}
          >
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="text-sm font-medium">돋보기 ({getSelectionDimensions().width}×{getSelectionDimensions().height})</span>
            </div>
            
            <div className="flex items-center gap-2">
              {/* 영역 다시 선택 버튼 */}
              <button
                onClick={onClearSelection}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="영역 다시 선택"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              
              {/* 닫기 버튼 */}
              <button
                onClick={onToggle}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="돋보기 닫기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* 확대 화면 내용 */}
          <div className="p-3">
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-auto max-h-96">
              <canvas
                ref={canvasRef}
                onClick={handleMagnifiedClick}
                className="cursor-crosshair block"
              />
            </div>
            
            {/* 현재 선택한 색상 정보 */}
            {selectedColor && (
              <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
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
      )}
    </>
  );
};

export default MagnifierTool;
