import React, { useState, useRef, useCallback } from 'react';
import { MappedPixel } from '../utils/pixelation';

interface CompletionCardProps {
  isVisible: boolean;
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  totalElapsedTime: number;
  onClose: () => void;
}

const CompletionCard: React.FC<CompletionCardProps> = ({
  isVisible,
  mappedPixelData,
  gridDimensions,
  totalElapsedTime,
  onClose
}) => {
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  // 총 비즈 수 계산 (투명 영역 제외)
  const totalBeads = React.useMemo(() => {
    if (!mappedPixelData) return 0;
    
    let count = 0;
    for (let row = 0; row < gridDimensions.M; row++) {
      for (let col = 0; col < gridDimensions.N; col++) {
        const pixel = mappedPixelData[row][col];
        // 투명 색상 및 빈 영역 제외
        if (pixel.color && 
            pixel.color !== 'transparent' && 
            pixel.color !== 'rgba(0,0,0,0)' &&
            !pixel.color.includes('rgba(0, 0, 0, 0)')) {
          count++;
        }
      }
    }
    return count;
  }, [mappedPixelData, gridDimensions]);

  // 시간 형식 변환
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}시간 ${minutes}분`;
    } else {
      return `${minutes}분 ${secs}초`;
    }
  };

  // 원본 도안 썸네일 생성
  const generateThumbnail = useCallback(() => {
    if (!mappedPixelData) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 실제 비율에 따라 썸네일 크기를 계산하여 가로세로 비율 유지
    const aspectRatio = gridDimensions.N / gridDimensions.M;
    const maxThumbnailSize = 200;
    
    let thumbnailWidth, thumbnailHeight;
    if (aspectRatio > 1) {
      // 가로형 이미지
      thumbnailWidth = maxThumbnailSize;
      thumbnailHeight = maxThumbnailSize / aspectRatio;
    } else {
      // 세로형 또는 정사각형 이미지
      thumbnailHeight = maxThumbnailSize;
      thumbnailWidth = maxThumbnailSize * aspectRatio;
    }

    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;

    const cellWidth = thumbnailWidth / gridDimensions.N;
    const cellHeight = thumbnailHeight / gridDimensions.M;

    // 썸네일 그리기
    for (let row = 0; row < gridDimensions.M; row++) {
      for (let col = 0; col < gridDimensions.N; col++) {
        const pixel = mappedPixelData[row][col];
        ctx.fillStyle = pixel.color;
        ctx.fillRect(
          col * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }

    return canvas.toDataURL();
  }, [mappedPixelData, gridDimensions]);

  // 카메라 켜기
  const startCamera = async () => {
    try {
      setIsCapturing(true);
      setCameraError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // 후면 카메라
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('카메라에 접근할 수 없습니다:', error);
      setIsCapturing(false);
      setCameraError(true);
    }
  };

  // 사진 촬영
  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const photoDataURL = canvas.toDataURL('image/jpeg', 0.8);
    setUserPhoto(photoDataURL);

    // 카메라 중지
    const stream = video.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setIsCapturing(false);
  };

  // 사진 촬영을 건너뛰고 펄러비즈 원본 도안 사용
  const skipPhoto = () => {
    const thumbnailDataURL = generateThumbnail();
    if (thumbnailDataURL) {
      setUserPhoto(thumbnailDataURL);
    }
  };

  // 완성 카드 생성
  const generateCompletionCard = useCallback(() => {
    if (!userPhoto || !cardCanvasRef.current) return null;

    const canvas = cardCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 펄러비즈 원본 도안을 사용하는지 확인
    const thumbnailDataURL = generateThumbnail();
    const isUsingPixelArt = userPhoto === thumbnailDataURL;

    // 캔버스 크기 설정 (3:4 비율, 공유에 적합)
    const cardWidth = 720;
    const cardHeight = 960;
    canvas.width = cardWidth;
    canvas.height = cardHeight;

    return new Promise<string>((resolve) => {
      // 사용자 사진/펄러비즈 도안 불러오기
      const userImg = new Image();
      userImg.onload = () => {
        if (isUsingPixelArt) {
          // ===== 펄러비즈 원본 도안 모드: 원본 도안을 중심으로 표시 =====
          
          // 어두운 그라데이션 배경
          const gradient = ctx.createLinearGradient(0, 0, 0, cardHeight);
          gradient.addColorStop(0, '#1a1a2e');
          gradient.addColorStop(0.3, '#16213e');
          gradient.addColorStop(0.7, '#0f3460');
          gradient.addColorStop(1, '#533483');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, cardWidth, cardHeight);

          // 원본 가로세로 비율을 유지하여 펄러비즈 도안 크기 계산
          const imgAspectRatio = userImg.naturalWidth / userImg.naturalHeight;
          const maxWidth = cardWidth * 0.9;
          const maxHeight = cardHeight * 0.6;
          
          let imageWidth, imageHeight;
          if (maxWidth / maxHeight > imgAspectRatio) {
            // 높이를 기준으로 계산
            imageHeight = maxHeight;
            imageWidth = imageHeight * imgAspectRatio;
          } else {
            // 너비를 기준으로 계산
            imageWidth = maxWidth;
            imageHeight = imageWidth / imgAspectRatio;
          }
          
          const imageX = (cardWidth - imageWidth) / 2;
          const imageY = (cardHeight - imageHeight) / 2 - 80; // 조금 더 위로 이동

          // 메인 이미지의 장식 배경 및 그림자 그리기
          ctx.save();
          // 외곽 광원 효과
          const glowGradient = ctx.createRadialGradient(
            imageX + imageWidth/2, imageY + imageHeight/2, Math.min(imageWidth, imageHeight)/2,
            imageX + imageWidth/2, imageY + imageHeight/2, Math.min(imageWidth, imageHeight)/2 + 30
          );
          glowGradient.addColorStop(0, 'rgba(255,255,255,0.1)');
          glowGradient.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = glowGradient;
          ctx.fillRect(imageX - 30, imageY - 30, imageWidth + 60, imageHeight + 60);
          
          // 흰색 테두리 배경
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 25;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 15;
          const borderWidth = 12;
          ctx.fillRect(imageX - borderWidth, imageY - borderWidth, 
                      imageWidth + borderWidth * 2, imageHeight + borderWidth * 2);
          ctx.restore();

          // 펄러비즈 원본 도안 그리기
          ctx.drawImage(userImg, imageX, imageY, imageWidth, imageHeight);

          // 상단 영역: 간단한 완성 표시
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 8;
          ctx.fillText('🎉 작품 완성 🎉', cardWidth / 2, 80);
          ctx.shadowBlur = 0;

          // 하단 정보 영역: 텍스트 직접 표시
          const infoY = imageY + imageHeight + 40;
          
          // 정보 텍스트 - 한 줄로 표시
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 8;
          ctx.fillText(`⏱️ ${formatTime(totalElapsedTime)} | 🔗 비즈 ${totalBeads}개 완성`, cardWidth / 2, infoY + 40);

          // 하단 브랜드 정보
          ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText('펄러비즈 도안 생성기', cardWidth / 2, cardHeight - 50);
          ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillText('perler-beads.heymenshan.workers.dev', cardWidth / 2, cardHeight - 25);

          resolve(canvas.toDataURL('image/jpeg', 0.95));
          
        } else {
          // ===== 사용자 사진 모드: 사진을 중심으로 표시 =====
          
          // 따뜻한 그라데이션 배경
          const gradient = ctx.createLinearGradient(0, 0, 0, cardHeight);
          gradient.addColorStop(0, '#ff9a9e');
          gradient.addColorStop(0.3, '#fecfef');
          gradient.addColorStop(0.7, '#fecfef');
          gradient.addColorStop(1, '#ff9a9e');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, cardWidth, cardHeight);

          // 원본 가로세로 비율을 유지하여 사진 크기 계산
          const photoAspectRatio = userImg.naturalWidth / userImg.naturalHeight;
          const maxPhotoWidth = cardWidth * 0.85;
          const maxPhotoHeight = cardHeight * 0.6;
          
          let photoWidth, photoHeight;
          if (maxPhotoWidth / maxPhotoHeight > photoAspectRatio) {
            // 높이를 기준으로 계산
            photoHeight = maxPhotoHeight;
            photoWidth = photoHeight * photoAspectRatio;
          } else {
            // 너비를 기준으로 계산
            photoWidth = maxPhotoWidth;
            photoHeight = photoWidth / photoAspectRatio;
          }
          
          const photoX = (cardWidth - photoWidth) / 2;
          const photoY = (cardHeight - photoHeight) / 2 - 80;

          // 사진 장식 배경 및 그림자 그리기
          ctx.save();
          // 외곽 장식 테두리
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 8;
          ctx.strokeRect(photoX - 15, photoY - 15, photoWidth + 30, photoHeight + 30);
          
          // 내부 흰색 테두리 배경
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.2)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;
          ctx.fillRect(photoX - 12, photoY - 12, photoWidth + 24, photoHeight + 24);
          ctx.restore();

          // 사진 그리기 (가로세로 비율 유지)
          ctx.drawImage(userImg, photoX, photoY, photoWidth, photoHeight);

          // 하단 정보 영역: 텍스트 직접 표시
          const infoCardY = photoY + photoHeight + 30;

          // 정보 텍스트 - 한 줄로 표시
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 8;
          ctx.fillText(`⏱️ 총 소요 시간 ${formatTime(totalElapsedTime)} | 🔗 총 ${totalBeads}개 비즈 완성`, cardWidth / 2, infoCardY + 35);

          // 작은 펄러비즈 원본 도안을 장식으로 추가
          if (thumbnailDataURL) {
            const thumbnailImg = new Image();
            thumbnailImg.onload = () => {
              // 작은 썸네일 크기 계산 (비율 유지)
              const maxThumbSize = 60;
              const thumbAspectRatio = thumbnailImg.naturalWidth / thumbnailImg.naturalHeight;
              
              let thumbWidth, thumbHeight;
              if (thumbAspectRatio > 1) {
                // 가로형 이미지
                thumbWidth = maxThumbSize;
                thumbHeight = maxThumbSize / thumbAspectRatio;
              } else {
                // 세로형 또는 정사각형 이미지
                thumbHeight = maxThumbSize;
                thumbWidth = maxThumbSize * thumbAspectRatio;
              }
              
              const thumbX = cardWidth / 2 - thumbWidth / 2;
              const thumbY = infoCardY + 80;
              
              // 작은 썸네일 배경 그리기
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = 'rgba(0,0,0,0.3)';
              ctx.shadowBlur = 8;
              ctx.fillRect(thumbX - 3, thumbY - 3, thumbWidth + 6, thumbHeight + 6);
              ctx.shadowBlur = 0;
               
              // 작은 썸네일 그리기 (가로세로 비율 유지)
              ctx.drawImage(thumbnailImg, thumbX, thumbY, thumbWidth, thumbHeight);
               
              // 썸네일 테두리
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3;
              ctx.strokeRect(thumbX - 3, thumbY - 3, thumbWidth + 6, thumbHeight + 6);

              // 하단 브랜드 정보
              ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.8)';
              ctx.textAlign = 'center';
              ctx.shadowColor = 'rgba(0,0,0,0.5)';
              ctx.shadowBlur = 4;
              ctx.fillText('펄러비즈 도안 생성기', cardWidth / 2, cardHeight - 40);
              ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.6)';
              ctx.fillText('perler-beads.heymenshan.workers.dev', cardWidth / 2, cardHeight - 20);
              ctx.shadowBlur = 0;

              resolve(canvas.toDataURL('image/jpeg', 0.95));
            };
            thumbnailImg.src = thumbnailDataURL;
          } else {
            // 하단 브랜드 정보
            ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText('펄러비즈 도안 생성기', cardWidth / 2, cardHeight - 40);
            ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.fillText('perler-beads.heymenshan.workers.dev', cardWidth / 2, cardHeight - 20);
            ctx.shadowBlur = 0;

            resolve(canvas.toDataURL('image/jpeg', 0.95));
          }
        }
      };
      userImg.src = userPhoto;
    });
  }, [userPhoto, totalElapsedTime, generateThumbnail, totalBeads]);

  // 완성 카드 다운로드
  const downloadCard = async () => {
    const cardDataURL = await generateCompletionCard();
    if (cardDataURL) {
      const link = document.createElement('a');
      link.download = `펄러비즈-완성-${new Date().toLocaleDateString()}.jpg`;
      link.href = cardDataURL;
      link.click();
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              🎉 작품 완성 🎉
            </h2>
            <div className="text-gray-600 space-y-1">
              <p>총 소요 시간: {formatTime(totalElapsedTime)}</p>
              <p>완성한 비즈: {totalBeads}개</p>
            </div>
          </div>

          {!userPhoto ? (
            <div className="text-center">
              {!isCapturing ? (
                <div>
                  <p className="text-gray-600 mb-4">
                    사진을 찍어 나만의 완성 카드를 만들어보세요!
                  </p>
                  {cameraError && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-yellow-800 text-sm">
                        📱 카메라에 접근할 수 없습니다. 권한이 제한되어 있거나 기기에서 지원하지 않을 수 있습니다.<br/>
                        작품 이미지를 사용하여 완성 카드를 만들 수 있습니다.
                      </p>
                    </div>
                  )}
                  <div className="space-y-3">
                    <button
                      onClick={startCamera}
                      className="w-full bg-blue-500 text-white px-6 py-3 rounded-lg hover:bg-blue-600 transition-colors"
                    >
                      📸 카메라로 사진 찍기
                    </button>
                    <button
                      onClick={skipPhoto}
                      className="w-full bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition-colors"
                    >
                      🎨 사진 건너뛰고 작품 이미지 사용
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full max-w-xs mx-auto rounded-lg mb-4"
                  />
                  <button
                    onClick={takePhoto}
                    className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition-colors mr-2"
                  >
                    📸 사진 찍기
                  </button>
                  <button
                    onClick={() => {
                      const stream = videoRef.current?.srcObject as MediaStream;
                      stream?.getTracks().forEach(track => track.stop());
                      setIsCapturing(false);
                    }}
                    className="bg-gray-500 text-white px-4 py-3 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userPhoto}
                alt="사용자 사진"
                className="w-32 h-32 rounded-full mx-auto mb-4 object-cover"
              />
              <div className="space-y-3">
                <button
                  onClick={downloadCard}
                  className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white py-3 rounded-lg hover:from-purple-600 hover:to-pink-600 transition-colors"
                >
                  📥 완성 카드 다운로드
                </button>
                <button
                  onClick={() => setUserPhoto(null)}
                  className="w-full bg-gray-500 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  다시 촬영하기
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full bg-gray-100 text-gray-600 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              나중에 하기
            </button>
          </div>
        </div>
      </div>

      {/* 이미지 생성을 위한 숨겨진 canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={cardCanvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default CompletionCard;
