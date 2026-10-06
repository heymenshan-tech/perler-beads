import React, { useState } from 'react';
import { GridDownloadOptions } from '../types/downloadTypes';

// 선택 가능한 그리드 선 색상 정의
const gridLineColorOptions = [
  { name: '진회색', value: '#555555' },
  { name: '빨간색', value: '#FF0000' },
  { name: '파란색', value: '#0000FF' },
  { name: '초록색', value: '#008000' },
  { name: '보라색', value: '#800080' },
  { name: '주황색', value: '#FFA500' },
];

interface DownloadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: GridDownloadOptions;
  onOptionsChange: (options: GridDownloadOptions) => void;
  onDownload: (opts?: GridDownloadOptions) => void;
}

const DownloadSettingsModal: React.FC<DownloadSettingsModalProps> = ({
  isOpen,
  onClose,
  options,
  onOptionsChange,
  onDownload
}) => {
  // isOpen 값과 관계없이 useState를 최상위에서 호출
  const [tempOptions, setTempOptions] = useState<GridDownloadOptions>({...options});
  
  // 열려 있지 않은 경우 null 반환
  if (!isOpen) return null;
  
  // 옵션 변경 처리 - any 대신 더 구체적인 타입 사용
  const handleOptionChange = (key: keyof GridDownloadOptions, value: string | number | boolean) => {
    setTempOptions((prev: GridDownloadOptions) => ({
      ...prev,
      [key]: value
    }));
  };
  
  // 옵션을 저장하고 새 설정으로 즉시 다운로드
  const handleSave = () => {
    // 부모 컴포넌트의 설정 상태 업데이트
    onOptionsChange(tempOptions);
    
    // 상태 업데이트에 의존하지 않고 현재 임시 설정으로 바로 다운로드
    onDownload(tempOptions); 
    
    onClose();
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden w-full max-w-md">
        <div className="p-5">
          <div className="flex justify-between items-center border-b dark:border-gray-700 pb-3 mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">도안 다운로드 설정</h3>
            <button 
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
          
          <div className="space-y-4">
            {/* 그리드 선 표시 옵션 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                그리드 선 표시
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={tempOptions.showGrid}
                  onChange={(e) => handleOptionChange('showGrid', e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            {/* 그리드 선 설정 (그리드 선을 표시할 때만) */}
            {tempOptions.showGrid && (
              <div className="space-y-4 pl-2 border-l-2 border-gray-200 dark:border-gray-700 ml-1 pt-2 pb-1">
                {/* 그리드 선 간격 옵션 */}
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    그리드 선 간격 (N칸마다 선 표시)
                  </label>
                  <div className="flex items-center justify-between space-x-3">
                    <input 
                      type="range" 
                      min="5" 
                      max="20" 
                      step="1"
                      value={tempOptions.gridInterval}
                      onChange={(e) => handleOptionChange('gridInterval', parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                    />
                    <span className="flex items-center justify-center min-w-[40px] text-sm font-medium text-gray-900 dark:text-gray-100">
                      {tempOptions.gridInterval}
                    </span>
                  </div>
                </div>

                {/* 그리드 선 색상 선택 */}
                <div className="flex flex-col space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    그리드 선 색상
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {gridLineColorOptions.map(colorOpt => (
                      <button
                        key={colorOpt.value}
                        type="button"
                        onClick={() => handleOptionChange('gridLineColor', colorOpt.value)}
                        className={`w-8 h-8 rounded-full border-2 transition-all duration-150 flex items-center justify-center 
                                    ${tempOptions.gridLineColor === colorOpt.value 
                                      ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800' 
                                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}`}
                        title={colorOpt.name}
                      >
                        <span 
                          className="block w-6 h-6 rounded-full"
                          style={{ backgroundColor: colorOpt.value }}
                        ></span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* 좌표 표시 옵션 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                좌표 숫자 표시
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={tempOptions.showCoordinates}
                  onChange={(e) => handleOptionChange('showCoordinates', e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* 칸 내부 색상 코드 숨기기 옵션 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                칸 내부 색상 코드 숨기기
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={!tempOptions.showCellNumbers}
                  onChange={(e) => handleOptionChange('showCellNumbers', !e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
            
            {/* 추가: 색상 코드 통계 포함 옵션 */}
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                색상 코드 통계 포함
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={tempOptions.includeStats}
                  onChange={(e) => handleOptionChange('includeStats', e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* 추가: CSV HEX 데이터 내보내기 옵션 */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                  원본 데이터도 함께 내보내기
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  HEX 색상값이 포함된 CSV 파일을 내보냅니다. 다시 가져올 때 사용할 수 있습니다
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer"
                  checked={tempOptions.exportCsv}
                  onChange={(e) => handleOptionChange('exportCsv', e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
          
          <div className="flex justify-end mt-6 space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              도안 다운로드
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DownloadSettingsModal;
export { gridLineColorOptions };
