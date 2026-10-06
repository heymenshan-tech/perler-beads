import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getDisplayColorKey, getColorKeyByHex, ColorSystem } from './colorSystemUtils';

// 대비되는 글자색을 가져오는 유틸리티 함수 - page.tsx에서 복사
function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000'; // 기본값은 검은색
  // 간단한 밝기 확인 (Luma 공식 Y = 0.2126 R + 0.7152 G + 0.0722 B)
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF'; // 어두운 배경 -> 흰색 글자, 밝은 배경 -> 검은색 글자
}

// 보조 함수: HEX 색상을 RGB로 변환
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const formattedHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(formattedHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// 색상 코드를 정렬하는 함수 - page.tsx에서 복사
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
      return prefixA.localeCompare(prefixB); // 접두사 기준으로 먼저 정렬 (A, B, C...)
    }
    return numA - numB; // 이후 숫자 기준으로 정렬 (1, 2, 10...)
  }

  // 표준 형식과 일치하지 않는 코드의 경우 기본 정렬 (예: T1, ZG1)
  return a.localeCompare(b);
}

// CSV HEX 데이터 내보내기
export function exportCsvData({
  mappedPixelData,
  gridDimensions,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}): void {
  if (!mappedPixelData || !gridDimensions) {
    console.error("내보내기 실패: 매핑 데이터 또는 크기가 올바르지 않습니다.");
    alert("CSV를 내보낼 수 없습니다. 데이터가 생성되지 않았거나 올바르지 않습니다.");
    return;
  }

  const { N, M } = gridDimensions;
  
  // CSV 내용 생성, 각 행은 도안의 한 행을 나타냄
  const csvLines: string[] = [];
  
  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];

    for (let col = 0; col < N; col++) {
      const cellData = mappedPixelData[row][col];

      if (cellData && !cellData.isExternal) {
        // 내부 셀: HEX 색상값 기록
        rowData.push(cellData.color);
      } else {
        // 외부 셀 또는 빈칸: 특수 표시 사용
        rowData.push('TRANSPARENT');
      }
    }

    csvLines.push(rowData.join(','));
  }

  // CSV 내용 생성
  const csvContent = csvLines.join('\n');
  
  // CSV 파일 생성 및 다운로드
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${N}x${M}-${selectedColorSystem}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // URL 객체 해제
  URL.revokeObjectURL(url);
  
  console.log("CSV 데이터 내보내기 완료");
}

