# 사진·동영상 형식

0.4.0부터 웹 파일 선택, NAS 재귀 인덱싱, Android MediaStore 백업이 같은 77개 확장자 목록을 사용합니다. Android 목록은 `src/lib/media-formats.ts`에서 생성합니다. 확장자가 같아도 실제 코덱·카메라 모델에 따라 미리보기 지원이 다릅니다.

- 사진: JPEG, PNG, WebP, HEIC/HEIF/HIF, AVIF, TIFF, GIF, BMP, ICO, PSD/PSB, JPEG XL, JPEG 2000, PNM 계열.
- RAW: DNG, CR2/CR3/CRW, NEF/NRW, ARW/SRF/SR2, RAF, RW2/RWL, ORF, PEF, X3F, 3FR, FFF, IIQ, MEF, MOS, MRW, SRW, RAW, DCR, KDC, ERF, K25, MDC.
- 동영상: MP4/M4V, MOV, MKV, WebM, AVI, MTS/M2TS/TS, MPG/MPEG/MPE, VOB, 3GP/3G2, OGV, ASF/WMV, MXF, FLV.

원본은 수정하지 않습니다. 서버가 480px WebP 썸네일과 최대 2048px WebP 미리보기를 만듭니다. RAW는 충분한 크기의 내장 JPEG를 우선 사용하고 없으면 LibRaw 기반 변환을 시도합니다. 작은 내장 미리보기만 제공되는 기종은 해상도가 낮을 수 있습니다. GIF·다중 프레임 이미지는 정지 미리보기입니다.

동영상은 포스터와 최대 1280×720, 30fps H.264/AAC MP4 재생본을 생성합니다. 긴 영상은 비트레이트를 낮추며 128MB·10분 변환 시간 한도를 넘으면 포스터와 원본을 유지하고 재생 실패 상태를 표시합니다. 브라우저는 Tailscale 인증 청크로 재생본을 받은 뒤 재생합니다. 원본 HDR·고해상도·다중 오디오 트랙을 재생본이 그대로 보존하지는 않습니다.

사진 파일 한도는 250MB, 동영상은 2GB입니다. 브라우저 수동 백업은 해시 계산도 4MB 단위로 처리합니다. 앱 내 원본 다운로드는 메모리 사용 때문에 250MB로 제한하며 더 큰 원본은 NAS에서 직접 받습니다. Android 자동 백업은 시스템 MediaStore에 등록되고 사용자에게 접근 권한을 받은 파일만 찾을 수 있습니다.

서버에는 sharp 외에 FFmpeg/ffprobe, ImageMagick, LibRaw, ExifTool, libheif HEVC decoder, JPEG XL decoder가 필요합니다. Ubuntu 설치 예:

```sh
sudo apt-get install ffmpeg imagemagick libraw-bin libimage-exiftool-perl libheif-examples libheif-plugin-libde265 libjxl-tools
```

검증한 실제 변환: PNG·JPEG·WebP·AVIF·TIFF·GIF·BMP·ICO·PSD·JP2·PPM·HEIC·JXL 및 H.264 MP4/MOV/MKV·VP9 WebM 합성 샘플 17개. RAW는 raw.pixls.us의 CC0 Pentax K-7 DNG, Canon EOS 40D CR2, Nikon D7000 NEF를 해시 검증 후 처리했습니다. 모든 원본의 바이트 보존을 확인했습니다. 나머지 카메라 모델·코덱 조합은 개별 검증되지 않았습니다.
