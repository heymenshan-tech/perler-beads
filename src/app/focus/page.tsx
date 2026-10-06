'use client';

import React, { useState, useRef, ChangeEvent, DragEvent, useEffect, useMemo, useCallback } from 'react';
import Script from 'next/script';
import InstallPWA from '../components/InstallPWA';

// 픽셀화 도구 및 타입 가져오기
import {
  PixelationMode,
  calculatePixelGrid,
  RgbColor,
  PaletteColor,
  MappedPixel,
  hexToRgb,
  colorDistance,
  findClosestPaletteColor
} from '../utils/pixelation';

// 새로운 타입 및 컴포넌트 가져오기
import { GridDownloadOptions } from '../types/downloadTypes';
import DownloadSettingsModal, { gridLineColorOptions } from '../components/DownloadSettingsModal';
import { downloadImage, importCsvData } from '../utils/imageDownloader';

import { 
  colorSystemOptions, 
  convertPaletteToColorSystem, 
  getColorKeyByHex,
  getMardToHexMapping,
  sortColorsByHue,
  ColorSystem 
} from '../utils/colorSystemUtils';

// 사용자 정의 애니메이션 스타일 추가
const floatAnimation = `
  @keyframes float {
    0% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
    100% { transform: translateY(0px); }
  }
  .animate-float {
    animation: float 3s ease-in-out infinite;
  }
`;

// Helper function for sorting color keys - utils에서 내보내지 않으므로 기존 구현 유지
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // 먼저 접두사 순으로 정렬 (A, B, C...)
    }
    return numA - numB; // 그다음 숫자 순으로 정렬 (1, 2, 10...)
  }
  // 표준 패턴과 일치하지 않는 키의 대체 정렬 방식 (예: T1, ZG1)
  return a.localeCompare(b);
}

// --- 사용 가능한 팔레트 키 세트 정의 ---
// colorSystemMapping.json에서 모든 MARD 색상 코드 가져오기
const mardToHexMapping = getMardToHexMapping();

// 전체 팔레트 데이터를 한 번만 사전 처리 - beadPaletteData 대신 colorSystemMapping 사용
const fullBeadPalette: PaletteColor[] = Object.entries(mardToHexMapping)
  .map(([mardKey, hex]) => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      console.warn(`Invalid hex code "${hex}" for MARD key "${mardKey}". Skipping.`);
      return null;
    }
    // 새로운 구조 설계에 맞게 hex 값을 key로 사용
    return { key: hex, hex, rgb };
  })
  .filter((color): color is PaletteColor => color !== null);

// ++ 배경색 키 정의 추가 ++

// 1. 새 컴포넌트 가져오기
import PixelatedPreviewCanvas from '../components/PixelatedPreviewCanvas';
import GridTooltip from '../components/GridTooltip';
import CustomPaletteEditor from '../components/CustomPaletteEditor';
import FloatingColorPalette from '../components/FloatingColorPalette';
import FloatingToolbar from '../components/FloatingToolbar';
import MagnifierTool from '../components/MagnifierTool';
import MagnifierSelectionOverlay from '../components/MagnifierSelectionOverlay';
import { loadPaletteSelections, savePaletteSelections, presetToSelections, PaletteSelections } from '../utils/localStorageUtils';
import { TRANSPARENT_KEY, transparentColorData } from '../utils/pixelEditingUtils';

// 1. 새로운 DonationModal 컴포넌트 가져오기
import DonationModal from '../components/DonationModal';
import FocusModePreDownloadModal from '../components/FocusModePreDownloadModal';

