# 0.5.0 배포

2026-09-14 웹과 Android APK를 배포했다. 모바일 헤더·내비게이션·설정 간소화,
앨범과 기간별 사진 담기, 얇은 연표 탐색, 로컬 Natural Earth 지도,
로그아웃 시 기기 사진 캐시 보존을 포함한다.

- 웹: https://photo.3chan.kr
- APK: https://photo.3chan.kr/downloads/photo-0.5.0.apk
- Android versionCode: 5. 기존 앱과 동일한 서명 키를 사용했다.
- APK SHA-256: `9d98a363260e92bd09746c1bfc9abd755774a3fc8dad4fb17814d044d0759b0f`
- TypeScript/Vite/API/Android release 빌드 완료. Vitest 44개, Linux NAS broker 테스트 3개 통과.
- 공개 웹 12개 빌드 파일, Natural Earth 데이터와 APK의 해시가 로컬 산출물과 일치한다.
- 공개 API 404, 인증 없는 사설 사진 API 403, 사설 health 정상 확인.
- 롤백 산출물과 배포 전 SQLite 백업: `/srv/photo/.deploy/0.5.0-20260914/previous`.
- 로그인 화면의 추가 디자인 변경은 이 배포에 포함하지 않는다.
