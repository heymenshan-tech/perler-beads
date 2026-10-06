'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MappedPixel } from '../../utils/pixelation';
import { 
  getAllConnectedRegions, 
  isRegionCompleted, 
  getRegionCenter, 
  sortRegionsByDistance, 
  sortRegionsBySize,
  getConnectedRegion
} from '../../utils/floodFillUtils';
import FocusCanvas from '../../components/FocusCanvas';
import ColorStatusBar from '../../components/ColorStatusBar';
import ProgressBar from '../../components/ProgressBar';
import ToolBar from '../../components/ToolBar';
import ColorPanel from '../../components/ColorPanel';
import SettingsPanel from '../../components/SettingsPanel';
import CelebrationAnimation from '../../components/CelebrationAnimation';
import CompletionCard from '../../components/CompletionCard';
import { getColorKeyByHex, ColorSystem } from '../../utils/colorSystemUtils';

interface FocusModeState {
  // 현재 상태
  currentColor: string;
  selectedCell: { row: number; col: number } | null;
  
  // 캔버스 상태
  canvasScale: number;
  canvasOffset: { x: number; y: number };
  
  // 진행 상태
  completedCells: Set<string>;
  colorProgress: Record<string, { completed: number; total: number }>;
  
  // 안내 상태 - 영역 추천 방식으로 변경
  recommendedRegion: { row: number; col: number }[] | null;
  recommendedCell: { row: number; col: number } | null; // 위치 표시용으로 유지
  guidanceMode: 'nearest' | 'largest' | 'edge-first';
  
  // UI 상태
  showColorPanel: boolean;
  showSettingsPanel: boolean;
  isPaused: boolean;
  
  // 타이머 상태
  startTime: number; // 시작 타임스탬프
  totalElapsedTime: number; // 총 소요 시간(초)
  lastResumeTime: number; // 마지막으로 재개한 타임스탬프
  
  // 표시 설정
  gridSectionInterval: number; // 그리드 구역 간격
  showSectionLines: boolean; // 구분선 표시 여부
  sectionLineColor: string; // 구분선 색상
  enableCelebration: boolean; // 축하 애니메이션 활성화 여부
  showCelebration: boolean; // 축하 애니메이션 표시 여부
  showCompletionCard: boolean; // 완성 카드 표시 여부
}

