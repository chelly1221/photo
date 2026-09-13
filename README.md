# 사진

NAS의 사진을 내장 Tailscale로 감상하고 Android 사진을 NAS에 자동 백업하는 개인 사진 보관함입니다. 노트·캘린더·주소록 시리즈의 Pretendard와 차분한 다크 테마를 공유합니다.

- 웹: https://photo.3chan.kr
- Android: https://photo.3chan.kr/downloads/photo-0.2.0.apk
- 저장소: https://github.com/chelly1221/photo

## 사용하기

1. 웹 또는 Android 앱에서 Tailscale 계정으로 기기를 연결합니다. 서버의 허용 계정 및 tailnet ACL에 등록되어 있어야 합니다.
2. **공유 폴더 연결**에서 NAS IP·계정·비밀번호를 입력합니다. 발견된 SMB·SFTP·WebDAV 중 사용할 방식을 선택하고, 공유 폴더와 하위 폴더를 직접 탐색해 **이 폴더 연결**을 누릅니다. 기존 NAS 주소가 기본값이며 다른 사설/Tailscale NAS IPv4 주소도 연결할 수 있습니다. 비밀번호는 서버에서만 보관합니다.
3. 인덱싱이 진행되면 날짜별 사진, 폴더, 검색, 즐겨찾기, 촬영 위치 지도를 사용할 수 있습니다. 원본은 보존하고 서버가 480px 썸네일과 2048px 미리보기를 생성합니다.
4. Android에서 백업 가능한 공유 폴더를 추가한 뒤 **백업**에서 저장 위치, 사진 권한, Wi-Fi 전용 여부를 설정하고 자동 백업을 켭니다. 기본은 Wi-Fi 전용입니다. 웹에서는 파일 선택 업로드를 지원합니다.

백업은 SHA-256으로 중복을 확인하고 중단된 청크 업로드를 이어갑니다. NAS에 원래 있던 파일을 덮어쓰지 않습니다. 휴대폰 사진을 삭제하거나 NAS 파일을 휴대폰으로 자동 삭제 동기화하지 않습니다.

## 범위

- 가상화 사진 목록, 제한된 병렬 썸네일 요청, 브라우저 캐시
- 날짜·파일명 검색, 정렬, 폴더 탐색, 즐겨찾기
- EXIF 촬영 날짜·카메라·위치 정보, 확대, 원본 다운로드
- 지도 클러스터 및 같은 좌표의 사진별 선택
- NAS 프로토콜 검색, GUI 폴더 탐색·선택, 공유 폴더 추가·일시 중지, 수동/주기 인덱싱, NAS 오프라인 시 기존 인덱스 보존
- Android MediaStore 및 WorkManager 자동 백업, 네이티브 인증 브라우저
- 한국어 반응형 UI, PWA, favicon, Android 일반·적응형·단색 아이콘

Android 백그라운드 실행 시점은 OS 절전·네트워크·배터리 정책에 따릅니다. 강제 종료 후에는 앱을 다시 열어야 합니다. iOS 네이티브 자동 백업 앱은 포함하지 않습니다. 동영상은 현재 백업/보관함 대상이 아니며, 사진 한 장의 업로드·앱 내 다운로드 제한은 250MB입니다. HEIC/HEIF 원본을 보존하지만 미리보기 지원은 서버의 libvips 코덱에 따라 달라집니다. 지도에는 위치가 있는 사진 최대 100,000장을 표시합니다.

공개 웹은 앱 파일과 APK만 제공합니다. 사진 API는 Tailscale 내부 HTTPS에서만 제공하며, 웹·Android의 Go/WASM WireGuard 연결이 직접 접근합니다. 지도 타일은 OpenStreetMap에서 가져오므로 타일 서버는 접속 IP와 요청한 지도 영역을 볼 수 있습니다. 사진 원본을 타일 서버로 보내지 않습니다.

## 개발

Node.js 22.13 이상, npm, Git이 필요합니다. WASM은 별도 Go 빌드가 필요합니다. Linux NAS 서버는 rclone 1.60 이상, FUSE3, OpenSSH 클라이언트가 필요합니다.

```sh
npm ci
# networking/tailscale/README.md에 따라 Go 및 고정된 Tailscale 소스 준비
npm run build:tailscale
npm run build:icons
npm run dev
npm test
npm run build
npm run build:server
```

Android Studio의 JDK 21 이상과 Android SDK 36을 준비하고 `android/local.properties`에 SDK 위치를 설정합니다.

```sh
npm run android:sync
npm run android:release
```

첫 release 빌드는 `.local/photo-release.jks`와 `.local/android-signing.json`을 생성합니다. 이후 업데이트에 같은 키가 필요하므로 두 파일을 안전하게 별도 보관하세요. 키·자격 증명·NAS 사진·캐시는 Git에 포함되지 않습니다.

## 문서

- [운영 및 배포](docs/OPERATIONS.md)
- [검증 결과와 남은 현장 확인](docs/VERIFICATION.md)
- [내장 Tailscale 빌드와 인증](networking/tailscale/README.md)
- [제품 범위](PRODUCT.md), [디자인 시스템](DESIGN.md)

인터페이스에는 Impeccable 지침을 적용했습니다. 요청한 Claude Code `claude-fable-5-1 --effort high`는 로컬·서버 모두 사용량 한도(HTTP 429)에 걸려 코드를 생성하지 못했으며, 이번 구현은 Codex로 진행했습니다.
