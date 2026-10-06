'use client';

import React, { useState, useEffect } from 'react';
import { PaletteColor } from '../utils/pixelation';
import { PaletteSelections } from '../utils/localStorageUtils';
import { getDisplayColorKey, ColorSystem } from '../utils/colorSystemUtils';

// 색상을 접두사별로 그룹화하는 유틸리티 함수
function groupColorsByPrefix(colors: PaletteColor[], selectedColorSystem: ColorSystem): Record<string, PaletteColor[]> {
  const groups: Record<string, PaletteColor[]> = {};
  
  colors.forEach(color => {
    const displayKey = getDisplayColorKey(color.hex, selectedColorSystem);
    
    let prefix: string;
    if (selectedColorSystem === '盼盼' || selectedColorSystem === '咪小窝') {
      // 숫자로만 구성된 색상 코드 시스템은 숫자 범위별로 그룹화
      if (/^\d+$/.test(displayKey)) {
        const num = parseInt(displayKey, 10);
        if (num <= 20) {
          prefix = '1-20';
        } else if (num <= 50) {
          prefix = '21-50';
        } else if (num <= 100) {
          prefix = '51-100';
        } else if (num <= 200) {
          prefix = '101-200';
        } else {
          prefix = '200+';
        }
      } else {
        prefix = '기타';
      }
    } else {
      // 알파벳 접두사가 있는 색상 코드 시스템은 알파벳 접두사별로 그룹화
      prefix = displayKey.match(/^[A-Z]+/)?.[0] || '기타';
    }
    
    if (!groups[prefix]) {
      groups[prefix] = [];
    }
    groups[prefix].push(color);
  });
  
  // 각 그룹의 색상을 코드 순서대로 정렬
  Object.keys(groups).forEach(prefix => {
    groups[prefix].sort((a, b) => {
      const displayKeyA = getDisplayColorKey(a.hex, selectedColorSystem);
      const displayKeyB = getDisplayColorKey(b.hex, selectedColorSystem);
      
      if (selectedColorSystem === '盼盼' || selectedColorSystem === '咪小窝') {
        // 숫자로만 구성된 색상 코드는 숫자 순서대로 정렬
        const numA = parseInt(displayKeyA, 10) || 0;
        const numB = parseInt(displayKeyB, 10) || 0;
        return numA - numB;
      } else {
        // 알파벳 접두사가 있는 색상 코드는 알파벳+숫자 기준으로 정렬
        const numA = parseInt(displayKeyA.replace(/^[A-Z]+/, ''), 10) || 0;
        const numB = parseInt(displayKeyB.replace(/^[A-Z]+/, ''), 10) || 0;
        return numA - numB;
      }
    });
  });
  
  return groups;
}

interface CustomPaletteEditorProps {
  allColors: PaletteColor[];
  currentSelections: PaletteSelections;
  onSelectionChange: (key: string, isSelected: boolean) => void;
  onSaveCustomPalette: () => void;
  onClose: () => void;
  onExportCustomPalette: () => void;
  onImportCustomPalette: () => void;
  selectedColorSystem: ColorSystem;
}

