import React from 'react';

interface SettingsPanelProps {
  guidanceMode: 'nearest' | 'largest' | 'edge-first';
  onGuidanceModeChange: (mode: 'nearest' | 'largest' | 'edge-first') => void;
  gridSectionInterval: number;
  onGridSectionIntervalChange: (interval: number) => void;
  showSectionLines: boolean;
  onShowSectionLinesChange: (show: boolean) => void;
  sectionLineColor: string;
  onSectionLineColorChange: (color: string) => void;
  enableCelebration: boolean;
  onEnableCelebrationChange: (enable: boolean) => void;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  guidanceMode,
  onGuidanceModeChange,
  gridSectionInterval,
  onGridSectionIntervalChange,
  showSectionLines,
  onShowSectionLinesChange,
  sectionLineColor,
  onSectionLineColorChange,
  enableCelebration,
  onEnableCelebrationChange,
  onClose
}) => {
  // 구분선 색상 옵션
  const sectionLineColors = [
    { color: '#007acc', name: '파란색' },
    { color: '#28a745', name: '초록색' },
    { color: '#dc3545', name: '빨간색' },
    { color: '#6f42c1', name: '보라색' },
    { color: '#fd7e14', name: '주황색' },
    { color: '#6c757d', name: '회색' }
  ];
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-end">
      <div className="w-80 max-w-[90vw] h-full bg-white shadow-lg flex flex-col">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-800">설정</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 설정 내용 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 안내 설정 */}
          <div>
            <h3 className="text-base font-medium text-gray-800 mb-3">스마트 안내</h3>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="guidanceMode"
                  value="nearest"
                  checked={guidanceMode === 'nearest'}
                  onChange={(e) => onGuidanceModeChange(e.target.value as 'nearest')}
                  className="mr-3 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-700">가까운 칸 우선</div>
                  <div className="text-xs text-gray-500">가장 가까운 칸을 우선 추천합니다</div>
                </div>
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  name="guidanceMode"
                  value="largest"
                  checked={guidanceMode === 'largest'}
                  onChange={(e) => onGuidanceModeChange(e.target.value as 'largest')}
                  className="mr-3 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-700">큰 영역 우선</div>
                  <div className="text-xs text-gray-500">큰 색상 영역을 우선 추천합니다</div>
                </div>
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  name="guidanceMode"
                  value="edge-first"
                  checked={guidanceMode === 'edge-first'}
                  onChange={(e) => onGuidanceModeChange(e.target.value as 'edge-first')}
                  className="mr-3 text-blue-600"
                />
                <div>
                  <div className="text-sm font-medium text-gray-700">가장자리 우선</div>
                  <div className="text-xs text-gray-500">가장자리를 먼저 완성한 후 내부를 채웁니다</div>
                </div>
              </label>
            </div>
          </div>

          {/* 표시 설정 */}
          <div>
            <h3 className="text-base font-medium text-gray-800 mb-3">표시 설정</h3>
            <div className="space-y-4">
              {/* 구분선 표시 설정 */}
              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">구분선 표시</div>
                  <div className="text-xs text-gray-500">도안을 여러 구역으로 나누어 위치를 쉽게 찾을 수 있습니다</div>
                </div>
                <input
                  type="checkbox"
                  checked={showSectionLines}
                  onChange={(e) => onShowSectionLinesChange(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded"
                />
              </label>

              {/* 구분선을 활성화한 경우에만 아래 옵션 표시 */}
              {showSectionLines && (
                <>
                  {/* 구분선 간격 */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      구분 간격
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="range"
                        min="5"
                        max="20"
                        value={gridSectionInterval}
                        onChange={(e) => onGridSectionIntervalChange(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <span className="text-sm font-medium text-gray-700 min-w-[3rem]">
                        {gridSectionInterval}칸
                      </span>
                    </div>
                  </div>

                  {/* 구분선 색상 */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      구분선 색상
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {sectionLineColors.map((colorOption) => (
                        <button
                          key={colorOption.color}
                          onClick={() => onSectionLineColorChange(colorOption.color)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            sectionLineColor === colorOption.color
                              ? 'border-gray-800 scale-110'
                              : 'border-gray-300 hover:border-gray-500'
                          }`}
                          style={{ backgroundColor: colorOption.color }}
                          title={colorOption.name}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* 축하 애니메이션 설정 */}
              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">축하 애니메이션</div>
                  <div className="text-xs text-gray-500">색상을 완성하면 축하 효과를 표시합니다</div>
                </div>
                <input
                  type="checkbox"
                  checked={enableCelebration}
                  onChange={(e) => onEnableCelebrationChange(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded"
                />
              </label>
            </div>
          </div>

          {/* 진행 상황 초기화 */}
          <div>
            <h3 className="text-base font-medium text-gray-800 mb-3">데이터 관리</h3>
            <div className="space-y-3">
              <button className="w-full py-2 px-4 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm">
                진행 데이터 내보내기
              </button>
              
              <button className="w-full py-2 px-4 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm">
                모든 진행 상황 초기화
              </button>
            </div>
          </div>

          {/* 정보 */}
          <div>
            <h3 className="text-base font-medium text-gray-800 mb-3">정보</h3>
            <div className="text-sm text-gray-600 space-y-2">
              <p>집중 펄러비즈 모드 v1.0</p>
              <p>모바일에 최적화된 펄러비즈 작업 도우미</p>
              <div className="pt-2 text-xs text-gray-500">
                <p>💡 팁: 칸을 길게 누르면 빠르게 표시할 수 있습니다</p>
                <p>💡 팁: 두 손가락으로 확대하여 세부 내용을 확인할 수 있습니다</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