export default function FocusMode() {
  // localStorage 또는 URL 매개변수에서 픽셀 데이터 가져오기
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);

  // 집중 모드 상태
  const [focusState, setFocusState] = useState<FocusModeState>({
    currentColor: '',
    selectedCell: null,
    canvasScale: 1,
    canvasOffset: { x: 0, y: 0 },
    completedCells: new Set<string>(),
    colorProgress: {},
    recommendedRegion: null,
    recommendedCell: null,
    guidanceMode: 'nearest',
    showColorPanel: false,
    showSettingsPanel: false,
    isPaused: false,
    startTime: Date.now(),
    totalElapsedTime: 0,
    lastResumeTime: Date.now(),
    gridSectionInterval: 10,
    showSectionLines: true,
    sectionLineColor: '#007acc',
    enableCelebration: true,
    showCelebration: false,
    showCompletionCard: false
  });

  // 사용 가능한 색상 목록
  const [availableColors, setAvailableColors] = useState<Array<{
    color: string;
    name: string;
    total: number;
    completed: number;
  }>>([]);

  // 타이머 관리
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (!focusState.isPaused) {
      interval = setInterval(() => {
        setFocusState(prev => {
          const now = Date.now();
          const elapsed = Math.floor((now - prev.lastResumeTime) / 1000);
          return {
            ...prev,
            totalElapsedTime: prev.totalElapsedTime + elapsed,
            lastResumeTime: now
          };
        });
      }, 1000); // 1초마다 업데이트
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [focusState.isPaused]);

  // localStorage에서 데이터 불러오기
  useEffect(() => {
    const savedPixelData = localStorage.getItem('focusMode_pixelData');
    const savedGridDimensions = localStorage.getItem('focusMode_gridDimensions');
    const savedColorCounts = localStorage.getItem('focusMode_colorCounts');
    const savedColorSystem = localStorage.getItem('focusMode_selectedColorSystem');

    if (savedPixelData && savedGridDimensions && savedColorCounts) {
      try {
        const pixelData = JSON.parse(savedPixelData);
        const dimensions = JSON.parse(savedGridDimensions);
        const colorCounts = JSON.parse(savedColorCounts);

        setMappedPixelData(pixelData);
        setGridDimensions(dimensions);
        
        // 색상 코드 시스템 설정 - 사용하지 않는 상태 제거됨

        // 색상 진행 상황 계산
        const colors = Object.entries(colorCounts).map(([, colorData]) => {
          const data = colorData as { color: string; count: number };
          // HEX 값을 통해 해당 색상 코드 시스템의 색상 코드 가져오기
          const displayKey = getColorKeyByHex(data.color, savedColorSystem as ColorSystem || 'MARD');
          return {
            color: data.color,
            name: displayKey, // 색상 코드 시스템의 색상 코드를 이름으로 사용
            total: data.count,
            completed: 0
          };
        });
        setAvailableColors(colors);

        // 초기 현재 색상 설정
        if (colors.length > 0) {
          setFocusState(prev => ({
            ...prev,
            currentColor: colors[0].color,
            colorProgress: colors.reduce((acc, color) => ({
              ...acc,
              [color.color]: { completed: 0, total: color.total }
            }), {})
          }));
        }
      } catch (error) {
        console.error('Failed to load focus mode data:', error);
        // 메인 페이지로 이동
        window.location.href = '/';
      }
    } else {
      // 데이터가 없으면 메인 페이지로 이동
      window.location.href = '/';
    }
  }, []);

  // 다음 추천 영역 계산
  const calculateRecommendedRegion = useCallback(() => {
    if (!mappedPixelData || !focusState.currentColor) return { region: null, cell: null };

    // 현재 색상의 모든 연결 영역 가져오기
    const allRegions = getAllConnectedRegions(mappedPixelData, focusState.currentColor);
    
    // 완료되지 않은 영역만 필터링
    const incompleteRegions = allRegions.filter(region => 
      !isRegionCompleted(region, focusState.completedCells)
    );

    if (incompleteRegions.length === 0) {
      return { region: null, cell: null };
    }

    let selectedRegion: { row: number; col: number }[];

    // 안내 모드에 따라 추천 영역 선택
    switch (focusState.guidanceMode) {
      case 'nearest':
        // 가장 가까운 영역 찾기(마지막으로 완료한 칸 또는 중심점 기준)
        const referencePoint = focusState.selectedCell ?? { 
          row: Math.floor(mappedPixelData.length / 2), 
          col: Math.floor(mappedPixelData[0].length / 2) 
        };
        
        const sortedByDistance = sortRegionsByDistance(incompleteRegions, referencePoint);
        selectedRegion = sortedByDistance[0];
        break;

      case 'largest':
        // 가장 큰 연결 영역 찾기
        const sortedBySize = sortRegionsBySize(incompleteRegions);
        selectedRegion = sortedBySize[0];
        break;

      case 'edge-first':
        // 가장자리 칸이 포함된 영역을 우선 선택
        const M = mappedPixelData.length;
        const N = mappedPixelData[0].length;
        const edgeRegions = incompleteRegions.filter(region => 
          region.some(cell => 
            cell.row === 0 || cell.row === M - 1 ||
            cell.col === 0 || cell.col === N - 1
          )
        );
        
        if (edgeRegions.length > 0) {
          selectedRegion = edgeRegions[0];
        } else {
          selectedRegion = incompleteRegions[0];
        }
        break;

      default:
        selectedRegion = incompleteRegions[0];
    }

    // 추천 표시 위치로 사용할 영역의 중심 계산
    const centerCell = getRegionCenter(selectedRegion);
    
    return { 
      region: selectedRegion, 
      cell: centerCell 
    };
  }, [mappedPixelData, focusState.currentColor, focusState.completedCells, focusState.selectedCell, focusState.guidanceMode]);

  // 추천 영역 업데이트
  useEffect(() => {
    const { region, cell } = calculateRecommendedRegion();
    setFocusState(prev => ({ 
      ...prev, 
      recommendedRegion: region,
      recommendedCell: cell 
    }));
  }, [calculateRecommendedRegion]);

  // 칸 클릭 처리 - 영역 플러드 필 방식으로 표시
  const handleCellClick = useCallback((row: number, col: number) => {
    if (!mappedPixelData) return;

    const cellColor = mappedPixelData[row][col].color;

    // 클릭한 칸이 현재 색상이면 연결된 전체 영역을 표시
    if (cellColor === focusState.currentColor) {
      // 클릭한 위치의 연결 영역 가져오기
      const region = getConnectedRegion(mappedPixelData, row, col, focusState.currentColor);
      
      if (region.length === 0) return;

      const newCompletedCells = new Set(focusState.completedCells);
      
      // 영역이 이미 완료되었는지 확인
      const isCurrentlyCompleted = isRegionCompleted(region, focusState.completedCells);
      
      if (isCurrentlyCompleted) {
        // 영역이 이미 완료된 경우 전체 영역의 완료 상태 해제
        region.forEach(({ row: r, col: c }) => {
          newCompletedCells.delete(`${r},${c}`);
        });
      } else {
        // 영역이 완료되지 않은 경우 전체 영역을 완료 상태로 표시
        region.forEach(({ row: r, col: c }) => {
          newCompletedCells.add(`${r},${c}`);
        });
      }

      // 진행 상황 업데이트
      const newColorProgress = { ...focusState.colorProgress };
      let colorJustCompleted = false;
      
      if (newColorProgress[focusState.currentColor]) {
        const oldCompleted = newColorProgress[focusState.currentColor].completed;
        const newCompleted = Array.from(newCompletedCells)
          .filter(key => {
            const [r, c] = key.split(',').map(Number);
            return mappedPixelData[r]?.[c]?.color === focusState.currentColor;
          }).length;
        
        newColorProgress[focusState.currentColor].completed = newCompleted;
        
        // 해당 색상이 방금 완성되었는지 확인
        const total = newColorProgress[focusState.currentColor].total;
        if (oldCompleted < total && newCompleted === total && focusState.enableCelebration) {
          colorJustCompleted = true;
        }
      }

      // 모든 색상이 완료되었는지 확인(방금 완료된 현재 색상 포함)
      const allColorsCompleted = Object.values(newColorProgress).every(
        progress => progress.completed >= progress.total
      );

      setFocusState(prev => {
        const now = Date.now();
        let newState = {
          ...prev,
          completedCells: newCompletedCells,
          selectedCell: { row, col },
          colorProgress: newColorProgress,
          showCelebration: colorJustCompleted
        };

        // 모든 색상이 완료되면 타이머 정지
        if (allColorsCompleted && !prev.isPaused) {
          const elapsed = Math.floor((now - prev.lastResumeTime) / 1000);
          newState = {
            ...newState,
            isPaused: true,
            totalElapsedTime: prev.totalElapsedTime + elapsed
          };
        }

        return newState;
      });

      // 사용 가능한 색상의 완료 개수 업데이트
      setAvailableColors(prev => prev.map(color => {
        if (color.color === focusState.currentColor) {
          return {
            ...color,
            completed: newColorProgress[focusState.currentColor]?.completed || 0
          };
        }
        return color;
      }));
    }
  }, [mappedPixelData, focusState.currentColor, focusState.completedCells, focusState.colorProgress, focusState.enableCelebration]);

  // 색상 전환 처리
  const handleColorChange = useCallback((color: string) => {
    setFocusState(prev => ({ ...prev, currentColor: color, showColorPanel: false }));
  }, []);

  // 추천 위치로 이동
  const handleLocateRecommended = useCallback(() => {
    if (!focusState.recommendedCell || !gridDimensions) return;
    
    const { row, col } = focusState.recommendedCell;
    
    // 칸 크기 계산(FocusCanvas의 계산 방식과 동일)
    const cellSize = Math.max(15, Math.min(40, 300 / Math.max(gridDimensions.N, gridDimensions.M)));
    
    // 대상 칸의 캔버스 중심 위치 계산(픽셀 좌표)
    const targetX = (col + 0.5) * cellSize;
    const targetY = (row + 0.5) * cellSize;
    
    // 캔버스 전체 크기 계산
    const canvasWidth = gridDimensions.N * cellSize;
    const canvasHeight = gridDimensions.M * cellSize;
    
    // 간단한 위치 이동 로직:
    // 1. 대상 위치를 캔버스 중앙으로 이동
    // 2. 확대/축소 영향을 고려
    
    // 캔버스 중심 위치
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;
    
    // 대상 위치에서 캔버스 중심까지의 오프셋 계산
    const offsetX = canvasCenterX - targetX;
    const offsetY = canvasCenterY - targetY;
    
    // 상태 업데이트
    setFocusState(prev => ({
      ...prev,
      canvasOffset: { x: offsetX, y: offsetY }
    }));
  }, [focusState.recommendedCell, gridDimensions]);

  // 시간 표시 형식 지정
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }, []);

  // 일시정지/계속 처리
  const handlePauseToggle = useCallback(() => {
    setFocusState(prev => {
      const now = Date.now();
      if (prev.isPaused) {
        // 일시정지에서 재개: 재개 시간 다시 설정
        return {
          ...prev,
          isPaused: false,
          lastResumeTime: now
        };
      } else {
        // 일시정지: 현재 시간 구간을 총 소요 시간에 추가
        const elapsed = Math.floor((now - prev.lastResumeTime) / 1000);
        return {
          ...prev,
          isPaused: true,
          totalElapsedTime: prev.totalElapsedTime + elapsed
        };
      }
    });
  }, []);

  // 축하 애니메이션 완료 처리
  const handleCelebrationComplete = useCallback(() => {
    setFocusState(prev => ({ ...prev, showCelebration: false }));
    
    // 모든 색상이 완료되었는지 확인
    const allCompleted = availableColors.every(color => color.completed >= color.total);
    
    if (allCompleted) {
      // 모든 색상이 완료되었으면 완성 카드 표시
      setFocusState(prev => ({ ...prev, showCompletionCard: true }));
    } else {
      // 다음 미완성 색상 찾기
      const currentIndex = availableColors.findIndex(color => color.color === focusState.currentColor);
      if (currentIndex !== -1) {
        // 현재 색상의 다음 색상부터 미완성 색상 찾기
        for (let i = 1; i < availableColors.length; i++) {
          const nextIndex = (currentIndex + i) % availableColors.length;
          const nextColor = availableColors[nextIndex];
          
          // 미완성 색상을 찾으면 해당 색상으로 전환
          if (nextColor.completed < nextColor.total) {
            setFocusState(prev => ({ ...prev, currentColor: nextColor.color }));
            break;
          }
        }
      }
    }
  }, [availableColors, focusState.currentColor]);

  // 완성 카드 닫기 처리
  const handleCompletionCardClose = useCallback(() => {
    setFocusState(prev => ({ ...prev, showCompletionCard: false }));
  }, []);

  if (!mappedPixelData || !gridDimensions) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">불러오는 중...</p>
        </div>
      </div>
    );
  }

  const currentColorInfo = availableColors.find(c => c.color === focusState.currentColor);
  const progressPercentage = currentColorInfo ? 
    Math.round((currentColorInfo.completed / currentColorInfo.total) * 100) : 0;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 상단 내비게이션 바 */}
      <header className="h-15 bg-white shadow-sm border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <button 
          onClick={() => window.history.back()}
          className="flex items-center text-gray-600 hover:text-gray-800"
        >
          <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>
        <h1 className="text-lg font-medium text-gray-800">집중 펄러비즈 (AlphaTest)</h1>
        <button 
          onClick={() => setFocusState(prev => ({ ...prev, showSettingsPanel: true }))}
          className="text-gray-600 hover:text-gray-800"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* 현재 색상 상태 표시줄 */}
      <ColorStatusBar 
        currentColor={focusState.currentColor}
        colorInfo={currentColorInfo}
        progressPercentage={progressPercentage}
      />

      {/* 메인 캔버스 영역 */}
      <div className="flex-1 relative overflow-hidden">
        <FocusCanvas
          mappedPixelData={mappedPixelData}
          gridDimensions={gridDimensions}
          currentColor={focusState.currentColor}
          completedCells={focusState.completedCells}
          recommendedCell={focusState.recommendedCell}
          recommendedRegion={focusState.recommendedRegion}
          canvasScale={focusState.canvasScale}
          canvasOffset={focusState.canvasOffset}
          gridSectionInterval={focusState.gridSectionInterval}
          showSectionLines={focusState.showSectionLines}
          sectionLineColor={focusState.sectionLineColor}
          onCellClick={handleCellClick}
          onScaleChange={(scale: number) => setFocusState(prev => ({ ...prev, canvasScale: scale }))}
          onOffsetChange={(offset: { x: number; y: number }) => setFocusState(prev => ({ ...prev, canvasOffset: offset }))}
        />
      </div>

      {/* 빠른 진행률 표시줄 */}
      <ProgressBar 
        progressPercentage={progressPercentage}
        recommendedCell={focusState.recommendedCell}
        colorInfo={currentColorInfo}
      />

      {/* 하단 도구 모음 */}
      <ToolBar 
        onColorSelect={() => setFocusState(prev => ({ ...prev, showColorPanel: true }))}
        onLocate={handleLocateRecommended}
        onPause={handlePauseToggle}
        isPaused={focusState.isPaused}
        elapsedTime={formatTime(focusState.totalElapsedTime)}
      />

      {/* 색상 선택 패널 */}
      {focusState.showColorPanel && (
        <ColorPanel
          colors={availableColors}
          currentColor={focusState.currentColor}
          onColorSelect={handleColorChange}
          onClose={() => setFocusState(prev => ({ ...prev, showColorPanel: false }))}
        />
      )}

      {/* 설정 패널 */}
      {focusState.showSettingsPanel && (
        <SettingsPanel
          guidanceMode={focusState.guidanceMode}
          onGuidanceModeChange={(mode: 'nearest' | 'largest' | 'edge-first') => setFocusState(prev => ({ ...prev, guidanceMode: mode }))}
          gridSectionInterval={focusState.gridSectionInterval}
          onGridSectionIntervalChange={(interval: number) => setFocusState(prev => ({ ...prev, gridSectionInterval: interval }))}
          showSectionLines={focusState.showSectionLines}
          onShowSectionLinesChange={(show: boolean) => setFocusState(prev => ({ ...prev, showSectionLines: show }))}
          sectionLineColor={focusState.sectionLineColor}
          onSectionLineColorChange={(color: string) => setFocusState(prev => ({ ...prev, sectionLineColor: color }))}
          enableCelebration={focusState.enableCelebration}
          onEnableCelebrationChange={(enable: boolean) => setFocusState(prev => ({ ...prev, enableCelebration: enable }))}
          onClose={() => setFocusState(prev => ({ ...prev, showSettingsPanel: false }))}
        />
      )}

      {/* 축하 애니메이션 */}
      <CelebrationAnimation
        isVisible={focusState.showCelebration}
        onComplete={handleCelebrationComplete}
      />

      {/* 완성 카드 */}
      <CompletionCard
        isVisible={focusState.showCompletionCard}
        mappedPixelData={mappedPixelData}
        gridDimensions={gridDimensions}
        totalElapsedTime={focusState.totalElapsedTime}
        onClose={handleCompletionCardClose}
      />
    </div>
  );
}