// CSV HEX 데이터 가져오기
export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;

        if (!text) {
          reject(new Error('파일 내용을 읽을 수 없습니다.'));
          return;
        }
        
        // CSV 내용 분석
        const lines = text.trim().split('\n');
        const M = lines.length; // 행 수
        
        if (M === 0) {
          reject(new Error('CSV 파일이 비어 있습니다.'));
          return;
        }
        
        // 첫 번째 행을 분석하여 열 수 확인
        const firstRowData = lines[0].split(',');
        const N = firstRowData.length; // 열 수
        
        if (N === 0) {
          reject(new Error('CSV 파일 형식이 올바르지 않습니다.'));
          return;
        }
        
        // 매핑 데이터 생성
        const mappedPixelData: MappedPixel[][] = [];
        
        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];
          
          // 각 행의 열 수가 올바른지 확인
          if (rowData.length !== N) {
            reject(
              new Error(
                `${row + 1}행의 열 수가 일치하지 않습니다. 예상: ${N}열, 실제: ${rowData.length}열`
              )
            );
            return;
          }
          
          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();
            
            if (cellValue === 'TRANSPARENT' || cellValue === '') {
              // 외부/투명 셀
              mappedRow.push({
                key: 'TRANSPARENT',
                color: '#FFFFFF',
                isExternal: true
              });
            } else {
              // HEX 색상 형식 확인
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;

              if (!hexPattern.test(cellValue)) {
                reject(
                  new Error(
                    `${row + 1}행 ${col + 1}열의 색상값이 올바르지 않습니다: ${cellValue}`
                  )
                );
                return;
              }
              
              // 내부 셀
              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false
              });
            }
          }
          
          mappedPixelData.push(mappedRow);
        }
        
        // 분석 결과 반환
        resolve({
          mappedPixelData,
          gridDimensions: { N, M }
        });
        
      } catch (error) {
        reject(new Error(`CSV 파일 분석에 실패했습니다: ${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('파일을 읽는 데 실패했습니다.'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}

// 이미지 다운로드 메인 함수
export async function downloadImage({
  mappedPixelData,
  gridDimensions,
  colorCounts,
  totalBeadCount,
  options,
  activeBeadPalette,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: { [key: string]: { count: number; color: string } } | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
}): Promise<void> {
  if (
    !mappedPixelData ||
    !gridDimensions ||
    gridDimensions.N === 0 ||
    gridDimensions.M === 0 ||
    activeBeadPalette.length === 0
  ) {
    console.error("다운로드 실패: 매핑 데이터 또는 크기가 올바르지 않습니다.");
    alert("도안을 다운로드할 수 없습니다. 데이터가 생성되지 않았거나 올바르지 않습니다.");
    return;
  }

  if (!colorCounts) {
    console.error("다운로드 실패: 색상 코드 통계 데이터가 올바르지 않습니다.");
    alert("도안을 다운로드할 수 없습니다. 색상 코드 통계 데이터가 생성되지 않았거나 올바르지 않습니다.");
    return;
  }
  
  // QR 코드 이미지 불러오기
  const qrCodeImage = new Image();
  qrCodeImage.src = '/website_qrcode.png'; // public 디렉터리의 이미지 사용
  
  // 실제 다운로드 처리 함수
  const processDownload = () => {
    const { N, M } = gridDimensions; // 이 시점에는 gridDimensions가 null이 아님
    const downloadCellSize = 30;
  
    // 다운로드 옵션에서 설정 가져오기
    const {
      showGrid,
      gridInterval,
      showCoordinates,
      gridLineColor,
      includeStats,
      showCellNumbers = true
    } = options;
  
    // 좌표 표시를 위한 여백 설정
    const axisLabelSize = showCoordinates
      ? Math.max(30, Math.floor(downloadCellSize))
      : 0;
    
    // 통계 영역의 기본 설정
    const statsPadding = 20;
    let statsHeight = 0;
    
    // 글꼴 크기 계산에 사용할 값
    const preCalcWidth = N * downloadCellSize + axisLabelSize;
    const preCalcAvailableWidth = preCalcWidth - (statsPadding * 2);
    
    // 글꼴 크기 계산 - 색상 통계 영역과 동일하게 유지
    const baseStatsFontSize = 13;
    const widthFactor = Math.max(0, preCalcAvailableWidth - 350) / 600;
    const statsFontSize = Math.floor(baseStatsFontSize + (widthFactor * 10));
    
    // 좌표 숫자가 완전히 표시되도록 추가 여백 계산
    const extraLeftMargin = showCoordinates
      ? Math.max(20, statsFontSize * 2)
      : 0;

    const extraRightMargin = showCoordinates
      ? Math.max(20, statsFontSize * 2)
      : 0;

    const extraTopMargin = showCoordinates
      ? Math.max(15, statsFontSize)
      : 0;

    const extraBottomMargin = showCoordinates
      ? Math.max(15, statsFontSize)
      : 0;
    
    // 그리드 크기 계산
    const gridWidth = N * downloadCellSize;
    const gridHeight = M * downloadCellSize;
    
    // 하단 출처 표시 영역 높이
    const sourceAreaHeight = 35;
  
    // 제목 표시줄 높이 계산
    const baseTitleBarHeight = 80;
    
    // 초기 다운로드 너비를 기준으로 배율 계산
    const initialWidth = gridWidth + axisLabelSize + extraLeftMargin;

    // 전체 너비를 기준으로 배율 계산
    const titleBarScale = Math.max(
      1.0,
      Math.min(2.0, initialWidth / 1000)
    );

    const titleBarHeight = Math.floor(
      baseTitleBarHeight * titleBarScale
    );
    
    // 제목 글자 크기
    const titleFontSize = Math.max(
      28,
      Math.floor(28 * titleBarScale)
    );
    
    // QR 코드 크기
    const qrSize = Math.floor(titleBarHeight * 0.85);
    
    // 통계 영역 크기 계산
    if (includeStats && colorCounts) {
      const colorKeys = Object.keys(colorCounts);
      
      const statsTopMargin = 24;
      
      // 사용 가능한 너비에 따라 열 수 계산
      const numColumns = Math.max(
        1,
        Math.min(4, Math.floor(preCalcAvailableWidth / 250))
      );
      
      const baseSwatchSize = 18;
      const swatchSize = Math.floor(
        baseSwatchSize + (widthFactor * 20)
      );
      
      // 필요한 행 수 계산
      const numRows = Math.ceil(
        colorKeys.length / numColumns
      );
      
      // 한 행의 높이
      const statsRowHeight = Math.max(
        swatchSize + 8,
        25
      );
      
      // 제목 및 하단 영역 높이
      const titleHeight = 40;
      const footerHeight = 40;
      
      // 통계 영역 전체 높이
      statsHeight =
        titleHeight +
        (numRows * statsRowHeight) +
        footerHeight +
        (statsPadding * 2) +
        statsTopMargin;
    }
  
    // 캔버스 전체 크기 계산
    const downloadWidth =
      gridWidth +
      (axisLabelSize * 2) +
      extraLeftMargin +
      extraRightMargin;

    let downloadHeight =
      titleBarHeight +
      gridHeight +
      (axisLabelSize * 2) +
      statsHeight +
      extraTopMargin +
      extraBottomMargin +
      sourceAreaHeight;
  
    let downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = downloadWidth;
    downloadCanvas.height = downloadHeight;

    const context = downloadCanvas.getContext('2d');

    if (!context) {
      console.error("다운로드 실패: 임시 Canvas Context를 생성할 수 없습니다.");
      alert("도안을 다운로드할 수 없습니다.");
      return;
    }
    
    let ctx = context;
    ctx.imageSmoothingEnabled = false;
  
    // 배경색 설정
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(
      0,
      0,
      downloadWidth,
      downloadHeight
    );
  
    // 현대적인 제목 표시줄
    // 1. 메인 배경
    ctx.fillStyle = '#1F2937';
    ctx.fillRect(
      0,
      0,
      downloadWidth,
      titleBarHeight
    );
    
    // 2. 왼쪽 브랜드 색상 영역
    const brandBlockWidth = titleBarHeight * 0.8;

    const brandGradient = ctx.createLinearGradient(
      0,
      0,
      brandBlockWidth,
      titleBarHeight
    );

    brandGradient.addColorStop(0, '#6366F1');
    brandGradient.addColorStop(1, '#8B5CF6');
    
    ctx.fillStyle = brandGradient;
    ctx.fillRect(
      0,
      0,
      brandBlockWidth,
      titleBarHeight
    );
    
    // 3. 현대적인 로고 그리기 - 핀또우를 추상화한 사각형 배열
    const logoSize = titleBarHeight * 0.4;
    const logoX = brandBlockWidth / 2;
    const logoY = titleBarHeight / 2;
    
    ctx.fillStyle = '#FFFFFF';

    const beadSize = logoSize / 4;
    const beadSpacing = beadSize * 1.2;
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const beadX =
          logoX -
          logoSize / 2 +
          col * beadSpacing;

        const beadY =
          logoY -
          logoSize / 2 +
          row * beadSpacing;
        
        // 둥근 사각형으로 핀또우 표현
        ctx.beginPath();
        ctx.roundRect(
          beadX,
          beadY,
          beadSize,
          beadSize,
          beadSize * 0.2
        );
        ctx.fill();
        
        // 가운데 작은 원 추가
        ctx.fillStyle = 'rgba(99, 102, 241, 0.3)';
        ctx.beginPath();
        ctx.arc(
          beadX + beadSize / 2,
          beadY + beadSize / 2,
          beadSize * 0.15,
          0,
          Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
      }
    }
    
    // 4. 메인 제목
    const mainTitleFontSize = Math.max(
      20,
      Math.floor(titleFontSize * 0.8)
    );

    const subTitleFontSize = Math.max(
      12,
      Math.floor(titleFontSize * 0.45)
    );
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font =
      `600 ${mainTitleFontSize}px system-ui, -apple-system, sans-serif`;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    const titleStartX =
      brandBlockWidth +
      titleBarHeight * 0.3;

    const mainTitleY =
      titleBarHeight * 0.4;
    
    ctx.fillText(
      'Qiao Yi',
      titleStartX,
      mainTitleY
    );
    
    // 5. 부제목
    ctx.fillStyle =
      'rgba(255, 255, 255, 0.8)';

    ctx.font =
      `400 ${subTitleFontSize}px system-ui, -apple-system, sans-serif`;

    const subTitleY =
      titleBarHeight * 0.65;
    
    ctx.fillText(
      '핀또우 도안 생성기',
      titleStartX,
      subTitleY
    );
    
    // 7. 구분선
    const separatorY =
      titleBarHeight - 1;

    ctx.strokeStyle =
      'rgba(255, 255, 255, 0.1)';

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, separatorY);
    ctx.lineTo(downloadWidth, separatorY);
    ctx.stroke();
    
    // 8. QR 코드 영역
    const qrX =
      downloadWidth -
      qrSize -
      titleBarHeight * 0.15;

    const qrY =
      (titleBarHeight - qrSize) / 2;
    
    // QR 코드 배경
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();

    ctx.roundRect(
      qrX,
      qrY,
      qrSize,
      qrSize,
      qrSize * 0.08
    );

    ctx.fill();
    
    // QR 코드 이미지 또는 대체 문구
    if (
      qrCodeImage.complete &&
      qrCodeImage.naturalWidth !== 0
    ) {
      ctx.save();
      ctx.beginPath();

      ctx.roundRect(
        qrX,
        qrY,
        qrSize,
        qrSize,
        qrSize * 0.08
      );

      ctx.clip();

      ctx.drawImage(
        qrCodeImage,
        qrX,
        qrY,
        qrSize,
        qrSize
      );

      ctx.restore();
    } else {
      ctx.fillStyle = '#6366F1';

      const qrPlaceholderFontSize =
        Math.max(
          10,
          Math.floor(14 * titleBarScale)
        );

      ctx.font =
        `500 ${qrPlaceholderFontSize}px system-ui, -apple-system, sans-serif`;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText(
        'QR 코드',
        qrX + qrSize / 2,
        qrY + qrSize / 2
      );
    }
  
    console.log(
      `Generating download grid image: ${downloadWidth}x${downloadHeight}`
    );

    const fontSize =
      Math.max(
        8,
        Math.floor(downloadCellSize * 0.4)
      );
    
    // 필요한 경우 좌표축 및 그리드 배경 그리기
    if (showCoordinates) {
      // 좌표축 배경
      ctx.fillStyle = '#F5F5F5';

      // 위쪽 가로축
      ctx.fillRect(
        extraLeftMargin + axisLabelSize,
        titleBarHeight + extraTopMargin,
        gridWidth,
        axisLabelSize
      );

      // 아래쪽 가로축
      ctx.fillRect(
        extraLeftMargin + axisLabelSize,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize +
          gridHeight,
        gridWidth,
        axisLabelSize
      );

      // 왼쪽 세로축
      ctx.fillRect(
        extraLeftMargin,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize,
        axisLabelSize,
        gridHeight
      );

      // 오른쪽 세로축
      ctx.fillRect(
        extraLeftMargin +
          axisLabelSize +
          gridWidth,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize,
        axisLabelSize,
        gridHeight
      );
      
      // 좌표 숫자
      ctx.fillStyle = '#333333';

      const axisFontSize = 14;
      ctx.font = `${axisFontSize}px sans-serif`;

      // X축 위쪽 숫자
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < N; i++) {
        if (
          (i + 1) % gridInterval === 0 ||
          i === 0 ||
          i === N - 1
        ) {
          const numX =
            extraLeftMargin +
            axisLabelSize +
            (i * downloadCellSize) +
            (downloadCellSize / 2);

          const numY =
            titleBarHeight +
            extraTopMargin +
            (axisLabelSize / 2);

          ctx.fillText(
            (i + 1).toString(),
            numX,
            numY
          );
        }
      }
      
      // X축 아래쪽 숫자
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < N; i++) {
        if (
          (i + 1) % gridInterval === 0 ||
          i === 0 ||
          i === N - 1
        ) {
          const numX =
            extraLeftMargin +
            axisLabelSize +
            (i * downloadCellSize) +
            (downloadCellSize / 2);

          const numY =
            titleBarHeight +
            extraTopMargin +
            axisLabelSize +
            gridHeight +
            (axisLabelSize / 2);

          ctx.fillText(
            (i + 1).toString(),
            numX,
            numY
          );
        }
      }
      
      // Y축 왼쪽 숫자
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let j = 0; j < M; j++) {
        if (
          (j + 1) % gridInterval === 0 ||
          j === 0 ||
          j === M - 1
        ) {
          const numX =
            extraLeftMargin +
            (axisLabelSize / 2);

          const numY =
            titleBarHeight +
            extraTopMargin +
            axisLabelSize +
            (j * downloadCellSize) +
            (downloadCellSize / 2);

          ctx.fillText(
            (j + 1).toString(),
            numX,
            numY
          );
        }
      }
      
      // Y축 오른쪽 숫자
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let j = 0; j < M; j++) {
        if (
          (j + 1) % gridInterval === 0 ||
          j === 0 ||
          j === M - 1
        ) {
          const numX =
            extraLeftMargin +
            axisLabelSize +
            gridWidth +
            (axisLabelSize / 2);

          const numY =
            titleBarHeight +
            extraTopMargin +
            axisLabelSize +
            (j * downloadCellSize) +
            (downloadCellSize / 2);

          ctx.fillText(
            (j + 1).toString(),
            numX,
            numY
          );
        }
      }
      
      // 좌표축 테두리
      ctx.strokeStyle = '#AAAAAA';
      ctx.lineWidth = 1;

      // 위쪽 가로축 아래 테두리
      ctx.beginPath();

      ctx.moveTo(
        extraLeftMargin + axisLabelSize,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize
      );

      ctx.lineTo(
        extraLeftMargin +
          axisLabelSize +
          gridWidth,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize
      );

      ctx.stroke();

      // 아래쪽 가로축 위 테두리
      ctx.beginPath();

      ctx.moveTo(
        extraLeftMargin + axisLabelSize,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize +
          gridHeight
      );

      ctx.lineTo(
        extraLeftMargin +
          axisLabelSize +
          gridWidth,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize +
          gridHeight
      );

      ctx.stroke();

      // 왼쪽 세로축 오른쪽 테두리
      ctx.beginPath();

      ctx.moveTo(
        extraLeftMargin + axisLabelSize,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize
      );

      ctx.lineTo(
        extraLeftMargin + axisLabelSize,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize +
          gridHeight
      );

      ctx.stroke();

      // 오른쪽 세로축 왼쪽 테두리
      ctx.beginPath();

      ctx.moveTo(
        extraLeftMargin +
          axisLabelSize +
          gridWidth,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize
      );

      ctx.lineTo(
        extraLeftMargin +
          axisLabelSize +
          gridWidth,
        titleBarHeight +
          extraTopMargin +
          axisLabelSize +
          gridHeight
      );

      ctx.stroke();
    }
    
    // 기본 텍스트 정렬 및 기준선 복원
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 셀 내용을 그릴 글꼴 설정
    ctx.font =
      `bold ${fontSize}px sans-serif`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 모든 셀 그리기
    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const cellData =
          mappedPixelData[j][i];

        // 추가 여백 및 제목 표시줄 높이를 고려한 위치 계산
        const drawX =
          extraLeftMargin +
          i * downloadCellSize +
          axisLabelSize;

        const drawY =
          titleBarHeight +
          extraTopMargin +
          j * downloadCellSize +
          axisLabelSize;

        // 외부 배경 여부에 따라 채우기 색상 결정
        if (
          cellData &&
          !cellData.isExternal
        ) {
          // 내부 셀
          const cellColor =
            cellData.color ||
            '#FFFFFF';

          ctx.fillStyle = cellColor;

          ctx.fillRect(
            drawX,
            drawY,
            downloadCellSize,
            downloadCellSize
          );

          if (showCellNumbers) {
            const cellKey =
              getDisplayColorKey(
                cellData.color ||
                  '#FFFFFF',
                selectedColorSystem
              );

            ctx.fillStyle =
              getContrastColor(
                cellColor
              );

            ctx.fillText(
              cellKey,
              drawX +
                downloadCellSize / 2,
              drawY +
                downloadCellSize / 2
            );
          }
        } else {
          // 외부 배경
          ctx.fillStyle = '#FFFFFF';

          ctx.fillRect(
            drawX,
            drawY,
            downloadCellSize,
            downloadCellSize
          );
        }

        // 셀 테두리
        ctx.strokeStyle = '#DDDDDD';
        ctx.lineWidth = 0.5;

        ctx.strokeRect(
          drawX + 0.5,
          drawY + 0.5,
          downloadCellSize,
          downloadCellSize
        );
      }
    }

    // 구분 그리드 선
    if (showGrid) {
      ctx.strokeStyle = gridLineColor;
      ctx.lineWidth = 1.5;
      
      // 세로 구분선
      for (
        let i = gridInterval;
        i < N;
        i += gridInterval
      ) {
        const lineX =
          extraLeftMargin +
          i * downloadCellSize +
          axisLabelSize;

        ctx.beginPath();

        ctx.moveTo(
          lineX,
          titleBarHeight +
            extraTopMargin +
            axisLabelSize
        );

        ctx.lineTo(
          lineX,
          titleBarHeight +
            extraTopMargin +
            axisLabelSize +
            M * downloadCellSize
        );

        ctx.stroke();
      }
      
      // 가로 구분선
      for (
        let j = gridInterval;
        j < M;
        j += gridInterval
      ) {
        const lineY =
          titleBarHeight +
          extraTopMargin +
          j * downloadCellSize +
          axisLabelSize;

        ctx.beginPath();

        ctx.moveTo(
          extraLeftMargin +
            axisLabelSize,
          lineY
        );

        ctx.lineTo(
          extraLeftMargin +
            axisLabelSize +
            N * downloadCellSize,
          lineY
        );

        ctx.stroke();
      }
    }

    // 전체 그리드의 메인 테두리
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;

    ctx.strokeRect(
      extraLeftMargin +
        axisLabelSize +
        0.5,
      titleBarHeight +
        extraTopMargin +
        axisLabelSize +
        0.5,
      N * downloadCellSize,
      M * downloadCellSize
    );

    // 보조 워터마크
    const secondaryWatermarkFontSize =
      Math.max(
        10,
        Math.floor(
          downloadCellSize * 0.5
        )
      );

    const secondaryText = '@Qiao Yi';
    
    ctx.font =
      `500 ${secondaryWatermarkFontSize}px system-ui, -apple-system, sans-serif`;

    const secondaryMetrics =
      ctx.measureText(
        secondaryText
      );

    const secondaryWidth =
      secondaryMetrics.width;

    const secondaryHeight =
      secondaryWatermarkFontSize;
    
    const secondaryWatermarkX =
      extraLeftMargin +
      axisLabelSize +
      15;

    const secondaryWatermarkY =
      titleBarHeight +
      extraTopMargin +
      axisLabelSize +
      secondaryHeight +
      15;
    
    // 보조 워터마크 배경
    const secondaryBgPadding = 4;

    ctx.fillStyle =
      'rgba(255, 255, 255, 0.75)';

    ctx.beginPath();

    ctx.roundRect(
      secondaryWatermarkX -
        secondaryBgPadding,
      secondaryWatermarkY -
        secondaryHeight -
        secondaryBgPadding,
      secondaryWidth +
        secondaryBgPadding * 2,
      secondaryHeight +
        secondaryBgPadding * 2,
      3
    );

    ctx.fill();
    
    // 보조 워터마크 텍스트
    ctx.fillStyle = '#6B7280';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    ctx.fillText(
      secondaryText,
      secondaryWatermarkX,
      secondaryWatermarkY
    );

    // 통계 정보 그리기
    if (includeStats && colorCounts) {
      const colorKeys =
        Object.keys(colorCounts)
          .sort(sortColorKeys);
      
      const statsTopMargin = 24;

      const statsY =
        titleBarHeight +
        extraTopMargin +
        M * downloadCellSize +
        (axisLabelSize * 2) +
        statsPadding +
        statsTopMargin;
      
      // 통계 영역에서 사용할 수 있는 너비
      const availableStatsWidth =
        downloadWidth -
        (statsPadding * 2);
      
      // 사용 가능한 너비에 따라 열 수 계산
      const renderNumColumns =
        Math.max(
          1,
          Math.min(
            4,
            Math.floor(
              availableStatsWidth /
                250
            )
          )
        );
      
      const baseSwatchSize = 18;

      const swatchSize =
        Math.floor(
          baseSwatchSize +
            (widthFactor * 20)
        );
      
      // 각 항목의 너비
      const itemWidth =
        Math.floor(
          availableStatsWidth /
            renderNumColumns
        );
      
      ctx.fillStyle = '#333333';

      ctx.font =
        `bold ${Math.max(
          16,
          statsFontSize
        )}px sans-serif`;

      ctx.textAlign = 'left';
      
      // 통계 영역 구분선
      ctx.strokeStyle = '#DDDDDD';
      ctx.beginPath();

      ctx.moveTo(
        statsPadding,
        statsY + 20
      );

      ctx.lineTo(
        downloadWidth -
          statsPadding,
        statsY + 20
      );

      ctx.stroke();
      
      const titleHeight = 30;

      const statsRowHeight =
        Math.max(
          swatchSize + 8,
          25
        );
      
      ctx.font =
        `${statsFontSize}px sans-serif`;
      
      // 각 색상의 통계 정보
      colorKeys.forEach(
        (key, index) => {
          const rowIndex =
            Math.floor(
              index /
                renderNumColumns
            );

          const colIndex =
            index %
            renderNumColumns;
          
          const itemX =
            statsPadding +
            (colIndex *
              itemWidth);
          
          const rowY =
            statsY +
            titleHeight +
            (rowIndex *
              statsRowHeight) +
            (swatchSize / 2);
          
          const cellData =
            colorCounts[key];
          
          // 색상 견본
          ctx.fillStyle =
            cellData.color;

          ctx.strokeStyle =
            '#CCCCCC';

          ctx.fillRect(
            itemX,
            rowY -
              (swatchSize / 2),
            swatchSize,
            swatchSize
          );

          ctx.strokeRect(
            itemX + 0.5,
            rowY -
              (swatchSize / 2) +
              0.5,
            swatchSize - 1,
            swatchSize - 1
          );
          
          // 색상 코드
          ctx.fillStyle = '#333333';
          ctx.textAlign = 'left';

          ctx.fillText(
            getColorKeyByHex(
              key,
              selectedColorSystem
            ),
            itemX +
              swatchSize +
              5,
            rowY
          );
          
          // 수량
          const countText =
            `${cellData.count}개`;

          ctx.textAlign = 'right';
          
          if (
            renderNumColumns === 1
          ) {
            ctx.fillText(
              countText,
              downloadWidth -
                statsPadding,
              rowY
            );
          } else {
            ctx.fillText(
              countText,
              itemX +
                itemWidth -
                10,
              rowY
            );
          }
        }
      );
      
      // 실제 필요한 행 수
      const numRows =
        Math.ceil(
          colorKeys.length /
            renderNumColumns
        );
      
      // 총 수량
      const totalY =
        statsY +
        titleHeight +
        (numRows *
          statsRowHeight) +
        10;

      ctx.font =
        `bold ${statsFontSize}px sans-serif`;

      ctx.textAlign = 'right';

      ctx.fillText(
        `총계: ${totalBeadCount}개`,
        downloadWidth -
          statsPadding,
        totalY
      );
      
      // 통계 영역 워터마크
      const statsWatermarkFontSize =
        Math.max(
          10,
          Math.floor(
            statsFontSize * 0.7
          )
        );

      const statsWatermarkText =
        '도안 생성: Qiao Yi';
      
      ctx.font =
        `500 ${statsWatermarkFontSize}px system-ui, -apple-system, sans-serif`;

      const statsTextMetrics =
        ctx.measureText(
          statsWatermarkText
        );

      const statsTextWidth =
        statsTextMetrics.width;

      const statsTextHeight =
        statsWatermarkFontSize;
      
      const statsWatermarkX =
        statsPadding;

      const statsWatermarkY =
        totalY + 20;
      
      // 통계 영역 워터마크 배경
      const statsBgPadding = 5;

      ctx.fillStyle =
        'rgba(248, 250, 252, 0.9)';

      ctx.beginPath();

      ctx.roundRect(
        statsWatermarkX -
          statsBgPadding,
        statsWatermarkY -
          statsTextHeight -
          statsBgPadding,
        statsTextWidth +
          statsBgPadding * 2,
        statsTextHeight +
          statsBgPadding * 2,
        3
      );

      ctx.fill();
      
      // 통계 영역 워터마크 테두리
      ctx.strokeStyle =
        'rgba(0, 0, 0, 0.08)';

      ctx.lineWidth = 1;
      ctx.stroke();
      
      // 통계 영역 워터마크 텍스트
      ctx.fillStyle = '#64748B';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';

      ctx.fillText(
        statsWatermarkText,
        statsWatermarkX,
        statsWatermarkY
      );
      
      // 통계 영역 높이 업데이트
      const footerHeight = 30;

      statsHeight =
        titleHeight +
        (numRows *
          statsRowHeight) +
        footerHeight +
        (statsPadding * 2) +
        statsTopMargin;
    }

    // 캔버스 높이 다시 계산
    if (includeStats && colorCounts) {
      const newDownloadHeight =
        titleBarHeight +
        extraTopMargin +
        M * downloadCellSize +
        (axisLabelSize * 2) +
        statsHeight +
        extraBottomMargin +
        sourceAreaHeight;
      
      if (
        downloadHeight !==
        newDownloadHeight
      ) {
        const newCanvas =
          document.createElement(
            'canvas'
          );

        newCanvas.width =
          downloadWidth;

        newCanvas.height =
          newDownloadHeight;

        const newContext =
          newCanvas.getContext('2d');
        
        if (newContext) {
          // 기존 캔버스 내용을 새 캔버스로 복사
          newContext.drawImage(
            downloadCanvas,
            0,
            0
          );
          
          downloadCanvas =
            newCanvas;

          ctx = newContext;

          ctx.imageSmoothingEnabled =
            false;
          
          downloadHeight =
            newDownloadHeight;
        }
      }
    }

    try {
      const dataURL =
        downloadCanvas.toDataURL(
          'image/png'
        );

      const link =
        document.createElement('a');

      link.download =
        showCellNumbers
          ? `bead-grid-${N}x${M}-keys-palette_${selectedColorSystem}.png`
          : `bead-grid-${N}x${M}-pixel-palette_${selectedColorSystem}.png`;

      link.href = dataURL;

      document.body.appendChild(
        link
      );

      link.click();

      document.body.removeChild(
        link
      );

      console.log(
        "도안 이미지 다운로드를 시작했습니다."
      );
      
      // CSV 내보내기가 활성화된 경우 CSV도 함께 내보내기
      if (options.exportCsv) {
        exportCsvData({
          mappedPixelData,
          gridDimensions,
          selectedColorSystem
        });
      }
    } catch (e) {
      console.error(
        "도안 다운로드 실패:",
        e
      );

      alert(
        "도안 다운로드 파일을 생성할 수 없습니다."
      );
    }
  };
  
  // QR 코드 이미지 로딩 후 처리
  if (qrCodeImage.complete) {
    processDownload();
  } else {
    qrCodeImage.onload =
      processDownload;

    qrCodeImage.onerror = () => {
      console.warn(
        "QR 코드 이미지를 불러오지 못했습니다. 대체 문구를 사용합니다."
      );

      processDownload();
    };
  }
}