export default function Home() {
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<number>(50);
  const [granularityInput, setGranularityInput] = useState<string>("50");
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(30);
  const [similarityThresholdInput, setSimilarityThresholdInput] = useState<string>("30");

  // 픽셀화 모드 상태 추가
  const [pixelationMode, setPixelationMode] = useState<PixelationMode>(PixelationMode.Dominant); // 기본값은 카툰 모드
  
  // 추가: 색상 코드 시스템 선택 상태
  const [selectedColorSystem, setSelectedColorSystem] = useState<ColorSystem>('MARD');
  
  const [activeBeadPalette, setActiveBeadPalette] = useState<PaletteColor[]>(() => {
      return fullBeadPalette; // 기본적으로 모든 색상 사용
  });

  // 상태 변수: 제외된 색상 저장 (hex 값)
  const [excludedColorKeys, setExcludedColorKeys] = useState<Set<string>>(new Set());
  const [showExcludedColors, setShowExcludedColors] = useState<boolean>(false);

  // 초기 그리드 색상(hex 값)을 기록하여 제외 기능 표시에 사용
  const [initialGridColorKeys, setInitialGridColorKeys] = useState<Set<string>>(new Set());
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [colorCounts, setColorCounts] = useState<{ [key: string]: { count: number; color: string } } | null>(null);
  const [totalBeadCount, setTotalBeadCount] = useState<number>(0);
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, key: string, color: string } | null>(null);
  const [remapTrigger, setRemapTrigger] = useState<number>(0);
  const [isManualColoringMode, setIsManualColoringMode] = useState<boolean>(false);
  const [selectedColor, setSelectedColor] = useState<MappedPixel | null>(null);

  // 추가: 원클릭 지우기 모드 상태
  const [isEraseMode, setIsEraseMode] = useState<boolean>(false);

  // 추가 상태 변수: 후원 팝업 제어
  const [isDonationModalOpen, setIsDonationModalOpen] = useState<boolean>(false);
  const [customPaletteSelections, setCustomPaletteSelections] = useState<PaletteSelections>({});
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState<boolean>(false);
  const [isCustomPalette, setIsCustomPalette] = useState<boolean>(false);
  
  // ++ 추가: 다운로드 설정 관련 상태 ++
  const [isDownloadSettingsOpen, setIsDownloadSettingsOpen] = useState<boolean>(false);
  const [downloadOptions, setDownloadOptions] = useState<GridDownloadOptions>({
    showGrid: true,
    gridInterval: 10,
    showCoordinates: true,
    showCellNumbers: true,
    gridLineColor: gridLineColorOptions[0].value,
    includeStats: true, // 기본적으로 통계 정보 포함
    exportCsv: false // 기본적으로 CSV 내보내기 사용 안 함
  });

  // 추가: 강조 표시 관련 상태
  const [highlightColorKey, setHighlightColorKey] = useState<string | null>(null);

  // 추가: 전체 팔레트 전환 상태
  const [showFullPalette, setShowFullPalette] = useState<boolean>(false);
  
  // 추가: 색상 교체 관련 상태
  const [colorReplaceState, setColorReplaceState] = useState<{
    isActive: boolean;
    step: 'select-source' | 'select-target';
    sourceColor?: { key: string; color: string };
  }>({
    isActive: false,
    step: 'select-source'
  });

  // 추가: 컴포넌트 마운트 상태
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // 추가: 플로팅 팔레트 상태
  const [isFloatingPaletteOpen, setIsFloatingPaletteOpen] = useState<boolean>(true);

  // 추가: 돋보기 상태
  const [isMagnifierActive, setIsMagnifierActive] = useState<boolean>(false);
  const [magnifierSelectionArea, setMagnifierSelectionArea] = useState<{
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
  } | null>(null);

  // 추가: 활성 플로팅 도구 레이어 관리
  const [activeFloatingTool, setActiveFloatingTool] = useState<'palette' | 'magnifier' | null>(null);

  // 추가: 집중 핀또우 모드 진입 전 다운로드 알림 팝업
  const [isFocusModePreDownloadModalOpen, setIsFocusModePreDownloadModalOpen] = useState<boolean>(false);

  // 추가: 가로 화면 기기 팝업 상태
  const [showDesktopModal, setShowDesktopModal] = useState<boolean>(false);

  // 추가: 편집 실행 취소 기록 스택 (다단계)
  interface EditSnapshot {
    mappedPixelData: MappedPixel[][];
    colorCounts: { [key: string]: { count: number; color: string } };
    totalBeadCount: number;
  }
  const [editHistory, setEditHistory] = useState<EditSnapshot[]>([]);

  // 추가: 원클릭 배경 제거 실행 취소 스냅샷 (1단계)
  const [bgRemovalSnapshot, setBgRemovalSnapshot] = useState<EditSnapshot | null>(null);

  // 추가: 간단한 알림 메시지
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2000);
  }, []);

  // 돋보기 전환 처리 함수
  const handleToggleMagnifier = () => {
    const newActiveState = !isMagnifierActive;
    setIsMagnifierActive(newActiveState);
    
    // 돋보기를 끄면 선택 영역을 초기화하고 다시 시작
    if (!newActiveState) {
      setMagnifierSelectionArea(null);
    }
  };

  // 도구 활성화 처리 함수
  const handleActivatePalette = () => {
    setActiveFloatingTool('palette');
  };

  const handleActivateMagnifier = () => {
    setActiveFloatingTool('magnifier');
  };

  // --- 실행 취소 기능 ---

  // 편집 스냅샷을 기록 스택에 저장
  const saveEditSnapshot = useCallback(() => {
    if (!mappedPixelData || !colorCounts) return;
    const snapshot: EditSnapshot = {
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: { ...colorCounts },
      totalBeadCount,
    };
    setEditHistory(prev => [...prev.slice(-49), snapshot]);
  }, [mappedPixelData, colorCounts, totalBeadCount]);

  // 편집 모드 다단계 실행 취소
  const handleUndoEdit = useCallback(() => {
    if (editHistory.length === 0) return;
    const snapshot = editHistory[editHistory.length - 1];
    setMappedPixelData(snapshot.mappedPixelData);
    setColorCounts(snapshot.colorCounts);
    setTotalBeadCount(snapshot.totalBeadCount);
    setEditHistory(prev => prev.slice(0, -1));
    showToast('이전 작업을 실행 취소했습니다');
  }, [editHistory, showToast]);

  // 원클릭 배경 제거 1단계 실행 취소
  const handleUndoBgRemoval = useCallback(() => {
    if (!bgRemovalSnapshot) return;
    setMappedPixelData(bgRemovalSnapshot.mappedPixelData);
    setColorCounts(bgRemovalSnapshot.colorCounts);
    setTotalBeadCount(bgRemovalSnapshot.totalBeadCount);
    setBgRemovalSnapshot(null);
    showToast('배경 제거를 실행 취소했습니다');
  }, [bgRemovalSnapshot, showToast]);

  // 편집 기록 초기화 (매개변수 변경, 편집 모드 종료 등의 경우 호출)
  const clearEditHistory = useCallback(() => {
    setEditHistory([]);
  }, []);

  // 돋보기 픽셀 편집 처리 함수
  const handleMagnifierPixelEdit = (row: number, col: number, colorData: { key: string; color: string }) => {
    if (!mappedPixelData) return;

    const oldPixel = mappedPixelData[row][col];
    if (!oldPixel || oldPixel.key === colorData.key) return;

    // 새로운 픽셀 데이터 생성
    const newMappedPixelData = mappedPixelData.map((rowData, r) =>
      rowData.map((pixel, c) => {
        if (r === row && c === col) {
          return {
            key: colorData.key,
            color: colorData.color
          } as MappedPixel;
        }
        return pixel;
      })
    );

    saveEditSnapshot();
    setMappedPixelData(newMappedPixelData);

    // 색상 통계 업데이트
    if (colorCounts) {
      const newColorCounts = { ...colorCounts };

      // 기존 색상의 개수 감소
      if (newColorCounts[oldPixel.key]) {
        newColorCounts[oldPixel.key].count--;
        if (newColorCounts[oldPixel.key].count === 0) {
          delete newColorCounts[oldPixel.key];
        }
      }

      // 새 색상의 개수 증가
      if (newColorCounts[colorData.key]) {
        newColorCounts[colorData.key].count++;
      } else {
        newColorCounts[colorData.key] = {
          count: 1,
          color: colorData.color
        };
      }

      setColorCounts(newColorCounts);

      // 총 개수 업데이트
      const newTotal = Object.values(newColorCounts).reduce((sum, item) => sum + item.count, 0);
      setTotalBeadCount(newTotal);
    }
  };

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelatedCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ++ 추가: 가져오기 파일 입력용 Ref ++
  const importPaletteInputRef = useRef<HTMLInputElement>(null);
  //const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // ++ 툴팁 로직에 필요한 터치 ref 다시 추가 ++
  //const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  //const touchMovedRef = useRef<boolean>(false);

  // ++ main 요소용 ref 추가 ++
  const mainRef = useRef<HTMLElement>(null);

  // --- 파생 상태 ---

  // 선택 및 제외 항목에 따라 활성 팔레트 업데이트
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 선택한 색상 코드 시스템에 따라 팔레트 변환
    const convertedPalette = convertPaletteToColorSystem(newActiveBeadPalette, selectedColorSystem);
    setActiveBeadPalette(convertedPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger, selectedColorSystem]);

  // ++ 추가: 상태가 변경될 때 입력란의 값도 동기화하여 업데이트 ++
  useEffect(() => {
    setGranularityInput(granularity.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
  }, [granularity, similarityThreshold]);

  // ++ 팔레트에 표시하기 위해 현재 그리드의 고유 색상 계산 ++
  const currentGridColors = useMemo(() => {
    if (!mappedPixelData) return [];
    // hex 값을 사용해 중복 제거. 여러 MARD 색상 코드가 동일한 대상 색상 코드 시스템 값에 대응할 때 중복 key가 생성되는 것을 방지
    const uniqueColorsMap = new Map<string, MappedPixel>();
    mappedPixelData.flat().forEach(cell => {
      if (cell && cell.color && !cell.isExternal) {
        const hexKey = cell.color.toUpperCase();
        if (!uniqueColorsMap.has(hexKey)) {
          // 색상 정보를 유지하면서 hex 값을 key로 저장
          uniqueColorsMap.set(hexKey, { key: cell.key, color: cell.color });
        }
      }
    });
    
    // 배열로 변환하고 각 hex 값에 해당하는 색상 코드 시스템 표시값 생성
    const originalColors = Array.from(uniqueColorsMap.values());
    
    const colorData = originalColors.map(color => {
      const displayKey = getColorKeyByHex(color.color.toUpperCase(), selectedColorSystem);
      return {
        key: displayKey,
        color: color.color
      };
    });

    // 색상 코드 순서가 아닌 색상환 순서로 정렬
    return sortColorsByHue(colorData);
  }, [mappedPixelData, selectedColorSystem]);

  // 초기화 시 로컬 저장소에서 사용자 지정 팔레트 선택 불러오기
  useEffect(() => {
    // localStorage에서 불러오기 시도
    const savedSelections = loadPaletteSelections();
    if (savedSelections && Object.keys(savedSelections).length > 0) {
      console.log('localStorage에서 불러온 데이터 키 개수:', Object.keys(savedSelections).length);
      // 불러온 데이터가 모두 유효한 hex 값인지 확인
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const validSelections: PaletteSelections = {};
      let hasValidData = false;
      let validCount = 0;
      let invalidCount = 0;
      
      Object.entries(savedSelections).forEach(([key, value]) => {
        // 엄격한 검증: 키가 유효한 hex 형식이어야 하며 팔레트에도 존재해야 함
        if (/^#[0-9A-F]{6}$/i.test(key) && allHexValues.includes(key.toUpperCase())) {
          validSelections[key.toUpperCase()] = value;
          hasValidData = true;
          validCount++;
        } else {
          invalidCount++;
        }
      });
      
      console.log(`검증 결과: 유효한 키 ${validCount}개, 유효하지 않은 키 ${invalidCount}개`);
      
      if (hasValidData) {
        setCustomPaletteSelections(validSelections);
        setIsCustomPalette(true);
      } else {
        console.log('모든 데이터가 유효하지 않아 localStorage를 비우고 다시 초기화합니다');
        // 로컬 데이터가 유효하지 않으면 localStorage를 비우고 기본적으로 모든 색상 선택
        localStorage.removeItem('customPerlerPaletteSelections');
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const initialSelections = presetToSelections(allHexValues, allHexValues);
        setCustomPaletteSelections(initialSelections);
        setIsCustomPalette(false);
      }
    } else {
      console.log('localStorage 데이터가 없어 기본적으로 모든 색상을 선택합니다');
      // 저장된 선택 항목이 없으면 기본적으로 모든 색상 선택
      const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
      const initialSelections = presetToSelections(allHexValues, allHexValues);
      setCustomPaletteSelections(initialSelections);
      setIsCustomPalette(false);
    }
  }, []); // 컴포넌트를 처음 불러올 때만 실행

  // 사용자 지정 선택 및 제외 목록을 기반으로 activeBeadPalette 업데이트
  useEffect(() => {
    const newActiveBeadPalette = fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      const isSelectedInCustomPalette = customPaletteSelections[normalizedHex];
      // hex 값을 사용하여 제외 여부 확인
      const isNotExcluded = !excludedColorKeys.has(normalizedHex);
      return isSelectedInCustomPalette && isNotExcluded;
    });
    // 색상 코드 시스템 변환을 하지 않고 원래 MARD 색상 코드와 hex 값 유지
    setActiveBeadPalette(newActiveBeadPalette);
  }, [customPaletteSelections, excludedColorKeys, remapTrigger]);

  // --- 이벤트 핸들러 ---

  // 집중 핀또우 모드 관련 처리 함수
  const handleEnterFocusMode = () => {
    setIsFocusModePreDownloadModalOpen(true);
  };

  const handleProceedToFocusMode = () => {
    // 집중 핀또우 모드에서 사용할 수 있도록 데이터를 localStorage에 저장
    localStorage.setItem('focusMode_pixelData', JSON.stringify(mappedPixelData));
    localStorage.setItem('focusMode_gridDimensions', JSON.stringify(gridDimensions));
    localStorage.setItem('focusMode_colorCounts', JSON.stringify(colorCounts));
    localStorage.setItem('focusMode_selectedColorSystem', selectedColorSystem);
    
    // 집중 핀또우 페이지로 이동
    window.location.href = '/focus';
  };

  // 안전하게 파일 입력을 실행하는 함수 추가
  const triggerFileInput = useCallback(() => {
    // 컴포넌트가 마운트되었는지 확인
    if (!isMounted) {
      console.warn("컴포넌트가 아직 완전히 마운트되지 않아 파일 선택을 지연합니다");
      setTimeout(() => triggerFileInput(), 200);
      return;
    }
    
    // ref가 존재하는지 확인
    if (fileInputRef.current) {
      try {
        fileInputRef.current.click();
      } catch (error) {
        console.error("파일 선택 실행 실패:", error);
        // 직접 클릭이 실패하면 지연 후 다시 실행
        setTimeout(() => {
          try {
            fileInputRef.current?.click();
          } catch (retryError) {
            console.error("파일 선택 재시도 실패:", retryError);
          }
        }, 100);
      }
    } else {
      // ref가 존재하지 않으면 지연 후 재시도
      console.warn("파일 입력 참조가 존재하지 않습니다. 100ms 후 다시 시도합니다");
      setTimeout(() => {
        if (fileInputRef.current) {
          try {
            fileInputRef.current.click();
          } catch (error) {
            console.error("지연된 파일 선택 실행 실패:", error);
          }
        }
      }, 100);
    }
  }, [isMounted]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // 파일 형식 지원 여부 확인
      const fileName = file.name.toLowerCase();
      const fileType = file.type.toLowerCase();
      
      // 지원하는 이미지 형식
      const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      // 지원하는 CSV MIME 형식 (브라우저에 따라 서로 다른 MIME 형식을 반환할 수 있음)
      const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

      const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
      const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

      if (isImageFile || isCsvFile) {
        setExcludedColorKeys(new Set()); // ++ 제외 목록 초기화 ++
        processFile(file);
      } else {
        alert(`지원하지 않는 파일 형식: ${file.type || '알 수 없음'}. JPG, PNG, GIF 형식의 이미지 파일 또는 CSV 데이터 파일을 선택해 주세요.\n파일명: ${file.name}`);
        console.warn(`Unsupported file type: ${file.type}, file name: ${file.name}`);
      }
    }
    // 사용자가 동일한 파일을 다시 선택할 수 있도록 파일 입력란의 값 초기화
    if (event.target) {
      event.target.value = '';
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    
    try {
      if (event.dataTransfer.files && event.dataTransfer.files[0]) {
        const file = event.dataTransfer.files[0];
        
        // handleFileChange와 동일한 파일 형식 검사 로직 사용
        const fileName = file.name.toLowerCase();
        const fileType = file.type.toLowerCase();
        
        // 지원하는 이미지 형식
        const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        // 지원하는 CSV MIME 형식 (브라우저에 따라 서로 다른 MIME 형식을 반환할 수 있음)
        const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

        const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
        const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

        if (isImageFile || isCsvFile) {
          setExcludedColorKeys(new Set()); // ++ 제외 목록 초기화 ++
          processFile(file);
        } else {
          alert(`지원하지 않는 파일 형식: ${file.type || '알 수 없음'}. JPG, PNG, GIF 형식의 이미지 파일 또는 CSV 데이터 파일을 드래그하여 놓아 주세요.\n파일명: ${file.name}`);
          console.warn(`Unsupported file type: ${file.type}, file name: ${file.name}`);
        }
      }
    } catch (error) {
      console.error("드래그한 파일을 처리하는 중 오류가 발생했습니다:", error);
      alert("파일을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  // mappedPixelData를 기반으로 합성 originalImageSrc 생성
  const generateSyntheticImageFromPixelData = (pixelData: MappedPixel[][], dimensions: { N: number; M: number }): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('canvas 컨텍스트를 생성할 수 없습니다');
      return '';
    }
    
    // 선명도를 유지하기 위해 각 픽셀을 8x8 픽셀로 표시하도록 캔버스 크기 설정
    const pixelSize = 8;
    canvas.width = dimensions.N * pixelSize;
    canvas.height = dimensions.M * pixelSize;
    
    // 각 픽셀 그리기
    pixelData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell) {
          // 색상을 사용하고 외부 셀은 흰색으로 표시
          const color = cell.isExternal ? '#FFFFFF' : cell.color;
          ctx.fillStyle = color;
          ctx.fillRect(
            colIndex * pixelSize, 
            rowIndex * pixelSize, 
            pixelSize, 
            pixelSize
          );
        }
      });
    });
    
    // dataURL로 변환
    return canvas.toDataURL('image/png');
  };

  const processFile = (file: File) => {
    // 파일 형식 확인
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExtension === 'csv') {
      // CSV 파일 처리
      console.log('CSV 파일을 가져오는 중...');
      importCsvData(file)
        .then(({ mappedPixelData, gridDimensions }) => {
          console.log(`CSV 파일 가져오기 성공: ${gridDimensions.N}x${gridDimensions.M}`);
          
          // 가져온 데이터 설정
          setMappedPixelData(mappedPixelData);
          setGridDimensions(gridDimensions);
          setOriginalImageSrc(null); // CSV 가져오기 시 원본 이미지 없음
          
          // 색상 통계 계산
          const colorCountsMap: { [key: string]: { count: number; color: string } } = {};
          let totalCount = 0;
          
          mappedPixelData.forEach(row => {
            row.forEach(cell => {
              if (cell && !cell.isExternal) {
                const colorKey = cell.color.toUpperCase();
                if (colorCountsMap[colorKey]) {
                  colorCountsMap[colorKey].count++;
                } else {
                  colorCountsMap[colorKey] = {
                    count: 1,
                    color: cell.color
                  };
                }
                totalCount++;
              }
            });
          });
          
          setColorCounts(colorCountsMap);
          setTotalBeadCount(totalCount);
          setInitialGridColorKeys(new Set(Object.keys(colorCountsMap)));
          
          // mappedPixelData를 기반으로 합성된 originalImageSrc 생성
          const syntheticImageSrc = generateSyntheticImageFromPixelData(mappedPixelData, gridDimensions);
          
          setOriginalImageSrc(syntheticImageSrc);
          
          // 상태 초기화
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setIsEraseMode(false);
          
          // 다시 매핑할 때 크기가 변경되지 않도록 그리드 개수를 가져온 크기로 설정
          setGranularity(gridDimensions.N);
          setGranularityInput(gridDimensions.N.toString());
          
          alert(`CSV 파일을 성공적으로 가져왔습니다! 도안 크기: ${gridDimensions.N}x${gridDimensions.M}, 총 ${Object.keys(colorCountsMap).length}가지 색상을 사용합니다.`);
        })
        .catch(error => {
          console.error('CSV 가져오기 실패:', error);
          alert(`CSV 가져오기 실패: ${error.message}`);
        });
    } else {
      // 이미지 파일 처리
      const applyImageSrc = (result: string) => {
        setOriginalImageSrc(result);
        setMappedPixelData(null);
        setGridDimensions(null);
        setColorCounts(null);
        setTotalBeadCount(0);
        setInitialGridColorKeys(new Set()); // ++ 초기 키 초기화 ++
        // ++ 가로축 그리드 개수를 기본값으로 초기화 ++
        const defaultGranularity = 100;
        setGranularity(defaultGranularity);
        setGranularityInput(defaultGranularity.toString());
        setRemapTrigger(prev => prev + 1); // 새 이미지에 대해 전체 재매핑 실행
      };

      const isGif = file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif');

      if (isGif) {
        // GIF는 createImageBitmap을 사용하며, 사양상 첫 프레임(default image)을 반환한 뒤 PNG dataURL로 변환
        createImageBitmap(file)
          .then((bitmap) => {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas 컨텍스트를 생성할 수 없습니다');
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            applyImageSrc(canvas.toDataURL('image/png'));
          })
          .catch((error) => {
            console.error('GIF 처리 실패:', error);
            alert('GIF 파일을 읽을 수 없습니다.');
            setInitialGridColorKeys(new Set());
          });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          applyImageSrc(e.target?.result as string);
        };
        reader.onerror = () => {
          console.error("파일 읽기 실패");
          alert("파일을 읽을 수 없습니다.");
          setInitialGridColorKeys(new Set()); // ++ 초기 키 초기화 ++
        };
        reader.readAsDataURL(file);
      }
      // ++ 새 파일을 처리할 때 수동 색칠 모드 초기화 ++
      setIsManualColoringMode(false);
      setSelectedColor(null);
      setIsEraseMode(false);
    }
  };

  // 원클릭 지우기 모드 전환 처리
  const handleEraseToggle = () => {
    // 수동 색칠 모드에서만 지우기 기능을 사용할 수 있도록 확인
    if (!isManualColoringMode) {
      return;
    }
    
    // 현재 색상 교체 모드라면 먼저 교체 모드 종료
    if (colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    setIsEraseMode(!isEraseMode);
    // 지우기 모드를 켜는 경우 선택된 색상 해제
    if (!isEraseMode) {
      setSelectedColor(null);
    }
  };

  // ++ 추가: 입력란 변경 처리 함수 ++
  const handleGranularityInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setGranularityInput(event.target.value);
  };

  // ++ 추가: 유사도 입력란 변경 처리 함수 ++
  const handleSimilarityThresholdInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSimilarityThresholdInput(event.target.value);
  };

  // ++ 수정: 확인 버튼 클릭 처리 함수, 두 매개변수를 동시에 처리 ++
  const handleConfirmParameters = () => {
    // 그리드 개수 처리
    const minGranularity = 10;
    const maxGranularity = 300;
    let newGranularity = parseInt(granularityInput, 10);

    if (isNaN(newGranularity) || newGranularity < minGranularity) {
      newGranularity = minGranularity;
    } else if (newGranularity > maxGranularity) {
      newGranularity = maxGranularity;
    }

    // 유사도 임계값 처리
    const minSimilarity = 0;
    const maxSimilarity = 100;
    let newSimilarity = parseInt(similarityThresholdInput, 10);
    
    if (isNaN(newSimilarity) || newSimilarity < minSimilarity) {
      newSimilarity = minSimilarity;
    } else if (newSimilarity > maxSimilarity) {
      newSimilarity = maxSimilarity;
    }

    // 값이 변경되었는지 확인
    const granularityChanged = newGranularity !== granularity;
    const similarityChanged = newSimilarity !== similarityThreshold;
    
    if (granularityChanged) {
      console.log(`Confirming new granularity: ${newGranularity}`);
      setGranularity(newGranularity);
    }
    
    if (similarityChanged) {
      console.log(`Confirming new similarity threshold: ${newSimilarity}`);
      setSimilarityThreshold(newSimilarity);
    }
    
    // 값이 변경된 경우에만 재매핑 실행
    if (granularityChanged || similarityChanged) {
      setRemapTrigger(prev => prev + 1);
      // 수동 색칠 모드 종료
      setIsManualColoringMode(false);
      setSelectedColor(null);
    }

    // 입력란의 값을 항상 동기화
    setGranularityInput(newGranularity.toString());
    setSimilarityThresholdInput(newSimilarity.toString());
  };

  // 픽셀화 모드 전환 처리 함수 추가
  const handlePixelationModeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const newMode = event.target.value as PixelationMode;
    if (Object.values(PixelationMode).includes(newMode)) {
        setPixelationMode(newMode);
        setRemapTrigger(prev => prev + 1); // 재매핑 실행
        setIsManualColoringMode(false); // 수동 모드 종료
        setSelectedColor(null);
    } else {
        console.warn(`유효하지 않은 픽셀화 모드: ${newMode}`);
    }
  };

  // pixelateImage 함수가 모드 매개변수를 받도록 수정
  const pixelateImage = (imageSrc: string, detailLevel: number, threshold: number, currentPalette: PaletteColor[], mode: PixelationMode) => {
    console.log(`Attempting to pixelate with detail: ${detailLevel}, threshold: ${threshold}, mode: ${mode}`);
    const originalCanvas = originalCanvasRef.current;
    const pixelatedCanvas = pixelatedCanvasRef.current;

    if (!originalCanvas || !pixelatedCanvas) { console.error("Canvas ref(s) not available."); return; }
    const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
    const pixelatedCtx = pixelatedCanvas.getContext('2d');
    if (!originalCtx || !pixelatedCtx) { console.error("Canvas context(s) not found."); return; }
    console.log("Canvas contexts obtained.");

    if (currentPalette.length === 0) {
        console.error("Cannot pixelate: The selected color palette is empty (likely due to exclusions).");
        alert("오류: 현재 사용 가능한 색상 팔레트가 비어 있어(모든 색상이 제외되었을 수 있습니다) 이미지를 처리할 수 없습니다. 일부 색상을 다시 활성화해 주세요.");
        // 이전 결과를 화면에서 지우기
        pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
        setMappedPixelData(null);
        setGridDimensions(null);
        // colorCounts에 마지막으로 유효했던 개수를 유지할지 여부
        // setColorCounts(null); // 팔레트가 비어 있을 때 개수도 초기화할지 결정
        // setTotalBeadCount(0);
        return; // 처리 중단
    }
    const t1FallbackColor = currentPalette.find(p => p.key === 'T1')
                         || currentPalette.find(p => p.hex.toUpperCase() === '#FFFFFF')
                         || currentPalette[0]; // 첫 번째 사용 가능한 색상을 대체 색상으로 사용
    console.log("Using fallback color for empty cells:", t1FallbackColor);

    const img = new window.Image();
    
    img.onerror = (error: Event | string) => {
      console.error("Image loading failed:", error); 
      alert("이미지를 불러올 수 없습니다.");
      setOriginalImageSrc(null); 
      setMappedPixelData(null); 
      setGridDimensions(null); 
      setColorCounts(null); 
      setInitialGridColorKeys(new Set());
    };
    
    img.onload = () => {
      console.log("Image loaded successfully.");
      const aspectRatio = img.height / img.width;
      const N = detailLevel;
      const M = Math.max(1, Math.round(N * aspectRatio));
      if (N <= 0 || M <= 0) { console.error("Invalid grid dimensions:", { N, M }); return; }
      console.log(`Grid size: ${N}x${M}`);

      // 그리드 개수가 100보다 많을 경우 각 칸의 가시성을 유지하기 위해 캔버스 크기를 동적으로 조정
      const baseWidth = 500;
      const minCellSize = 4; // 각 칸의 최소 크기(픽셀)
      const recommendedCellSize = 6; // 권장 칸 크기(픽셀)
      
      let outputWidth = baseWidth;
      
      // 그리드 개수가 100보다 많으면 필요한 캔버스 너비 계산
      if (N > 100) {
        const requiredWidthForMinSize = N * minCellSize;
        const requiredWidthForRecommendedSize = N * recommendedCellSize;
        
        // 권장 크기를 사용하되 화면 너비의 90%를 초과하지 않도록 설정(최대 1200px)
        const maxWidth = Math.min(1200, window.innerWidth * 0.9);
        outputWidth = Math.min(maxWidth, Math.max(baseWidth, requiredWidthForRecommendedSize));
        
        // 최소 요구 크기보다 작지 않도록 보장
        outputWidth = Math.max(outputWidth, requiredWidthForMinSize);
        
        console.log(`Large grid detected (${N} columns). Adjusted canvas width from ${baseWidth} to ${outputWidth}px (cell size: ${Math.round(outputWidth / N)}px)`);
      }
      
      const outputHeight = Math.round(outputWidth * aspectRatio);
      
      // 캔버스 크기 변경을 콘솔에 안내
      if (N > 100) {
        console.log(`💡 그리드 개수가 많아 (${N}x${M}) 선명도를 유지하기 위해 캔버스가 자동으로 확대되었습니다. 가로 스크롤을 사용하여 전체 이미지를 확인할 수 있습니다.`);
      }
      originalCanvas.width = img.width; originalCanvas.height = img.height;
      pixelatedCanvas.width = outputWidth; pixelatedCanvas.height = outputHeight;
      console.log(`Canvas dimensions: Original ${img.width}x${img.height}, Output ${outputWidth}x${outputHeight}`);

      originalCtx.drawImage(img, 0, 0, img.width, img.height);
      console.log("Original image drawn.");

      // 1. calculatePixelGrid를 사용하여 초기 색상 매핑
      console.log("Starting initial color mapping using calculatePixelGrid...");
      const initialMappedData = calculatePixelGrid(
          originalCtx,
          img.width,
          img.height,
          N,
          M,
          currentPalette, 
          mode,
          t1FallbackColor
      );
      console.log(`Initial data mapping complete using mode ${mode}. Starting global color merging...`);

      // --- 새로운 전역 색상 병합 로직 ---
      const keyToRgbMap = new Map<string, RgbColor>();
      const keyToColorDataMap = new Map<string, PaletteColor>();
      currentPalette.forEach(p => {
        keyToRgbMap.set(p.key, p.rgb);
        keyToColorDataMap.set(p.key, p);
      });

      // 2. 초기 색상 개수 집계
      const initialColorCounts: { [key: string]: number } = {};
      initialMappedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
              initialColorCounts[cell.key] = (initialColorCounts[cell.key] || 0) + 1;
          }
      });
      console.log("Initial color counts:", initialColorCounts);

      // 3. 색상 목록을 생성하고 출현 빈도가 높은 순서대로 정렬
      const colorsByFrequency = Object.entries(initialColorCounts)
          .sort((a, b) => b[1] - a[1])  // 빈도 내림차순 정렬
          .map(entry => entry[0]);      // 색상 키만 유지
      
      if (colorsByFrequency.length === 0) {
          console.log("No non-background colors found! Skipping merging.");
      }

      console.log("Colors sorted by frequency:", colorsByFrequency);
      
      // 4. 초기 데이터를 복사하여 병합 준비
      const mergedData: MappedPixel[][] = initialMappedData.map(row => 
          row.map(cell => ({ ...cell, isExternal: cell.isExternal ?? false }))
      );
      
      // 5. 유사 색상 병합 처리
      const similarityThresholdValue = threshold;
      
      // 이미 병합(교체)된 색상 집합
      const replacedColors = new Set<string>();
      
      // 각 색상을 빈도가 높은 순서대로 처리
      for (let i = 0; i < colorsByFrequency.length; i++) {
          const currentKey = colorsByFrequency[i];
          
          // 현재 색상이 이미 더 빈도가 높은 색상으로 병합된 경우 건너뛰기
          if (replacedColors.has(currentKey)) continue;
          
          const currentRgb = keyToRgbMap.get(currentKey);
          if (!currentRgb) {
              console.warn(`RGB not found for key ${currentKey}. Skipping.`);
              continue;
          }
          
          // 남아 있는 저빈도 색상 확인
          for (let j = i + 1; j < colorsByFrequency.length; j++) {
              const lowerFreqKey = colorsByFrequency[j];
              
              // 저빈도 색상이 이미 교체된 경우 건너뛰기
              if (replacedColors.has(lowerFreqKey)) continue;
              
              const lowerFreqRgb = keyToRgbMap.get(lowerFreqKey);
              if (!lowerFreqRgb) {
                  console.warn(`RGB not found for key ${lowerFreqKey}. Skipping.`);
                  continue;
              }
              
              // 색상 거리 계산
              const dist = colorDistance(currentRgb, lowerFreqRgb);
              
              // 거리가 임계값보다 작으면 저빈도 색상을 고빈도 색상으로 교체
              if (dist < similarityThresholdValue) {
                  console.log(`Merging color ${lowerFreqKey} into ${currentKey} (Distance: ${dist.toFixed(2)})`);
                  
                  // 해당 색상을 교체된 것으로 표시
                  replacedColors.add(lowerFreqKey);
                  
                  // 해당 저빈도 색상을 사용하는 모든 셀 교체
                  for (let r = 0; r < M; r++) {
                      for (let c = 0; c < N; c++) {
                          if (mergedData[r][c].key === lowerFreqKey) {
                              const colorData = keyToColorDataMap.get(currentKey);
                              if (colorData) {
                                  mergedData[r][c] = {
                                      key: currentKey,
                                      color: colorData.hex,
                                      isExternal: false
                                  };
                              }
                          }
                      }
                  }
              }
          }
      }
      
      if (replacedColors.size > 0) {
          console.log(`Merged ${replacedColors.size} less frequent similar colors into more frequent ones.`);
      } else {
          console.log("No colors were similar enough to merge.");
      }
      // --- 새로운 전역 색상 병합 로직 종료 ---

      // --- 그리기 및 상태 업데이트 ---
      if (pixelatedCanvasRef.current) {
        setMappedPixelData(mergedData);
        setGridDimensions({ N, M });

        const counts: { [key: string]: { count: number; color: string } } = {};
        let totalCount = 0;
        mergedData.flat().forEach(cell => {
          if (cell && cell.key && !cell.isExternal) {
            // 색상 코드 대신 hex 값을 통계 키로 사용
            const hexKey = cell.color;
            if (!counts[hexKey]) {
              counts[hexKey] = { count: 0, color: cell.color };
            }
            counts[hexKey].count++;
            totalCount++;
          }
        });
        setColorCounts(counts);
        setTotalBeadCount(totalCount);
        setInitialGridColorKeys(new Set(Object.keys(counts)));
        console.log("Color counts updated based on merged data (after merging):", counts);
        console.log("Total bead count (total beads):", totalCount);
        console.log("Stored initial grid color keys:", Object.keys(counts));
      } else {
        console.error("Pixelated canvas ref is null, skipping draw call in pixelateImage.");
      }
    }; // img.onload 함수 올바르게 닫기
    
    console.log("Setting image source...");
    img.src = imageSrc;
    setIsManualColoringMode(false);
    setSelectedColor(null);
  }; // pixelateImage 함수 올바르게 닫기

  // remapTrigger가 변경되면 실행 취소 기록 초기화 (매개변수 조정/색상 제외/새 이미지 업로드 등에서 remap 실행)
  useEffect(() => {
    clearEditHistory();
    setBgRemovalSnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapTrigger]);

  // useEffect의 pixelateImage 호출을 수정하여 모드 매개변수 추가
  useEffect(() => {
    if (originalImageSrc && activeBeadPalette.length > 0) {
       const timeoutId = setTimeout(() => {
         if (originalImageSrc && originalCanvasRef.current && pixelatedCanvasRef.current && activeBeadPalette.length > 0) {
           console.log("useEffect triggered: Processing image due to src, granularity, threshold, palette selection, mode or remap trigger.");
           pixelateImage(originalImageSrc, granularity, similarityThreshold, activeBeadPalette, pixelationMode);
         } else {
            console.warn("useEffect check failed inside timeout: Refs or active palette not ready/empty.");
         }
       }, 50);
       return () => clearTimeout(timeoutId);
    } else if (originalImageSrc && activeBeadPalette.length === 0) {
        console.warn("Image selected, but the active palette is empty after exclusions. Cannot process. Clearing preview.");
        const pixelatedCanvas = pixelatedCanvasRef.current;
        const pixelatedCtx = pixelatedCanvas?.getContext('2d');
        if (pixelatedCtx && pixelatedCanvas) {
            pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
            // 캔버스에 메시지를 표시할까요?
            pixelatedCtx.fillStyle = '#6b7280'; // gray-500
            pixelatedCtx.font = '16px sans-serif';
            pixelatedCtx.textAlign = 'center';
            pixelatedCtx.fillText('사용 가능한 색상이 없습니다. 제외한 색상 중 일부를 복원해 주세요', pixelatedCanvas.width / 2, pixelatedCanvas.height / 2);
        }
        setMappedPixelData(null);
        setGridDimensions(null);
        // 사용자가 제외된 색상을 다시 포함할 수 있도록 colorCounts 유지
        // setColorCounts(null);
        // setTotalBeadCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImageSrc, granularity, similarityThreshold, customPaletteSelections, pixelationMode, remapTrigger]);

  // 컴포넌트가 마운트된 후 파일 입력란 참조가 올바르게 설정되도록 확인
  useEffect(() => {
    // DOM이 완전히 렌더링되도록 지연 실행
    const timer = setTimeout(() => {
      if (!fileInputRef.current) {
        console.warn("컴포넌트가 마운트된 후에도 파일 입력란 참조가 null입니다. 업로드 기능에 문제가 발생할 수 있습니다");
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  // 컴포넌트 마운트 상태 설정
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 전문 작업대 팝업 강제 표시 (페이지에 들어올 때마다 표시하여 새 버전으로 안내)
  useEffect(() => {
    setShowDesktopModal(true);
  }, []);

  // URL 리디렉션 확인 추가
  useEffect(() => {
    // 브라우저 환경인지 확인
    if (typeof window !== 'undefined') {
      const currentUrl = window.location.href;
      const currentHostname = window.location.hostname;
      const targetDomain = 'https://perlerbeadsold.zippland.com/';
      
      // localhost 및 127.0.0.1 등의 로컬 개발 환경 제외
      const isLocalhost = currentHostname === 'localhost' || 
                         currentHostname === '127.0.0.1' || 
                         currentHostname.startsWith('192.168.') ||
                         currentHostname.startsWith('10.') ||
                         currentHostname.endsWith('.local');
      
      // 현재 URL이 대상 도메인이 아니며 로컬 개발 환경도 아닌지 확인
      if (!currentUrl.startsWith(targetDomain) && !isLocalhost) {
        console.log(`현재 URL: ${currentUrl}`);
        console.log(`대상 URL: ${targetDomain}`);
        console.log('공식 도메인으로 리디렉션하는 중...');
        
        // 현재 경로와 쿼리 매개변수 유지
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const currentHash = window.location.hash;
        
        // 전체 대상 URL 구성
        let redirectUrl = targetDomain;
        
        // 루트 경로가 아니면 경로 추가
        if (currentPath && currentPath !== '/') {
          redirectUrl = redirectUrl.replace(/\/$/, '') + currentPath;
        }
        
        // 쿼리 매개변수와 해시 추가
        redirectUrl += currentSearch + currentHash;
        
        // 리디렉션 실행
        window.location.replace(redirectUrl);
      } else if (isLocalhost) {
        console.log(`로컬 개발 환경 감지 (${currentHostname}), 리디렉션을 건너뜁니다`);
      }
    }
  }, []); // 컴포넌트가 처음 마운트될 때만 실행

    // --- 다운로드 함수 (파일명에 팔레트가 포함되도록 보장) ---
    const handleDownloadRequest = (options?: GridDownloadOptions) => {
        // utils/imageDownloader.ts로 이동된 downloadImage 함수 호출
        downloadImage({
          mappedPixelData,
          gridDimensions,
          colorCounts,
          totalBeadCount,
          options: options || downloadOptions,
          activeBeadPalette,
          selectedColorSystem
        });
    };

    // --- 색상 제외 전환 핸들러 ---
    const handleToggleExcludeColor = (hexKey: string) => {
        const currentExcluded = excludedColorKeys;
        const isExcluding = !currentExcluded.has(hexKey);

        if (isExcluding) {
            console.log(`---------\nAttempting to EXCLUDE color: ${hexKey}`);

            // --- 초기 색상 키가 기록되었는지 확인 ---
            if (initialGridColorKeys.size === 0) {
                console.error("Cannot exclude color: Initial grid color keys not yet calculated.");
                alert("색상을 제외할 수 없습니다. 초기 색상 데이터가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.");
                return;
            }
            console.log("Initial Grid Hex Keys:", Array.from(initialGridColorKeys));
            console.log("Currently Excluded Hex Keys (before this op):", Array.from(currentExcluded));

            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.add(hexKey);

            // --- 초기 색상 키를 사용한 재매핑 대상 로직 ---
            // 1. 초기 그리드 색상 집합(hex 값)에서 시작
            const potentialRemapHexKeys = new Set(initialGridColorKeys);
            console.log("Step 1: Potential Hex Keys (from initial):", Array.from(potentialRemapHexKeys));

            // 2. 현재 제외하려는 hex 키 제거
            potentialRemapHexKeys.delete(hexKey);
            console.log(`Step 2: Potential Hex Keys (after removing ${hexKey}):`, Array.from(potentialRemapHexKeys));

            // 3. 현재 제외되어 있는 *다른* 모든 hex 키 제거
            currentExcluded.forEach(excludedHexKey => {
                potentialRemapHexKeys.delete(excludedHexKey);
            });
            console.log("Step 3: Potential Hex Keys (after removing other current exclusions):", Array.from(potentialRemapHexKeys));

            // 4. 남은 hex 값을 기반으로 재매핑 팔레트 생성
            const remapTargetPalette = fullBeadPalette.filter(color => potentialRemapHexKeys.has(color.hex.toUpperCase()));
            const remapTargetHexKeys = remapTargetPalette.map(p => p.hex.toUpperCase());
            console.log("Step 4: Remap Target Palette Hex Keys:", remapTargetHexKeys);

            // 5. *** 핵심 확인 ***: 모든 제외 항목을 고려한 후 매핑할 *초기* 색상이 하나도 남지 않으면 이번 제외를 차단
            if (remapTargetPalette.length === 0) {
                console.warn(`Cannot exclude color '${hexKey}'. No other valid colors from the initial grid remain after considering all current exclusions.`);
                alert(`색상 ${hexKey}을(를) 제외할 수 없습니다. 이미지에 처음 존재했던 다른 사용 가능한 색상도 모두 제외되어 있습니다. 먼저 다른 색상 중 일부를 복원해 주세요.`);
                console.log("---------");
                return; // 제외 과정 중단
            }
            console.log(`Remapping target palette (based on initial grid colors minus all exclusions) contains ${remapTargetPalette.length} colors.`);

            // 재매핑에 사용할 제외 색상의 RGB 값 찾기
            const excludedColorData = fullBeadPalette.find(p => p.hex.toUpperCase() === hexKey);
            // 제외 색상 데이터가 존재하는지 확인
             if (!excludedColorData || !mappedPixelData || !gridDimensions) {
                 console.error("Cannot exclude color: Missing data for remapping.");
                 alert("색상을 제외할 수 없습니다. 필요한 데이터가 없습니다.");
                console.log("---------");
                 return;
             }

            console.log(`Remapping cells currently using excluded color: ${hexKey}`);
            // 재매핑이 필요한 경우에만 깊은 복사본 생성
            const newMappedData = mappedPixelData.map(row => row.map(cell => ({...cell})));
            let remappedCount = 0;
            const { N, M } = gridDimensions;
            let firstReplacementHex: string | null = null;

            for (let j = 0; j < M; j++) {
                for (let i = 0; i < N; i++) {
                const cell = newMappedData[j]?.[i];
                    // 이 조건은 제외할 hex 값을 가진 셀만 정확히 대상으로 지정
                    if (cell && !cell.isExternal && cell.color.toUpperCase() === hexKey) {
                        // *** 파생된 remapTargetPalette를 사용하여 가장 가까운 색상 찾기 ***
                    const replacementColor = findClosestPaletteColor(excludedColorData.rgb, remapTargetPalette);
                        if (!firstReplacementHex) firstReplacementHex = replacementColor.hex;
                        newMappedData[j][i] = { 
                            ...cell, 
                            key: replacementColor.key, 
                            color: replacementColor.hex 
                        };
                    remappedCount++;
                }
                }
            }
            console.log(`Remapped ${remappedCount} cells. First replacement hex found was: ${firstReplacementHex || 'N/A'}`);

            // 상태도 함께 업데이트
            setExcludedColorKeys(nextExcludedKeys); // 이 색상 제외 적용
            setMappedPixelData(newMappedData); // 재매핑된 데이터로 업데이트

            // *새로운* 매핑 데이터를 기반으로 개수를 다시 계산 (hex를 키로 사용)
            const newCounts: { [hexKey: string]: { count: number; color: string } } = {};
            let newTotalCount = 0;
            newMappedData.flat().forEach(cell => {
                if (cell && cell.color && !cell.isExternal) {
                    const cellHex = cell.color.toUpperCase();
                    if (!newCounts[cellHex]) {
                        newCounts[cellHex] = { count: 0, color: cellHex };
                }
                    newCounts[cellHex].count++;
                    newTotalCount++;
                }
            });
            setColorCounts(newCounts);
            setTotalBeadCount(newTotalCount);
            console.log("State updated after exclusion and local remap based on initial grid colors.");
            console.log("---------");

            // ++ 상태 업데이트 후 Canvas 다시 그리기 ++
            if (pixelatedCanvasRef.current && gridDimensions) {
              setMappedPixelData(newMappedData);
              // 색상 제외는 그리드 크기를 변경할 필요가 없으므로 setGridDimensions를 호출하지 않음
            } else {
               console.error("Canvas ref or grid dimensions missing, skipping draw call in handleToggleExcludeColor.");
            }

        } else {
            // --- 다시 포함하기 ---
            console.log(`---------\nAttempting to RE-INCLUDE color: ${hexKey}`);
            console.log(`Re-including color: ${hexKey}. Triggering full remap.`);
            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.delete(hexKey);
            setExcludedColorKeys(nextExcludedKeys);
            // 여기서는 initialGridColorKeys를 초기화할 필요 없음. 전체 재매핑 시 pixelateImage에서 다시 계산함
            setRemapTrigger(prev => prev + 1); // *** 다시 포함할 때 setRemapTrigger 유지 ***
            console.log("---------");
        }
        // ++ 색상을 제외/포함하면 수동 모드 종료 ++
        setIsManualColoringMode(false);
        setSelectedColor(null);
        clearEditHistory();
        setBgRemovalSnapshot(null);
    };

  // 원클릭 배경 제거: 가장자리의 주요 색상을 식별하고 플러드 필로 제거
  const handleAutoRemoveBackground = () => {
    if (!mappedPixelData || !gridDimensions) {
      alert('먼저 도안을 생성한 후 원클릭 배경 제거를 사용해 주세요.');
      return;
    }

    // 1단계 실행 취소를 위한 스냅샷 저장
    setBgRemovalSnapshot({
      mappedPixelData: mappedPixelData.map(row => row.map(cell => ({ ...cell }))),
      colorCounts: colorCounts ? { ...colorCounts } : {},
      totalBeadCount,
    });
    // 배경 제거는 데이터를 크게 변경하므로 편집 실행 취소 기록 초기화
    setEditHistory([]);

    const { N, M } = gridDimensions;
    const borderCounts = new Map<string, number>();

    const countBorderCell = (row: number, col: number) => {
      const cell = mappedPixelData[row]?.[col];
      if (!cell || cell.isExternal || cell.key === TRANSPARENT_KEY) return;
      borderCounts.set(cell.key, (borderCounts.get(cell.key) || 0) + 1);
    };

    for (let col = 0; col < N; col++) {
      countBorderCell(0, col);
      if (M > 1) countBorderCell(M - 1, col);
    }
    for (let row = 1; row < M - 1; row++) {
      countBorderCell(row, 0);
      if (N > 1) countBorderCell(row, N - 1);
    }

    if (borderCounts.size === 0) {
      alert('가장자리에서 식별할 수 있는 배경색이 없습니다.');
      return;
    }

    let targetKey = '';
    let maxCount = -1;
    borderCounts.forEach((count, key) => {
      if (count > maxCount) {
        maxCount = count;
        targetKey = key;
      }
    });

    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    const stack: { row: number; col: number }[] = [];

    const pushIfTarget = (row: number, col: number) => {
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        return;
      }
      const cell = newPixelData[row][col];
      if (!cell || cell.isExternal || cell.key !== targetKey) return;
      visited[row][col] = true;
      stack.push({ row, col });
    };

    for (let col = 0; col < N; col++) {
      pushIfTarget(0, col);
      if (M > 1) pushIfTarget(M - 1, col);
    }
    for (let row = 1; row < M - 1; row++) {
      pushIfTarget(row, 0);
      if (N > 1) pushIfTarget(row, N - 1);
    }

    if (stack.length === 0) {
      alert('제거할 수 있는 배경 영역을 찾지 못했습니다.');
      return;
    }

    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      newPixelData[row][col] = { ...transparentColorData };
      pushIfTarget(row - 1, col);
      pushIfTarget(row + 1, col);
      pushIfTarget(row, col - 1);
      pushIfTarget(row, col + 1);
    }

    setMappedPixelData(newPixelData);

    const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
    let newTotalCount = 0;
    newPixelData.flat().forEach(cell => {
      if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
        const cellHex = cell.color.toUpperCase();
        if (!newColorCounts[cellHex]) {
          newColorCounts[cellHex] = {
            count: 0,
            color: cellHex
          };
        }
        newColorCounts[cellHex].count++;
        newTotalCount++;
      }
    });

    setColorCounts(newColorCounts);
    setTotalBeadCount(newTotalCount);
    setInitialGridColorKeys(new Set(Object.keys(newColorCounts)));
  };

  // --- 툴팁 로직 ---

  // --- 캔버스 상호작용 ---

  // 플러드 필 지우기 함수
  const floodFillErase = (startRow: number, startCol: number, targetKey: string) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    const visited = Array(M).fill(null).map(() => Array(N).fill(false));
    
    // 스택을 사용하여 비재귀 플러드 필 구현
    const stack = [{ row: startRow, col: startCol }];
    
    while (stack.length > 0) {
      const { row, col } = stack.pop()!;
      
      // 경계 확인
      if (row < 0 || row >= M || col < 0 || col >= N || visited[row][col]) {
        continue;
      }
      
      const currentCell = newPixelData[row][col];
      
      // 대상 색상이며 외부 영역이 아닌지 확인
      if (!currentCell || currentCell.isExternal || currentCell.key !== targetKey) {
        continue;
      }
      
      // 방문한 것으로 표시
      visited[row][col] = true;
      
      // 현재 픽셀 지우기 (투명으로 설정)
      newPixelData[row][col] = { ...transparentColorData };
      
      // 인접 픽셀을 스택에 추가
      stack.push(
        { row: row - 1, col }, // 위
        { row: row + 1, col }, // 아래
        { row, col: col - 1 }, // 왼쪽
        { row, col: col + 1 }  // 오른쪽
      );
    }
    
    // 상태 업데이트
    saveEditSnapshot();
    setMappedPixelData(newPixelData);

    // 색상 통계 다시 계산
    if (colorCounts) {
      const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
      let newTotalCount = 0;
      
      newPixelData.flat().forEach(cell => {
        if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
          const cellHex = cell.color.toUpperCase();
          if (!newColorCounts[cellHex]) {
            newColorCounts[cellHex] = {
              count: 0,
              color: cellHex
            };
          }
          newColorCounts[cellHex].count++;
          newTotalCount++;
        }
      });
      
      setColorCounts(newColorCounts);
      setTotalBeadCount(newTotalCount);
    }
  };

  // ++ 통합 상호작용 핸들러 다시 추가 ++
  const handleCanvasInteraction = (
    clientX: number, 
    clientY: number, 
    pageX: number, 
    pageY: number, 
    isClick: boolean = false,
    isTouchEnd: boolean = false
  ) => {
    // 터치 종료 또는 마우스 이탈 이벤트인 경우 툴팁 숨기기
    if (isTouchEnd) {
      setTooltipData(null);
      return;
    }

    const canvas = pixelatedCanvasRef.current;
    if (!canvas || !mappedPixelData || !gridDimensions) {
      setTooltipData(null);
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    const { N, M } = gridDimensions;
    const cellWidthOutput = canvas.width / N;
    const cellHeightOutput = canvas.height / M;

    const i = Math.floor(canvasX / cellWidthOutput);
    const j = Math.floor(canvasY / cellHeightOutput);

    if (i >= 0 && i < N && j >= 0 && j < M) {
      const cellData = mappedPixelData[j][i];

      // 색상 교체 모드 로직 - 원본 색상 선택
      if (isClick && colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 원본 색상 선택 실행
          handleCanvasColorSelect({
            key: cellData.key,
            color: cellData.color
          });
          setTooltipData(null);
        }
        return;
      }

      // 원클릭 지우기 모드 로직
      if (isClick && isEraseMode) {
        if (cellData && !cellData.isExternal && cellData.key && cellData.key !== TRANSPARENT_KEY) {
          // 플러드 필 지우기 실행
          floodFillErase(j, i, cellData.key);
          setIsEraseMode(false); // 지우기 완료 후 지우기 모드 종료
          setTooltipData(null);
        }
        return;
      }

      // Manual Coloring Logic - 기존 색칠 로직 유지
      if (isClick && isManualColoringMode && selectedColor) {
        // 수동 색칠 모드 로직은 그대로 유지
        // ...기존 코드...
        const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
        const currentCell = newPixelData[j]?.[i];

        if (!currentCell) return;

        const previousKey = currentCell.key;
        const wasExternal = currentCell.isExternal;
        
        let newCellData: MappedPixel;
        
        if (selectedColor.key === TRANSPARENT_KEY) {
          newCellData = { ...transparentColorData };
        } else {
          newCellData = { ...selectedColor, isExternal: false };
        }

        // 상태가 변경된 경우에만 업데이트
        if (newCellData.key !== previousKey || newCellData.isExternal !== wasExternal) {
          saveEditSnapshot();
          newPixelData[j][i] = newCellData;
          setMappedPixelData(newPixelData);

          // 색상 개수 업데이트
          if (colorCounts) {
            const newColorCounts = { ...colorCounts };
            let newTotalCount = totalBeadCount;

            // 이전 색상 개수 감소 처리 (hex 값 사용)
            if (!wasExternal && previousKey !== TRANSPARENT_KEY) {
              const previousCell = mappedPixelData[j][i];
              const previousHex = previousCell?.color?.toUpperCase();
              if (previousHex && newColorCounts[previousHex]) {
                newColorCounts[previousHex].count--;
                if (newColorCounts[previousHex].count <= 0) {
                  delete newColorCounts[previousHex];
              }
              newTotalCount--;
              }
            }

            // 새 색상 개수 증가 처리 (hex 값 사용)
            if (!newCellData.isExternal && newCellData.key !== TRANSPARENT_KEY) {
              const newHex = newCellData.color.toUpperCase();
              if (!newColorCounts[newHex]) {
                newColorCounts[newHex] = {
                  count: 0,
                  color: newHex
                };
              }
              newColorCounts[newHex].count++;
              newTotalCount++;
            }

            setColorCounts(newColorCounts);
            setTotalBeadCount(newTotalCount);
          }
        }
        
        // 색칠 작업 후 툴팁 숨기기
        setTooltipData(null);
      }
      // 툴팁 로직 (수동 색칠 모드가 아닐 때 클릭 또는 호버)
      else if (!isManualColoringMode) {
        // 셀에 실제 내용이 있을 때만(배경/외부 영역 제외) 툴팁 표시
        if (cellData && !cellData.isExternal && cellData.key) {
          // 이미 툴팁이 표시되어 있는지, 같은 위치를 클릭했는지 확인
          // 모바일에서는 위치에 약간의 오차가 있을 수 있으므로 정확한 좌표 대신 셀 인덱스를 확인
          if (tooltipData) {
            // 이미 툴팁이 있다면 현재 툴팁이 대응하는 셀의 인덱스 계산
            const tooltipRect = canvas.getBoundingClientRect();
            
            // 툴팁 위치를 canvas 기준 좌표로 복원
            const prevX = tooltipData.x; // 페이지 X 좌표
            const prevY = tooltipData.y; // 페이지 Y 좌표
            
            // canvas 기준 좌표로 변환
            const prevCanvasX = (prevX - tooltipRect.left) * scaleX;
            const prevCanvasY = (prevY - tooltipRect.top) * scaleY;
            
            // 이전 툴팁 위치에 해당하는 그리드 인덱스 계산
            const prevCellI = Math.floor(prevCanvasX / cellWidthOutput);
            const prevCellJ = Math.floor(prevCanvasY / cellHeightOutput);
            
            // 같은 셀을 클릭했다면 툴팁 표시/숨김 전환
            if (i === prevCellI && j === prevCellJ) {
              setTooltipData(null); // 툴팁 숨기기
              return;
            }
          }
          
          // main 요소 기준 위치 계산
          const mainElement = mainRef.current;
          if (mainElement) {
            const mainRect = mainElement.getBoundingClientRect();
            // main 요소 기준 좌표 계산
            const relativeX = pageX - mainRect.left - window.scrollX;
            const relativeY = pageY - mainRect.top - window.scrollY;
            
            // 새로운 유효 셀로 이동/호버했거나 다른 셀을 클릭했다면 툴팁 표시
            setTooltipData({
              x: relativeX,
              y: relativeY,
              key: cellData.key,
              color: cellData.color,
            });
          } else {
            // main 요소를 찾지 못한 경우 원래 좌표 사용
            setTooltipData({
              x: pageX,
              y: pageY,
              key: cellData.key,
              color: cellData.color,
            });
          }
        } else {
          // 외부 영역이나 배경을 클릭/호버한 경우 툴팁 숨기기
          setTooltipData(null);
        }
      }
    } else {
      // 캔버스 외부를 클릭/호버한 경우 툴팁 숨기기
      setTooltipData(null);
    }
  };

  // 사용자 지정 팔레트에서 개별 색상 선택 변경 처리
  const handleSelectionChange = (hexValue: string, isSelected: boolean) => {
    const normalizedHex = hexValue.toUpperCase();
    setCustomPaletteSelections(prev => ({
      ...prev,
      [normalizedHex]: isSelected
    }));
    setIsCustomPalette(true);
  };

  // 사용자 지정 팔레트 저장 및 적용
  const handleSaveCustomPalette = () => {
    savePaletteSelections(customPaletteSelections);
    setIsCustomPalette(true);
    setIsCustomPaletteEditorOpen(false);
    // 이미지 다시 처리
    setRemapTrigger(prev => prev + 1);
    // 수동 색칠 모드 종료
    setIsManualColoringMode(false);
    setSelectedColor(null);
    setIsEraseMode(false);
  };

  // ++ 추가: 사용자 지정 팔레트 설정 내보내기 ++
  const handleExportCustomPalette = () => {
    const selectedHexValues = Object.entries(customPaletteSelections)
      .filter(([, isSelected]) => isSelected)
      .map(([hexValue]) => hexValue);

    if (selectedHexValues.length === 0) {
      alert("현재 선택된 색상이 없어 내보낼 수 없습니다.");
      return;
    }

    // 내보내기 형식: hex 값만 사용
    const exportData = {
      version: "3.0", // 새 버전 번호
      selectedHexValues: selectedHexValues,
      exportDate: new Date().toISOString(),
      totalColors: selectedHexValues.length
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'custom-perler-palette.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // ++ 추가: 가져온 팔레트 파일 처리 ++
  const handleImportPaletteFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        // 파일 형식 확인
        if (!Array.isArray(data.selectedHexValues)) {
          throw new Error("잘못된 파일 형식입니다. 파일에 'selectedHexValues' 배열이 포함되어 있어야 합니다.");
        }

        console.log("hex 값 기반 팔레트 파일 감지");

        const importedHexValues = data.selectedHexValues as string[];
        const validHexValues: string[] = [];
        const invalidHexValues: string[] = [];

        // hex 값 검증
        importedHexValues.forEach(hex => {
          const normalizedHex = hex.toUpperCase();
          const colorData = fullBeadPalette.find(color => color.hex.toUpperCase() === normalizedHex);
          if (colorData) {
            validHexValues.push(normalizedHex);
          } else {
            invalidHexValues.push(hex);
          }
        });

        if (invalidHexValues.length > 0) {
          console.warn("가져오기 중 잘못된 hex 값 발견:", invalidHexValues);
          alert(`가져오기가 완료되었지만 다음 색상은 유효하지 않아 제외되었습니다:\n${invalidHexValues.join(', ')}`);
        }

        if (validHexValues.length === 0) {
          alert("가져온 파일에 유효한 색상이 없습니다.");
          return;
        }

        console.log(`${validHexValues.length}개의 유효한 hex 값을 확인했습니다`);

        // 유효한 hex 값을 기반으로 새로운 selections 객체 생성
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const newSelections = presetToSelections(allHexValues, validHexValues);
        setCustomPaletteSelections(newSelections);
        setIsCustomPalette(true); // 사용자 지정으로 표시
        alert(`${validHexValues.length}개의 색상을 성공적으로 가져왔습니다!`);

      } catch (error) {
        console.error("팔레트 설정 가져오기 실패:", error);
        alert(`가져오기 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
      } finally {
        // 같은 파일을 다시 가져올 수 있도록 파일 입력 초기화
        if (event.target) {
          event.target.value = '';
        }
      }
    };
    reader.onerror = () => {
      alert("파일을 읽지 못했습니다.");
       // 파일 입력 초기화
      if (event.target) {
        event.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ++ 추가: 가져오기 파일 선택 창 열기 ++
  const triggerImportPalette = () => {
    importPaletteInputRef.current?.click();
  };

  // 추가: 색상 강조 처리
  const handleHighlightColor = (colorHex: string) => {
    setHighlightColorKey(colorHex);
  };

  // 추가: 강조 완료 콜백
  const handleHighlightComplete = () => {
    setHighlightColorKey(null);
  };

  // 추가: 전체 팔레트 표시 전환
  const handleToggleFullPalette = () => {
    setShowFullPalette(!showFullPalette);
  };

  // 추가: 색상 선택 처리 및 모드 전환 관리
  const handleColorSelect = (colorData: { key: string; color: string; isExternal?: boolean }) => {
    // 지우개(투명색)를 선택했고 현재 색상 교체 모드라면 교체 모드 종료
    if (colorData.key === TRANSPARENT_KEY && colorReplaceState.isActive) {
      setColorReplaceState({
        isActive: false,
        step: 'select-source'
      });
      setHighlightColorKey(null);
    }
    
    // 지우개를 포함해 어떤 색상이든 선택하면 원클릭 지우기 모드 종료
    if (isEraseMode) {
      setIsEraseMode(false);
    }
    
    // 선택한 색상 설정
    setSelectedColor(colorData);
  };

  // 추가: 색상 교체 관련 처리 함수
  const handleColorReplaceToggle = () => {
    setColorReplaceState(prev => {
      if (prev.isActive) {
        // 교체 모드 종료
        return {
          isActive: false,
          step: 'select-source'
        };
      } else {
        // 교체 모드 진입
        // 충돌하는 모드만 종료하고 수동 색칠 모드는 유지
        setIsEraseMode(false);
        setSelectedColor(null);
        return {
          isActive: true,
          step: 'select-source'
        };
      }
    });
  };

  // 추가: 캔버스에서 원본 색상 선택 처리
  const handleCanvasColorSelect = (colorData: { key: string; color: string }) => {
    if (colorReplaceState.isActive && colorReplaceState.step === 'select-source') {
      // 선택한 색상 강조 표시
      setHighlightColorKey(colorData.color);
      // 2단계로 이동: 대상 색상 선택
      setColorReplaceState({
        isActive: true,
        step: 'select-target',
        sourceColor: colorData
      });
    }
  };

  // 추가: 색상 교체 실행
  const handleColorReplace = (sourceColor: { key: string; color: string }, targetColor: { key: string; color: string }) => {
    if (!mappedPixelData || !gridDimensions) return;

    const { N, M } = gridDimensions;
    const newPixelData = mappedPixelData.map(row => row.map(cell => ({ ...cell })));
    let replaceCount = 0;

    // 모든 픽셀을 순회하며 일치하는 색상 교체
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const currentCell = newPixelData[j][i];
        if (currentCell && !currentCell.isExternal && 
            currentCell.color.toUpperCase() === sourceColor.color.toUpperCase()) {
          // 색상 교체
          newPixelData[j][i] = {
            key: targetColor.key,
            color: targetColor.color,
            isExternal: false
          };
          replaceCount++;
        }
      }
    }

    if (replaceCount > 0) {
      // 픽셀 데이터 업데이트
      saveEditSnapshot();
      setMappedPixelData(newPixelData);

      // 색상 통계 다시 계산
      if (colorCounts) {
        const newColorCounts: { [hexKey: string]: { count: number; color: string } } = {};
        let newTotalCount = 0;

        newPixelData.flat().forEach(cell => {
          if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
            const cellHex = cell.color.toUpperCase();
            if (!newColorCounts[cellHex]) {
              newColorCounts[cellHex] = {
                count: 0,
                color: cellHex
              };
            }
            newColorCounts[cellHex].count++;
            newTotalCount++;
          }
        });

        setColorCounts(newColorCounts);
        setTotalBeadCount(newTotalCount);
      }

      console.log(`색상 교체 완료: ${replaceCount}개의 ${sourceColor.key}을(를) ${targetColor.key}(으)로 교체했습니다`);
    }

    // 교체 모드 종료
    setColorReplaceState({
      isActive: false,
      step: 'select-source'
    });
    
    // 강조 표시 제거
    setHighlightColorKey(null);
  };

  // 전체 팔레트 데이터 생성 (사용자 지정 팔레트에서 선택된 모든 색상)
  const fullPaletteColors = useMemo(() => {
    const selectedColors: { key: string; color: string }[] = [];
    
    Object.entries(customPaletteSelections).forEach(([hexValue, isSelected]) => {
      if (isSelected) {
        // 선택한 색상 코드 시스템에 따라 표시할 색상 코드 가져오기
        const displayKey = getColorKeyByHex(hexValue, selectedColorSystem);
        selectedColors.push({
          key: displayKey,
          color: hexValue
        });
      }
    });
    
    // 색상 코드 순서가 아닌 색조 순서로 정렬
    return sortColorsByHue(selectedColors);
  }, [customPaletteSelections, selectedColorSystem]);

  return (
    <>
    {/* 사용자 지정 애니메이션 스타일 추가 */}
    <style dangerouslySetInnerHTML={{ __html: floatAnimation }} />
    <style dangerouslySetInnerHTML={{ __html: '@keyframes toastFadeInOut{0%{opacity:0;transform:translate(-50%,10px)}15%{opacity:1;transform:translate(-50%,0)}85%{opacity:1;transform:translate(-50%,0)}100%{opacity:0;transform:translate(-50%,-10px)}}' }} />
    
    {/* PWA 설치 버튼 */}
    <InstallPWA />
    
    {/* ++ 수정: onLoad 콜백 함수 추가 ++ */}
    <Script
      async
      src="//busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js"
      strategy="lazyOnload"
      onLoad={() => {
        const basePV = 378536; // ++ 사전 설정 PV 기준값 ++
        const baseUV = 257864; // ++ 사전 설정 UV 기준값 ++

        const updateCount = (spanId: string, baseValue: number) => {
          const targetNode = document.getElementById(spanId);
          if (!targetNode) return;

          const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
              if (mutation.type === 'childList' || mutation.type === 'characterData') {
                const currentValueText = targetNode.textContent?.trim() || '0';
                if (currentValueText !== '...') {
                  const currentValue = parseInt(currentValueText.replace(/,/g, ''), 10) || 0;
                  targetNode.textContent = (currentValue + baseValue).toLocaleString();
                  observer.disconnect(); // ++ 업데이트 후 관찰 중지 ++ 
                  // console.log(`Updated ${spanId} from ${currentValueText} to ${targetNode.textContent}`);
                  break; // 첫 번째 유효한 업데이트 처리 후 종료
                }
              }
            }
          });

          observer.observe(targetNode, { childList: true, characterData: true, subtree: true });

          // ++ 초기값이 이미 숫자인 경우 처리 (스크립트가 빠르게 로드된 경우) ++
          const initialValueText = targetNode.textContent?.trim() || '0';
          if (initialValueText !== '...') {
             const initialValue = parseInt(initialValueText.replace(/,/g, ''), 10) || 0;
             targetNode.textContent = (initialValue + baseValue).toLocaleString();
             observer.disconnect(); // 이미 업데이트되었으므로 더 이상 관찰할 필요 없음
          }
        };

        updateCount('busuanzi_value_site_pv', basePV);
        updateCount('busuanzi_value_site_uv', baseUV);
      }}
    />

    {/* 메인 컨테이너에 다크 모드 스타일 적용 */}
    <div className="min-h-screen p-4 sm:p-6 flex flex-col items-center bg-gradient-to-b from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 font-[family-name:var(--font-geist-sans)] overflow-x-hidden">
      {/* 헤더에 다크 모드 스타일 적용 */}
      <header className="w-full md:max-w-4xl text-center mt-6 mb-8 sm:mt-8 sm:mb-10 relative overflow-hidden">
        {/* 다크 모드용 장식 배경색 조정 */}
        <div className="absolute top-0 left-0 w-48 h-48 bg-blue-100 dark:bg-blue-900 rounded-full opacity-30 dark:opacity-20 blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-48 h-48 bg-pink-100 dark:bg-pink-900 rounded-full opacity-30 dark:opacity-20 blur-3xl"></div>

        {/* 장식 점 색상 조정 */}
        <div className="absolute top-0 right-0 grid grid-cols-5 gap-1 opacity-20 dark:opacity-10">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600"></div>
          ))}
        </div>
        <div className="absolute bottom-0 left-0 grid grid-cols-5 gap-1 opacity-20 dark:opacity-10">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-600"></div>
          ))}
        </div>

        {/* 헤더 콘텐츠 - 화려하게 통합된 로고와 제목 */}
        <div className="relative z-10 py-8">
          {/* 통합된 화려한 로고 및 제목 컨테이너 */}
          <div className="relative flex flex-col items-center">
            {/* 매우 귀엽고 디테일한 16개 비즈 아이콘 */}
            <div className="relative mb-6 animate-float">
              <div className="relative grid grid-cols-4 gap-2 p-4 bg-white/95 dark:bg-gray-800/95 rounded-3xl shadow-2xl border-4 border-gradient-to-r from-pink-300 via-purple-300 to-blue-300 dark:border-gray-600">
                {['bg-red-400', 'bg-blue-400', 'bg-yellow-400', 'bg-green-400',
                  'bg-purple-400', 'bg-pink-400', 'bg-orange-400', 'bg-teal-400',
                  'bg-indigo-400', 'bg-cyan-400', 'bg-lime-400', 'bg-amber-400',
                  'bg-rose-400', 'bg-sky-400', 'bg-emerald-400', 'bg-violet-400'].map((color, i) => (
                  <div key={i} className="relative">
                    <div
                      className={`w-5 h-5 rounded-full ${color} transition-all duration-500 hover:scale-150 shadow-xl hover:shadow-2xl relative z-10`}
                      style={{
                        animation: `float ${2 + (i % 3)}s ease-in-out infinite ${i * 0.1}s`,
                        boxShadow: `0 0 20px ${color.includes('red') ? '#f87171' : color.includes('blue') ? '#60a5fa' : color.includes('yellow') ? '#fbbf24' : color.includes('green') ? '#4ade80' : color.includes('purple') ? '#a855f7' : color.includes('pink') ? '#f472b6' : color.includes('orange') ? '#fb923c' : color.includes('teal') ? '#2dd4bf' : color.includes('indigo') ? '#818cf8' : color.includes('cyan') ? '#22d3ee' : color.includes('lime') ? '#84cc16' : color.includes('amber') ? '#f59e0b' : color.includes('rose') ? '#fb7185' : color.includes('sky') ? '#0ea5e9' : color.includes('emerald') ? '#10b981' : '#8b5cf6'}70`
                      }}
                    ></div>
                    {/* 각 비즈 주변의 미니 장식 */}
                    {i % 4 === 0 && <div className="absolute -top-0.5 -right-0.5 w-1 h-1 bg-yellow-300 rounded-full animate-ping"></div>}
                    {i % 4 === 1 && <div className="absolute -bottom-0.5 -left-0.5 w-0.5 h-0.5 bg-pink-300 rounded-full animate-pulse"></div>}
                    {i % 4 === 2 && <div className="absolute -top-0.5 -left-0.5 w-0.5 h-0.5 bg-blue-300 rounded-full animate-bounce"></div>}
                    {i % 4 === 3 && <div className="absolute -bottom-0.5 -right-0.5 w-1 h-1 bg-purple-300 rounded-full animate-spin"></div>}
                  </div>
                ))}
              </div>
              
              {/* 아이콘 주변의 귀여운 장식 */}
              <div className="absolute -top-3 -right-4 w-3 h-3 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-ping transform rotate-12"></div>
              <div className="absolute -top-1 -right-2 w-2 h-2 bg-gradient-to-br from-pink-400 to-purple-500 rotate-45 animate-spin"></div>
              <div className="absolute -bottom-3 -left-4 w-2.5 h-2.5 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full animate-bounce"></div>
              <div className="absolute -bottom-1 -left-2 w-1.5 h-1.5 bg-gradient-to-br from-green-400 to-teal-500 rotate-45 animate-pulse"></div>
              <div className="absolute top-0 -right-1 w-1 h-1 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full animate-pulse delay-100"></div>
              <div className="absolute -top-2 left-2 w-1 h-1 bg-gradient-to-br from-orange-400 to-red-500 rounded-full animate-bounce delay-200"></div>
              <div className="absolute bottom-1 -right-3 w-1.5 h-1.5 bg-gradient-to-br from-indigo-400 to-purple-500 rotate-45 animate-spin delay-300"></div>
              <div className="absolute -bottom-2 right-1 w-0.5 h-0.5 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full animate-ping delay-400"></div>
              
              {/* 추가 작은 반짝이 */}
              <div className="absolute -top-4 left-1 w-0.5 h-0.5 bg-yellow-300 rounded-full animate-pulse delay-500"></div>
              <div className="absolute top-2 -left-4 w-0.5 h-0.5 bg-pink-300 rounded-full animate-bounce delay-600"></div>
              <div className="absolute -bottom-4 right-2 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-700"></div>
              <div className="absolute bottom-2 -right-5 w-0.5 h-0.5 bg-purple-300 rounded-full animate-pulse delay-800"></div>
            </div>

            {/* 화려한 브랜드명 및 도구 이름 */}
            <div className="relative flex flex-col items-center space-y-3">
              {/* 브랜드명 - Qiao Yi */}
              <div className="relative">
                <h1 className="relative text-4xl sm:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-purple-500 via-blue-500 to-cyan-400 tracking-wider drop-shadow-2xl transform hover:scale-105 transition-transform duration-300">
                  Qiao Yi
                </h1>
                
                {/* 화려한 기하학 장식 */}
                <div className="absolute -top-4 -right-5 w-4 h-4 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-spin transform rotate-12"></div>
                <div className="absolute -top-2 -right-2 w-2.5 h-2.5 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full animate-ping"></div>
                <div className="absolute -top-1 -right-0.5 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-blue-500 rotate-45 animate-pulse delay-100"></div>
                <div className="absolute -bottom-3 -left-5 w-4 h-4 bg-gradient-to-br from-blue-400 to-purple-500 rotate-45 animate-bounce delay-200"></div>
                <div className="absolute -bottom-1 -left-2 w-2 h-2 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-full animate-spin delay-300"></div>
                <div className="absolute top-0 left-1/2 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full animate-pulse delay-400"></div>
                <div className="absolute -bottom-4 -right-3 w-3 h-3 bg-gradient-to-br from-cyan-400 to-teal-500 rounded-full animate-bounce delay-500"></div>
                <div className="absolute top-1 -left-4 w-2 h-2 bg-gradient-to-br from-pink-400 to-red-500 rotate-45 animate-ping delay-600"></div>
                
                {/* 브랜드명 주변의 작은 반짝이 */}
                <div className="absolute -top-3 left-0 w-1 h-1 bg-yellow-300 rounded-full animate-pulse delay-700"></div>
                <div className="absolute -top-2 right-3 w-0.5 h-0.5 bg-pink-300 rounded-full animate-bounce delay-800"></div>
                <div className="absolute bottom-0 -left-1 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-900"></div>
                <div className="absolute bottom-1 right-0 w-1 h-1 bg-purple-300 rounded-full animate-pulse delay-1000"></div>
              </div>
              
              {/* 도구 이름 - 핀또우 도안 생성기 */}
              <div className="relative">
                <h2 className="relative text-xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 via-teal-500 via-green-500 to-emerald-400 tracking-widest transform hover:scale-102 transition-all duration-300">
                  핀또우 도안 생성기
                  <span className="text-xs font-normal text-gray-400 dark:text-gray-500 tracking-widest ml-1 align-middle">세로 화면 버전</span>
                </h2>
                
                {/* 귀여운 기하학 도형 */}
                <div className="absolute -top-3 -left-6 w-3.5 h-3.5 bg-gradient-to-br from-blue-400 to-teal-500 rounded-full animate-bounce delay-75"></div>
                <div className="absolute -top-1 -left-3 w-2 h-2 bg-gradient-to-br from-teal-400 to-green-500 rounded-full animate-ping delay-150"></div>
                <div className="absolute -top-0.5 -left-1 w-1 h-1 bg-gradient-to-br from-green-400 to-emerald-500 rotate-45 animate-pulse delay-225"></div>
                <div className="absolute -top-3 -right-6 w-3 h-3 bg-gradient-to-br from-green-400 to-emerald-500 rotate-45 animate-spin delay-300"></div>
                <div className="absolute -top-1 -right-3 w-1.5 h-1.5 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full animate-bounce delay-375"></div>
                <div className="absolute -bottom-2 -right-3 w-2.5 h-2.5 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full animate-pulse delay-450"></div>
                <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-gradient-to-br from-teal-400 to-blue-500 rotate-45 animate-spin delay-525"></div>
                
                {/* 도구 이름 주변의 작은 반짝이 */}
                <div className="absolute -top-2 left-2 w-0.5 h-0.5 bg-blue-300 rounded-full animate-ping delay-600"></div>
                <div className="absolute -top-1 right-2 w-1 h-1 bg-teal-300 rounded-full animate-pulse delay-675"></div>
                <div className="absolute bottom-0 left-4 w-0.5 h-0.5 bg-green-300 rounded-full animate-bounce delay-750"></div>
                <div className="absolute bottom-1 right-4 w-0.5 h-0.5 bg-emerald-300 rounded-full animate-pulse delay-825"></div>
                <div className="absolute top-2 -left-2 w-0.5 h-0.5 bg-cyan-300 rounded-full animate-ping delay-900"></div>
                <div className="absolute top-2 -right-2 w-1 h-1 bg-teal-300 rounded-full animate-bounce delay-975"></div>
              </div>
            </div>
            
            {/* 전체 그룹 주변의 장식 요소 */}
            <div className="absolute -top-10 -left-10 w-3 h-3 bg-gradient-to-br from-pink-400 to-purple-500 rounded-full animate-float"></div>
            <div className="absolute -top-8 -left-6 w-1.5 h-1.5 bg-gradient-to-br from-purple-400 to-pink-500 rotate-45 animate-spin delay-100"></div>
            <div className="absolute -top-6 -left-12 w-2 h-2 bg-gradient-to-br from-pink-400 to-red-500 rounded-full animate-bounce delay-200"></div>
            
            <div className="absolute -top-10 -right-10 w-2.5 h-2.5 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full animate-ping delay-300"></div>
            <div className="absolute -top-6 -right-14 w-1 h-1 bg-gradient-to-br from-cyan-400 to-blue-500 rotate-45 animate-pulse delay-400"></div>
            <div className="absolute -top-4 -right-8 w-3 h-3 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full animate-bounce delay-500"></div>
            
            <div className="absolute -bottom-10 -left-10 w-2 h-2 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full animate-pulse delay-600"></div>
            <div className="absolute -bottom-8 -left-14 w-1.5 h-1.5 bg-gradient-to-br from-orange-400 to-red-500 rotate-45 animate-spin delay-700"></div>
            <div className="absolute -bottom-6 -left-6 w-2.5 h-2.5 bg-gradient-to-br from-yellow-400 to-pink-500 rounded-full animate-float delay-800"></div>
            
            <div className="absolute -bottom-10 -right-10 w-3 h-3 bg-gradient-to-br from-green-400 to-teal-500 rotate-45 animate-bounce delay-900"></div>
            <div className="absolute -bottom-8 -right-6 w-1 h-1 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-full animate-ping delay-1000"></div>
            <div className="absolute -bottom-6 -right-14 w-2 h-2 bg-gradient-to-br from-emerald-400 to-green-500 rounded-full animate-pulse delay-1100"></div>
            
            {/* 추가 작은 마법 반짝이 */}
            <div className="absolute -top-12 left-0 w-0.5 h-0.5 bg-yellow-300 rounded-full animate-ping delay-1200"></div>
            <div className="absolute -top-2 -left-16 w-1 h-1 bg-pink-300 rounded-full animate-bounce delay-1300"></div>
            <div className="absolute top-2 -right-18 w-0.5 h-0.5 bg-blue-300 rounded-full animate-pulse delay-1400"></div>
            <div className="absolute -bottom-12 right-0 w-1 h-1 bg-purple-300 rounded-full animate-float delay-1500"></div>
            <div className="absolute -bottom-2 -right-16 w-0.5 h-0.5 bg-green-300 rounded-full animate-ping delay-1600"></div>
            <div className="absolute bottom-2 -left-18 w-1 h-1 bg-teal-300 rounded-full animate-bounce delay-1700"></div>
          </div>

          {/* 슬로건 */}
          <p className="mt-3 text-sm sm:text-base font-light text-gray-500 dark:text-gray-400 text-center tracking-[0.15em]">
            픽셀 창작의 즐거움을 누구나 누릴 수 있도록
          </p>

          {/* 가로 화면 기기 팝업 */}
          {showDesktopModal && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowDesktopModal(false)}>
              <div className="relative mx-4 w-full max-w-md rounded-2xl border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setShowDesktopModal(false)}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                  </svg>
                </button>
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-blue-500 dark:text-blue-300">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 0v8h12V4H4zm-1 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">전문 작업대가 출시되었습니다</h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">전문 작업대에서는 더욱 다양한 기능과 편리한 사용 환경을 제공합니다. 전문 작업대 사용을 권장합니다.</p>
                  <div className="mt-5 flex w-full gap-3">
                    <button
                      onClick={() => setShowDesktopModal(false)}
                      className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      이 페이지에 머물기
                    </button>
                    <a
                      href="https://perlerbeads.zippland.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      전문 작업대로 이동
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M3 10a1 1 0 011-1h9.586L11.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z" clipRule="evenodd" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 링크 행: 전문 작업대 · 샤오홍슈 · GitHub */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5 text-xs">
            <a href="https://perlerbeads.zippland.com/" target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm1 0v8h12V4H4zm-1 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              전문 작업대
              <span className="px-1 py-px rounded bg-indigo-500 text-[9px] font-bold text-white leading-none">NEW</span>
            </a>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <a href="https://www.xiaohongshu.com/user/profile/623e8b080000000010007721" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 1024 1024" fill="currentColor">
                <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64z m238.8 360.2l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8zM448 496l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8z m248.9 43.2l-57.7 93.3c-10.1 16.3-31.5 21.3-47.8 11.2l-112.4-69.5c-16.3-10.1-21.3-31.5-11.2-47.8l57.7-93.3c10.1-16.3 31.5-21.3 47.8-11.2l112.4 69.5c16.3 10.1 21.3 31.5 11.2 47.8z"/>
              </svg>
              샤오홍슈
            </a>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <a href="https://github.com/Zippland/perler-beads" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 font-medium transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M12 0C5.37 0 0 5.48 0 12.25c0 5.42 3.44 10.01 8.2 11.63.6.12.82-.27.82-.6 0-.3-.01-1.08-.02-2.13-3.34.74-4.04-1.65-4.04-1.65-.55-1.44-1.35-1.83-1.35-1.83-1.1-.78.08-.77.08-.77 1.21.09 1.85 1.26 1.85 1.26 1.08 1.9 2.83 1.35 3.52 1.03.11-.81.42-1.35.77-1.66-2.66-.31-5.46-1.36-5.46-6.06 0-1.34.46-2.43 1.22-3.29-.12-.31-.53-1.55.12-3.23 0 0 1-.33 3.29 1.25a10.96 10.96 0 0 1 5.98 0c2.29-1.58 3.29-1.25 3.29-1.25.65 1.68.24 2.92.12 3.23.76.86 1.22 1.95 1.22 3.29 0 4.71-2.81 5.74-5.49 6.05.43.38.81 1.13.81 2.28 0 1.65-.02 2.98-.02 3.39 0 .33.22.72.83.59C20.56 22.25 24 17.67 24 12.25 24 5.48 18.63 0 12 0Z" />
              </svg>
              GitHub
            </a>
          </div>

          {/* 출처 안내 */}
          <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">게시 플랫폼에 업로드할 때는 출처를 표기하거나 이미지의 워터마크 및 표시를 유지해 주세요</p>
        </div>
      </header>

      {/* 메인 영역에 다크 모드 스타일 적용 */}
      <main ref={mainRef} className="w-full md:max-w-4xl flex flex-col items-center space-y-5 sm:space-y-6 relative overflow-hidden">
        {/* 드롭 영역에 다크 모드 스타일 적용 */}
        <div
          onDrop={handleDrop} onDragOver={handleDragOver} onDragEnter={handleDragOver}
          onClick={isMounted ? triggerFileInput : undefined}
          className={`border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 sm:p-8 text-center ${isMounted ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-800' : 'cursor-wait'} transition-all duration-300 w-full md:max-w-md flex flex-col justify-center items-center shadow-sm hover:shadow-md`}
          style={{ minHeight: '130px' }}
        >
          {/* 아이콘 색상 */}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 dark:text-gray-500 mb-2 sm:mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
             <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {/* 텍스트 색상 */}
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">이미지를 이곳에 드래그하거나 <span className="font-medium text-blue-600 dark:text-blue-400">클릭하여 파일 선택</span></p>
          {/* 텍스트 색상 */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">JPG, PNG, GIF 이미지 형식 또는 CSV 데이터 파일을 지원합니다</p>
        </div>

        {/* 안내 상자에 다크 모드 스타일 적용 */}
        {!originalImageSrc && (
          <div className="w-full md:max-w-md bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 p-3 rounded-lg border border-blue-100 dark:border-gray-600 shadow-sm">
            {/* 아이콘 색상 */}
            <p className="text-xs text-indigo-700 dark:text-indigo-300 flex items-start">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 flex-shrink-0 text-blue-500 dark:text-blue-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {/* 텍스트 색상 */}
              <span className="text-indigo-700 dark:text-indigo-300">팁: 픽셀 이미지를 변환하기 전에 이미지 가장자리가 픽셀 격자의 경계선에 맞도록 해주세요. 그러면 더욱 정확하게 분할되고 완성 결과도 좋아집니다.</span>
            </p>
          </div>
        )}

        <input type="file" accept="image/jpeg, image/png, image/gif, .csv, text/csv, application/csv, text/plain" onChange={handleFileChange} ref={fileInputRef} className="hidden" />

        {/* 제어 및 출력 영역 */}
        {originalImageSrc && (
          <div className="w-full flex flex-col items-center space-y-5 sm:space-y-6">
            {/* ++ 수동 모드에서는 제어 행 숨기기 ++ */}
            {!isManualColoringMode && (
              /* 제어판 그리드 레이아웃 수정 */
              <div className="w-full md:max-w-2xl grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                {/* 가로축 분할 개수 입력 */}
                <div className="flex-1">
                  {/* 라벨 색상 */}
                  <label htmlFor="granularityInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                    가로축 분할 개수 (10-300):
                  </label>
                  <div className="flex items-center gap-2">
                    {/* 입력 필드 스타일 */}
                    <input
                      type="number"
                      id="granularityInput"
                      value={granularityInput}
                      onChange={handleGranularityInputChange}
                      className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                      min="10"
                      max="300"
                    />
                  </div>
                </div>

                {/* 유사 색상 병합 기준 입력 */}
                <div className="flex-1">
                    {/* 라벨 색상 */}
                    <label htmlFor="similarityThresholdInput" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">
                        유사 색상 병합 기준 (0-100):
                    </label>
                    <div className="flex items-center gap-2">
                      {/* 입력 필드 스타일 */}
                      <input
                        type="number"
                        id="similarityThresholdInput"
                        value={similarityThresholdInput}
                        onChange={handleSimilarityThresholdInputChange}
                        className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
                        min="0"
                        max="100"
                      />
                    </div>
                </div>

                {/* 빠른 실행 버튼 */}
                <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleConfirmParameters}
                    className="h-9 bg-blue-500 hover:bg-blue-600 text-white text-sm px-3 rounded-md whitespace-nowrap transition-colors duration-200 shadow-sm"
                  >
                    숫자 적용
                  </button>
                  <button
                    onClick={handleAutoRemoveBackground}
                    disabled={!mappedPixelData || !gridDimensions}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    원클릭 배경 제거
                  </button>
                  <button
                    onClick={handleUndoBgRemoval}
                    disabled={!bgRemovalSnapshot}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    이전 단계로 되돌리기
                  </button>
                </div>

                {/* 픽셀화 모드 선택 */}
                <div className="sm:col-span-2">
                  {/* 라벨 색상 */}
                  <label htmlFor="pixelationModeSelect" className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">처리 모드:</label>
                  <div className="flex items-center gap-2">
                    {/* 선택 필드 스타일 */}
                    <select
                      id="pixelationModeSelect"
                      value={pixelationMode}
                      onChange={handlePixelationModeChange}
                      className="w-full p-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 h-9 shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                    >
                      <option value={PixelationMode.Dominant} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">카툰 (주요 색상)</option>
                      <option value={PixelationMode.Average} className="bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200">실사 (평균 색상)</option>
                    </select>
                  </div>
                </div>

                {/* 색상 코드 시스템 선택 */}
                <div className="sm:col-span-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 sm:mb-2">색상 코드 시스템:</label>
                  <div className="flex flex-wrap gap-2">
                    {colorSystemOptions.map(option => (
                      <button
                        key={option.key}
                        onClick={() => setSelectedColorSystem(option.key as ColorSystem)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-all duration-200 flex-shrink-0 ${
                          selectedColorSystem === option.key
                            ? 'bg-blue-500 text-white border-blue-500 shadow-md transform scale-105'
                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-gray-600'
                        }`}
                      >
                        {option.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 사용자 지정 팔레트 버튼 */}
                <div className="sm:col-span-2 mt-3">
                  <button
                    onClick={() => setIsCustomPaletteEditorOpen(true)}
                    className="w-full py-2.5 px-3 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-medium rounded-lg shadow-sm transition-all duration-200 hover:shadow-md hover:from-blue-600 hover:to-purple-600"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
                    </svg>
                    팔레트 관리 ({Object.values(customPaletteSelections).filter(Boolean).length}색)
                  </button>
                  {isCustomPalette && (
                    <p className="text-xs text-center text-blue-500 dark:text-blue-400 mt-1.5">현재 사용자 지정 팔레트를 사용 중입니다</p>
                  )}
                </div>
              </div>
            )}

            {/* 사용자 지정 팔레트 편집기 팝업 */}
            {isCustomPaletteEditorOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                   {/* 숨겨진 파일 입력 추가 */}
                   <input
                    type="file"
                    accept=".json"
                    ref={importPaletteInputRef}
                    onChange={handleImportPaletteFile}
                    className="hidden"
                  />
                  <div className="p-4 sm:p-6 flex-1 overflow-y-auto"> {/* 콘텐츠 영역 스크롤 허용 */}
                    <CustomPaletteEditor
                      allColors={fullBeadPalette}
                      currentSelections={customPaletteSelections}
                      onSelectionChange={handleSelectionChange}
                      onSaveCustomPalette={handleSaveCustomPalette}
                      onClose={() => setIsCustomPaletteEditorOpen(false)}
                      onExportCustomPalette={handleExportCustomPalette}
                      onImportCustomPalette={triggerImportPalette}
                      selectedColorSystem={selectedColorSystem}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 출력 영역 */}
            <div className="w-full md:max-w-2xl">
              <canvas ref={originalCanvasRef} className="hidden"></canvas>

              {/* ++ 수동 편집 모드 안내 ++ */}
              {isManualColoringMode && mappedPixelData && gridDimensions && (
                <div className="w-full mb-4 p-3 bg-blue-50 dark:bg-gray-800 rounded-lg shadow-sm border border-blue-100 dark:border-gray-700">
                  <div className="flex justify-center">
                    <div className="bg-blue-50 dark:bg-gray-700 border border-blue-100 dark:border-gray-600 rounded-lg p-2 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 text-xs text-gray-600 dark:text-gray-300 w-full sm:w-auto">
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                        <span>오른쪽 상단 메뉴에서 작업하세요</span>
                      </div>
                      <span className="hidden sm:inline text-gray-300 dark:text-gray-500">|</span>
                      <div className="flex items-center gap-1 w-full sm:w-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>더 정확한 색칠을 위해 PC 사용을 권장합니다</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 캔버스 미리보기 컨테이너 */}
              {/* 다크 모드 스타일 적용 */}
              <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
                {/* 대형 캔버스 안내 */}
                {gridDimensions && gridDimensions.N > 100 && (
                  <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-300 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>고해상도 그리드 ({gridDimensions.N}×{gridDimensions.M}) - 캔버스가 자동으로 확대되었습니다. 좌우로 스크롤하거나 확대하여 세부 이미지를 확인할 수 있습니다</span>
                    </div>
                  </div>
                )}
                 {/* 내부 컨테이너 배경 - 큰 캔버스에 맞게 가로 스크롤 허용 */}
                <div className="flex justify-center mb-3 sm:mb-4 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg overflow-x-auto overflow-y-hidden"
                     style={{ minHeight: '150px' }}>
                  {/* PixelatedPreviewCanvas 컴포넌트의 다크 모드 그리기 처리는 내부에서 수정 필요 */}
                  <PixelatedPreviewCanvas
                    canvasRef={pixelatedCanvasRef}
                    mappedPixelData={mappedPixelData}
                    gridDimensions={gridDimensions}
                    isManualColoringMode={isManualColoringMode}
                    onInteraction={handleCanvasInteraction}
                    highlightColorKey={highlightColorKey}
                    onHighlightComplete={handleHighlightComplete}
                  />
                </div>
              </div>
            </div>
          </div> // originalImageSrc 검사 후 시작된 메인 div 닫기
        )}

        {/* ++ 수동 모드에서는 색상 통계 숨기기 ++ */}
        {!isManualColoringMode && originalImageSrc && colorCounts && Object.keys(colorCounts).length > 0 && (
          // 색상 통계 컨테이너에 다크 모드 스타일 적용
          <div className="w-full md:max-w-2xl mt-6 bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-100 dark:border-gray-700 color-stats-panel">
            {/* 제목 색상 */}
            <h3 className="text-lg font-semibold mb-1 text-gray-700 dark:text-gray-200 text-center">
              불필요한 색상 제거
            </h3>
            {/* 부제목 색상 */}
            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">아래 목록에서 색상을 클릭하면 사용 가능한 색상 목록에서 제외할 수 있습니다. 총계: {totalBeadCount}개</p>
            <ul className="space-y-1 max-h-60 overflow-y-auto pr-2 text-sm">
              {Object.keys(colorCounts)
                .sort(sortColorKeys)
                .map((hexKey) => {
                  // 현재 key는 hex 값이므로 hex를 통해 해당 색상 코드 시스템의 색상 코드 가져오기
                  const displayColorKey = getColorKeyByHex(hexKey, selectedColorSystem);
                  const isExcluded = excludedColorKeys.has(hexKey);
                  const count = colorCounts[hexKey].count;
                  const colorHex = colorCounts[hexKey].color;

                  return (
                    <li
                      key={hexKey}
                      onClick={() => handleToggleExcludeColor(hexKey)}
                      // 목록 항목에 다크 모드 스타일 적용 (일반/제외 상태)
                      className={`flex items-center justify-between p-1.5 rounded cursor-pointer transition-colors ${ 
                        isExcluded
                          ? 'bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-800/60 opacity-60 dark:opacity-70'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                      title={isExcluded ? `${displayColorKey} 복원` : `${displayColorKey} 제외`}
                    >
                      <div className={`flex items-center space-x-2 ${isExcluded ? 'line-through' : ''}`}>
                        {/* 색상 견본 테두리 조정 */}
                        <span
                          className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                          style={{ backgroundColor: isExcluded ? '#666' : colorHex }}
                        ></span>
                        {/* 색상 코드 텍스트 색상 조정 (일반/제외 상태) */}
                        <span className={`font-mono font-medium ${isExcluded ? 'text-red-700 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{displayColorKey}</span>
                      </div>
                      {/* 개수 텍스트 색상 조정 (일반/제외 상태) */}
                      <span className={`text-xs ${isExcluded ? 'text-red-600 dark:text-red-400 line-through' : 'text-gray-600 dark:text-gray-300'}`}>{count}개</span>
                    </li>
                  );
                })}
            </ul>
            {excludedColorKeys.size > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setShowExcludedColors(prev => !prev)}
                    className="w-full text-xs py-1.5 px-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors flex items-center justify-between"
                  >
                    <span>제외된 색상 ({excludedColorKeys.size})</span>
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      className={`h-4 w-4 text-gray-500 dark:text-gray-400 transform transition-transform ${showExcludedColors ? 'rotate-180' : ''}`}
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  
                  {showExcludedColors && (
                    <div className="mt-2 border border-gray-200 dark:border-gray-700 rounded-md p-2 bg-gray-100 dark:bg-gray-800">
                      <div className="max-h-40 overflow-y-auto">
                        {Array.from(excludedColorKeys).length > 0 ? (
                          <ul className="space-y-1">
                            {Array.from(excludedColorKeys).sort(sortColorKeys).map(hexKey => {
                              const colorData = fullBeadPalette.find(color => color.hex.toUpperCase() === hexKey.toUpperCase());
                              return (
                                <li key={hexKey} className="flex justify-between items-center p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded">
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className="inline-block w-4 h-4 rounded border border-gray-400 dark:border-gray-500 flex-shrink-0"
                                      style={{ backgroundColor: colorData?.hex || hexKey }}
                                    ></span>
                                    <span className="font-mono text-xs text-gray-800 dark:text-gray-200">{getColorKeyByHex(hexKey, selectedColorSystem)}</span>
                                  </div>
                                  <button
                                    onClick={() => {
                                      // 개별 색상 복원 로직
                                      const newExcludedKeys = new Set(excludedColorKeys);
                                      newExcludedKeys.delete(hexKey);
                                      setExcludedColorKeys(newExcludedKeys);
                                      setRemapTrigger(prev => prev + 1);
                                      setIsManualColoringMode(false);
                                      setSelectedColor(null);
                                      console.log(`Restored color: ${hexKey}`);
                                    }}
                                    className="text-xs py-0.5 px-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40"
                                  >
                                    복원
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-center text-gray-500 dark:text-gray-400 py-2">
                            제외된 색상이 없습니다
                          </p>
                        )}
                      </div>
                      
                      <button
                        onClick={() => {
                          // 모든 색상 복원 로직
                          setExcludedColorKeys(new Set());
                          setRemapTrigger(prev => prev + 1);
                          setIsManualColoringMode(false);
                          setSelectedColor(null);
                          console.log("Restored all excluded colors");
                        }}
                        className="mt-2 w-full text-xs py-1 px-2 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        모든 색상 한 번에 복원
                      </button>
                    </div>
                  )}
                </div>
            )}
          </div>
        )} {/* ++ 색상 통계 숨기기 끝 ++ */}

        {/* 팔레트가 비었을 때 메시지 (수동 모드에서도 숨김) */}
         {!isManualColoringMode && originalImageSrc && activeBeadPalette.length === 0 && excludedColorKeys.size > 0 && (
             // 경고 상자에 다크 모드 스타일 적용
             <div className="w-full md:max-w-2xl mt-6 bg-yellow-100 dark:bg-yellow-900/50 p-4 rounded-lg shadow border border-yellow-200 dark:border-yellow-800/60 text-center text-sm text-yellow-800 dark:text-yellow-300">
                 현재 사용할 수 있는 색상이 너무 적거나 없습니다. 위의 통계 목록에서 제외된 색상을 확인하고 일부 색상을 복원하거나 팔레트를 변경해 주세요.
                 {excludedColorKeys.size > 0 && (
                      // 인라인 "모두 복원" 버튼에 다크 모드 스타일 적용
                      <button
                          onClick={() => {
                            setShowExcludedColors(true); // 제외된 색상 목록 펼치기
                            // 색상 목록으로 스크롤
                            setTimeout(() => {
                              const listElement = document.querySelector('.color-stats-panel');
                              if (listElement) {
                                listElement.scrollIntoView({ behavior: 'smooth' });
                              }
                            }, 100);
                          }}
                          className="mt-2 ml-2 text-xs py-1 px-2 bg-yellow-200 dark:bg-yellow-700/60 text-yellow-900 dark:text-yellow-200 rounded hover:bg-yellow-300 dark:hover:bg-yellow-600/70 transition-colors"
                      >
                          제외된 색상 보기 ({excludedColorKeys.size})
                      </button>
                  )}
             </div>
         )}

        {/* ++ 수동 모드가 아닐 때만 수동 편집 모드 진입 버튼 표시 (다운로드 버튼 앞) ++ */}
        {!isManualColoringMode && originalImageSrc && mappedPixelData && gridDimensions && (
            <div className="w-full md:max-w-2xl mt-4 space-y-3">
             {/* 수동 편집 모드 버튼 */}
             <button
                onClick={() => {
                  setIsManualColoringMode(true); // 모드 진입
                  setSelectedColor(null);
                  setTooltipData(null);
                }}
                className={`w-full py-2.5 px-4 text-sm sm:text-base rounded-lg transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md hover:shadow-lg hover:translate-y-[-1px]`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"> <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /> </svg>
                 수동 편집 모드 시작
             </button>

             {/* 집중 모드 버튼 */}
             <button
                onClick={handleEnterFocusMode}
                className={`w-full py-2.5 px-4 text-sm sm:text-base rounded-lg transition-all duration-300 flex items-center justify-center gap-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-md hover:shadow-lg hover:translate-y-[-1px]`}
              >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                 </svg>
                 집중 핀또우 모드 시작 (Alpha Test)
             </button>
            </div>
        )} {/* ++ 수동 편집 모드 진입 버튼 표시 끝 ++ */}

        {/* ++ 수동 모드에서는 다운로드 버튼 숨기기 ++ */}
        {!isManualColoringMode && originalImageSrc && mappedPixelData && (
            <div className="w-full md:max-w-2xl mt-4">
              {/* 모든 다운로드 설정은 팝업에서 제어 */}
              <button
                onClick={() => setIsDownloadSettingsOpen(true)}
                disabled={!mappedPixelData || !gridDimensions || gridDimensions.N === 0 || gridDimensions.M === 0 || activeBeadPalette.length === 0}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm sm:text-base rounded-lg hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg hover:translate-y-[-1px] disabled:hover:translate-y-0 disabled:hover:shadow-md"
               >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                핀또우 도안 다운로드
              </button>
            </div>
        )} {/* ++ 다운로드 버튼 숨기기 끝 ++ */}

         {/* 툴팁 표시 */}
         {tooltipData && (
            <GridTooltip tooltipData={tooltipData} selectedColorSystem={selectedColorSystem} />
          )}

      </main>

      {/* 플로팅 도구 모음 */}
      <FloatingToolbar
        isManualColoringMode={isManualColoringMode}
        isPaletteOpen={isFloatingPaletteOpen}
        onTogglePalette={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
        onExitManualMode={() => {
          setIsManualColoringMode(false);
          setSelectedColor(null);
          setTooltipData(null);
          setIsEraseMode(false);
          setColorReplaceState({
            isActive: false,
            step: 'select-source'
          });
          setHighlightColorKey(null);
          setIsMagnifierActive(false);
          setMagnifierSelectionArea(null);
          clearEditHistory();
        }}
        onToggleMagnifier={handleToggleMagnifier}
        isMagnifierActive={isMagnifierActive}
      />

      {/* 플로팅 색상 팔레트 */}
      {isManualColoringMode && (
        <FloatingColorPalette
          colors={currentGridColors}
          selectedColor={selectedColor}
          onColorSelect={handleColorSelect}
          selectedColorSystem={selectedColorSystem}
          isEraseMode={isEraseMode}
          onEraseToggle={handleEraseToggle}
          fullPaletteColors={fullPaletteColors}
          showFullPalette={showFullPalette}
          onToggleFullPalette={handleToggleFullPalette}
          colorReplaceState={colorReplaceState}
          onColorReplaceToggle={handleColorReplaceToggle}
          onColorReplace={handleColorReplace}
          onHighlightColor={handleHighlightColor}
          isOpen={isFloatingPaletteOpen}
          onToggleOpen={() => setIsFloatingPaletteOpen(!isFloatingPaletteOpen)}
          isActive={activeFloatingTool === 'palette'}
          onActivate={handleActivatePalette}
          canUndo={editHistory.length > 0}
          onUndo={handleUndoEdit}
        />
      )}

      {/* 돋보기 도구 */}
      {isManualColoringMode && (
        <>
          <MagnifierTool
            isActive={isMagnifierActive}
            onToggle={handleToggleMagnifier}
            mappedPixelData={mappedPixelData}
            gridDimensions={gridDimensions}
            selectedColor={selectedColor}
            selectedColorSystem={selectedColorSystem}
            onPixelEdit={handleMagnifierPixelEdit}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            selectionArea={magnifierSelectionArea}
            onClearSelection={() => setMagnifierSelectionArea(null)}
            isFloatingActive={activeFloatingTool === 'magnifier'}
            onActivateFloating={handleActivateMagnifier}
            highlightColorKey={highlightColorKey}
          />
          
          {/* 돋보기 선택 오버레이 */}
          <MagnifierSelectionOverlay
            isActive={isMagnifierActive && !magnifierSelectionArea}
            canvasRef={pixelatedCanvasRef}
            gridDimensions={gridDimensions}
            cellSize={gridDimensions ? Math.min(6, Math.max(4, 500 / Math.max(gridDimensions.N, gridDimensions.M))) : 6}
            onSelectionComplete={setMagnifierSelectionArea}
          />
        </>
      )}

      {/* 푸터에 다크 모드 스타일 적용 */}
      <footer className="w-full md:max-w-4xl mt-10 mb-6 py-6 text-center text-xs sm:text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gradient-to-b from-white to-gray-50 dark:from-gray-900 dark:to-gray-800/50 rounded-lg shadow-inner">

        {/* 후원 버튼 */}
        <button
          onClick={() => setIsDonationModalOpen(true)}
          className="mb-5 px-6 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-full shadow-lg transition-all duration-300 hover:shadow-xl hover:translate-y-[-2px] flex items-center justify-center mx-auto"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8h1a2 2 0 0 1 2 2v1c0 1.1-.9 2-2 2h-1" fill="#f9a8d4" />
            <path d="M6 8h12v9a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V8z" fill="#f9a8d4" />
            <path d="M6 8V7a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v1" fill="#f472b6" />
            <path d="M12 16v-4" stroke="#7d2a5a" />
            <path d="M9.5 14.5L9 16" stroke="#7d2a5a" />
            <path d="M14.5 14.5L15 16" stroke="#7d2a5a" />
          </svg>
          <span>개발자에게 밀크티 한 잔 후원하기</span>
        </button>

        {/* 저작권 텍스트 */}
        <p className="font-medium text-gray-600 dark:text-gray-300">
          Qiao Yi 핀또우 도안 생성기 &copy; {new Date().getFullYear()}
        </p>
      </footer>

      {/* 후원 팝업 */}
      <DonationModal isOpen={isDonationModalOpen} onClose={() => setIsDonationModalOpen(false)} />

      {/* 다운로드 설정 팝업 */}
      <DownloadSettingsModal 
        isOpen={isDownloadSettingsOpen}
        onClose={() => setIsDownloadSettingsOpen(false)}
        options={downloadOptions}
        onOptionsChange={setDownloadOptions}
        onDownload={handleDownloadRequest}
      />

      {/* 집중 핀또우 모드 진입 전 다운로드 안내 팝업 */}
      <FocusModePreDownloadModal
        isOpen={isFocusModePreDownloadModalOpen}
        onClose={() => setIsFocusModePreDownloadModalOpen(false)}
        onProceedWithoutDownload={handleProceedToFocusMode}
        mappedPixelData={mappedPixelData}
        gridDimensions={gridDimensions}
        selectedColorSystem={selectedColorSystem}
      />

      {/* 간단한 안내 Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg z-[200] text-sm whitespace-nowrap"
             style={{ animation: 'toastFadeInOut 2s ease-in-out' }}>
          {toastMessage}
        </div>
      )}
    </div>
   </>
  );
}