const CustomPaletteEditor: React.FC<CustomPaletteEditorProps> = ({
  allColors,
  currentSelections,
  onSelectionChange,
  onSaveCustomPalette,
  onClose,
  onExportCustomPalette,
  onImportCustomPalette,
  selectedColorSystem,
}) => {
  // 현재 펼쳐진 색상 그룹 추적
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCount, setSelectedCount] = useState(0);
  
  // 선택된 색상 수 계산
  useEffect(() => {
    const count = Object.values(currentSelections).filter(Boolean).length;
    setSelectedCount(count);
  }, [currentSelections]);
  
  // 검색어에 따라 색상 필터링
  const filteredColors = searchTerm 
    ? allColors.filter(color => {
        const originalKey = color.key.toLowerCase();
        const displayKey = getDisplayColorKey(color.hex, selectedColorSystem).toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        return originalKey.includes(searchLower) || displayKey.includes(searchLower);
      })
    : allColors;
  
  // 필터링된 색상을 그룹화
  const colorGroups = groupColorsByPrefix(filteredColors, selectedColorSystem);
  
  // 그룹 펼침 상태 전환
  const toggleGroup = (prefix: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [prefix]: !prev[prefix]
    }));
  };
  
  // 모든 색상의 선택 상태 전환
  const toggleAllColors = (selected: boolean) => {
    allColors.forEach(color => {
      onSelectionChange(color.hex.toUpperCase(), selected);
    });
  };
  
  // 한 그룹 내 모든 색상의 선택 상태 전환
  const toggleGroupColors = (prefix: string, selected: boolean) => {
    colorGroups[prefix].forEach(color => {
      onSelectionChange(color.hex.toUpperCase(), selected);
    });
  };
  
  return (
    <div className="flex flex-col h-full max-h-[calc(90vh-80px)]">
      {/* 상단 */}
      <div className="flex justify-between items-center border-b dark:border-gray-700 pb-3 mb-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
          </svg>
          팔레트 관리 <span className="ml-2 text-sm text-blue-500 dark:text-blue-400">({selectedCount}색)</span>
        </h2>
        <button 
          onClick={onClose}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      {/* 검색창 */}
      <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder="색상 코드 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 pl-9 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
        </div>
      </div>
      
      {/* 안내 문구 */}
      <div className="mb-4 text-xs text-gray-600 dark:text-gray-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md border border-blue-100 dark:border-blue-800/30">
        <p className="flex items-start">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1 text-blue-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          여기에서 사용할 펄러비즈 색상을 선택하세요. 기본 팔레트를 선택한 후 필요에 따라 특정 색상 코드를 직접 추가하거나 제거할 수 있습니다. 완료되면 아래의 &quot;저장 및 적용&quot; 버튼을 클릭하세요.
        </p>
      </div>
      
      {/* 빠른 작업 버튼 */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <button
          onClick={() => toggleAllColors(true)}
          className="px-3 py-1.5 text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-md hover:bg-green-200 dark:hover:bg-green-900/50"
        >
          전체 선택
        </button>
        <button
          onClick={() => toggleAllColors(false)}
          className="px-3 py-1.5 text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50"
        >
          전체 선택 해제
        </button>
        <button
          onClick={onImportCustomPalette}
          className="px-3 py-1.5 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-md hover:bg-blue-200 dark:hover:bg-blue-900/50 flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          설정 가져오기
        </button>
        <button
          onClick={onExportCustomPalette}
          className="px-3 py-1.5 text-xs bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 rounded-md hover:bg-purple-200 dark:hover:bg-purple-900/50 flex items-center gap-1"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          설정 내보내기
        </button>
      </div>
      
      {/* 색상 목록 */}
      <div className="flex-1 overflow-y-auto pr-1">
        {Object.keys(colorGroups).sort().map(prefix => (
          <div key={prefix} className="mb-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* 그룹 제목 */}
            <div 
              className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-750"
              onClick={() => toggleGroup(prefix)}
            >
              <div className="flex items-center">
                <span className="font-medium text-gray-800 dark:text-gray-200">{prefix} 계열</span>
                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  ({colorGroups[prefix].length}색)
                </span>
              </div>
              
              <div className="flex items-center">
                {/* 그룹 작업 버튼 */}
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroupColors(prefix, true);
                  }}
                  className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 mr-2"
                >
                  전체 선택
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroupColors(prefix, false);
                  }}
                  className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 mr-2"
                >
                  전체 선택 해제
                </button>
                
                {/* 펼치기/접기 아이콘 */}
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-4 w-4 text-gray-500 dark:text-gray-400 transform transition-transform ${expandedGroups[prefix] ? 'rotate-180' : ''}`}
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            
            {/* 그룹 내용 */}
            {expandedGroups[prefix] && (
              <div className="p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {colorGroups[prefix].map(color => (
                  <label 
                    key={color.key} 
                    className="flex items-center space-x-2 p-1.5 hover:bg-gray-50 dark:hover:bg-gray-750 rounded cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!!currentSelections[color.hex.toUpperCase()]}
                      onChange={(e) => onSelectionChange(color.hex.toUpperCase(), e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:ring-offset-gray-800"
                    />
                    <div
                      className="w-6 h-6 rounded-sm border border-gray-300 dark:border-gray-600 flex-shrink-0"
                      style={{ backgroundColor: color.hex }}
                    />
                    <span className="text-sm text-gray-800 dark:text-gray-200">{getDisplayColorKey(color.hex, selectedColorSystem)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* 하단 버튼 */}
      <div className="mt-4 pt-3 border-t dark:border-gray-700 flex justify-between">
        <button
          onClick={onClose}
          className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600"
        >
          취소
        </button>
        <button
          onClick={onSaveCustomPalette}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          저장 및 적용
        </button>
      </div>
    </div>
  );
};

export default CustomPaletteEditor;
