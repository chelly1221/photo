# 0.5.1 배포

2026-09-14 보관함 연결 화면과 인증 대기·취소·재시도 흐름을 웹과 Android APK에 배포했다.
Android 인증 창 수동 종료 이벤트와 웹 팝업 차단 시 재시도 안내를 포함한다.

- 웹: https://photo.3chan.kr
- APK: https://photo.3chan.kr/downloads/photo-0.5.1.apk
- Android versionCode: 6. 기존 0.5.0과 서명 인증서 일치 확인.
- APK 크기: 14,756,895 bytes.
- APK SHA-256: `b7c19fe3330b173742c28abe93fcdebf7257f91fc3c8004b14aa8405b9e8db3f`
- Vitest 53개, Linux NAS broker 테스트 3개 통과. 웹·API·Android release 빌드 통과.
- 공개 웹 12개 파일, Natural Earth 데이터 및 APK 해시 일치 확인.
- 공개 API 404, 비인증 사설 사진 API 403, 사설 health 정상 확인.
- 공개 사이트에서 새 연결 화면과 0.5.1 다운로드 링크 확인.
- 롤백 산출물 및 SQLite 백업: `/srv/photo/.deploy/0.5.1-20260914/previous`.
- 실제 Android 기기에서 계정 인증을 완료하는 전체 흐름은 아직 별도 확인이 필요하다.

최초 서버 이미지 빌드에서 잠금 파일의 의존성 버전 치환 오류를 발견했다.
이전 배포의 의존성을 복원하고 앱 버전만 갱신한 뒤 재배포했다.
실패 시점에는 실행 중인 서비스 변경이 없었다.
