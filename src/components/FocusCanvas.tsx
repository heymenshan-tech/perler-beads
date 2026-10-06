import React, { useRef, useEffect, useCallback, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';

interface FocusCanvasProps {
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  currentColor: string;
  completedCells: Set<string>;
  recommendedCell: { row: number; col: number } | null;
  recommendedRegion: { row: number; col: number }[] | null;
  canvasScale: number;
  canvasOffset: { x: number; y: number };
  gridSectionInterval: number;
  showSectionLines: boolean;
  sectionLineColor: string;
  onCellClick: (row: number, col: number) => void;
  onScaleChange: (scale: number) => void;
  onOffsetChange: (offset: { x: number; y: number }) => void;
}

const FocusCanvas: React.FC<FocusCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  currentColor,
  completedCells,
  recommendedCell,
  recommendedRegion,
  canvasScale,
  canvasOffset,
  gridSectionInterval,
  showSectionLines,
  sectionLineColor,
  onCellClick,
  onScaleChange,
  onOffsetChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);

  // 칸 크기 계산
  const cellSize = Math.max(15, Math.min(40, 300 / Math.max(gridDimensions.N, gridDimensions.M)));

  // 캔버스 렌더링
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mappedPixelData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 캔버스 크기 설정
    const canvasWidth = gridDimensions.N * cellSize;
    const canvasHeight = gridDimensions.M * cellSize;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 각 칸 렌더링
    for (let row = 0; row < gridDimensions.M; row++) {
      for (let col = 0; col < gridDimensions.N; col++) {
        const pixel = mappedPixelData[row][col];
        const x = col * cellSize;
        const y = row * cellSize;
        const cellKey = `${row},${col}`;

        // 칸 색상 결정
        let fillColor = pixel.color;

        // 현재 색상이 아니면 회색조로 표시
        if (pixel.color !== currentColor) {
          // 회색조로 변환
          const hex = pixel.color.replace('#', '');
          const r = parseInt(hex.substr(0, 2), 16);
          const g = parseInt(hex.substr(2, 2), 16);
          const b = parseInt(hex.substr(4, 2), 16);
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          fillColor = `rgb(${gray}, ${gray}, ${gray})`;
        }

        // 칸 배경 그리기
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, cellSize, cellSize);

        // 완료된 칸이면서 현재 색상인 경우 체크 표시 추가
        if (completedCells.has(cellKey) && pixel.color === currentColor) {
          ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
          ctx.fillRect(x, y, cellSize, cellSize);
          
          // 체크 아이콘 그리기
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + cellSize * 0.2, y + cellSize * 0.5);
          ctx.lineTo(x + cellSize * 0.4, y + cellSize * 0.7);
          ctx.lineTo(x + cellSize * 0.8, y + cellSize * 0.3);
          ctx.stroke();
        }

        // 추천 영역에 포함된 경우 강조 테두리 추가
        const isInRecommendedRegion = recommendedRegion?.some(cell => 
          cell.row === row && cell.col === col
        );
        if (isInRecommendedRegion) {
          ctx.strokeStyle = '#ff4444';
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          ctx.setLineDash([]);
        }
        
        // 추천 영역의 중심점인 경우 특별 표시 추가
        if (recommendedCell && recommendedCell.row === row && recommendedCell.col === col && isInRecommendedRegion) {
          // 중심점 표시 그리기
          ctx.fillStyle = '#ff4444';
          ctx.beginPath();
          ctx.arc(x + cellSize / 2, y + cellSize / 2, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // 모든 칸을 그린 후 구역 구분선 그리기
    if (showSectionLines) {
      ctx.strokeStyle = sectionLineColor;
      ctx.lineWidth = 2;
      
      // 세로 구역 구분선 그리기
      for (let col = gridSectionInterval; col < gridDimensions.N; col += gridSectionInterval) {
        const x = col * cellSize;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }
      
      // 가로 구역 구분선 그리기
      for (let row = gridSectionInterval; row < gridDimensions.M; row += gridSectionInterval) {
        const y = row * cellSize;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
    }
  }, [mappedPixelData, gridDimensions, cellSize, currentColor, completedCells, recommendedCell, recommendedRegion, gridSectionInterval, showSectionLines, sectionLineColor]);

  // 터치/마우스 이벤트 처리
  const getEventPosition = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in event) {
      if (event.touches.length === 0) return null;
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: (clientX - rect.left) / canvasScale,
      y: (clientY - rect.top) / canvasScale
    };
  }, [canvasScale]);

  const getGridPosition = useCallback((x: number, y: number) => {
    const col = Math.floor(x / cellSize);
    const row = Math.floor(y / cellSize);
    
    if (row >= 0 && row < gridDimensions.M && col >= 0 && col < gridDimensions.N) {
      return { row, col };
    }
    return null;
  }, [cellSize, gridDimensions]);

  // 두 손가락 사이의 거리 계산
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 클릭 처리
  const handleClick = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    
    const pos = getEventPosition(event);
    if (!pos) return;

    const gridPos = getGridPosition(pos.x, pos.y);
    if (gridPos) {
      onCellClick(gridPos.row, gridPos.col);
    }
  }, [onCellClick, getEventPosition, getGridPosition]);

  // 확대/축소 처리
  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(3, canvasScale * delta));
    onScaleChange(newScale);
  }, [canvasScale, onScaleChange]);

  // 두 손가락 확대/축소 처리 (터치)
  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 1) {
      // 한 손가락 드래그 시작
      setIsDragging(true);
      setLastPanPoint({
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      });
      setLastPinchDistance(null);
    } else if (event.touches.length === 2) {
      // 두 손가락 확대/축소 시작
      event.preventDefault();
      setIsDragging(false);
      setLastPanPoint(null);
      setLastPinchDistance(getTouchDistance(event.touches));
    }
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    
    if (event.touches.length === 1 && isDragging && lastPanPoint) {
      // 한 손가락 드래그
      const deltaX = event.touches[0].clientX - lastPanPoint.x;
      const deltaY = event.touches[0].clientY - lastPanPoint.y;
      
      onOffsetChange({
        x: canvasOffset.x + deltaX,
        y: canvasOffset.y + deltaY
      });
      
      setLastPanPoint({
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      });
    } else if (event.touches.length === 2 && lastPinchDistance !== null) {
      // 두 손가락 확대/축소 처리
      const currentDistance = getTouchDistance(event.touches);
      const scaleRatio = currentDistance / lastPinchDistance;
      
      // 확대/축소 범위를 제한하고 적용
      const newScale = Math.max(0.3, Math.min(3, canvasScale * scaleRatio));
      onScaleChange(newScale);
      
      // 거리 기록 업데이트
      setLastPinchDistance(currentDistance);
    }
  }, [isDragging, lastPanPoint, canvasOffset, onOffsetChange, lastPinchDistance, canvasScale, onScaleChange]);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 0) {
      setIsDragging(false);
      setLastPanPoint(null);
      setLastPinchDistance(null);
      
      // 이동이 거의 없으면 클릭으로 처리
      if (!isDragging) {
        handleClick(event);
      }
    } else if (event.touches.length === 1) {
      // 두 손가락 확대/축소에서 한 손가락 드래그로 전환
      setLastPinchDistance(null);
      setIsDragging(true);
      setLastPanPoint({
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      });
    }
  }, [isDragging, handleClick]);

  // 마우스 드래그 처리
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    setIsDragging(true);
    setLastPanPoint({
      x: event.clientX,
      y: event.clientY
    });
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (isDragging && lastPanPoint) {
      const deltaX = event.clientX - lastPanPoint.x;
      const deltaY = event.clientY - lastPanPoint.y;
      
      onOffsetChange({
        x: canvasOffset.x + deltaX,
        y: canvasOffset.y + deltaY
      });
      
      setLastPanPoint({
        x: event.clientX,
        y: event.clientY
      });
    }
  }, [isDragging, lastPanPoint, canvasOffset, onOffsetChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setLastPanPoint(null);
  }, []);

  // 캔버스 렌더링
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden bg-gray-100"
      style={{ touchAction: 'none' }}
    >
      <div
        style={{
          transform: `scale(${canvasScale}) translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
          transformOrigin: 'center center'
        }}
      >
        <canvas
          ref={canvasRef}
          className="cursor-crosshair border border-gray-300"
          onClick={handleClick}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
};

export default FocusCanvas;
