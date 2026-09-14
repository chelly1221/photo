# 0.5.2 배포

2026-09-15 웹·사설 API·Android APK 배포 완료.

- 웹: https://photo.3chan.kr
- APK: https://photo.3chan.kr/downloads/photo-0.5.2.apk
- Android versionCode 7, versionName 0.5.2. 기존 서명 인증서 일치.
- APK 크기: 14,758,759 bytes.
- APK SHA-256: `822c6af35b3793c58bf65eb1c625fcf35bdab1e5ded3e90a37b55166448a16fd`
- APK 내 index.html과 최신 웹 빌드 일치 확인.

사진·동영상 길게 누르기로 다중 선택, 선택 수 표시, 선택 해제와 일괄 원본 삭제 확인을 제공한다. 일부 삭제 실패 시 성공 항목은 유지하고 실패 항목만 재시도한다. 삭제는 저장된 NAS 연결의 파일 하나씩 크기·수정 시각·소유자를 확인하며 감상용 마운트는 읽기 전용으로 유지한다. 서버 도우미 `/usr/local/sbin/photo-nas`도 root:root 0755로 교체하고 배포 원본과 해시 일치를 확인했다.

동영상 대표 프레임 썸네일과 대용량 동영상 포스터 생성을 개선했다. 상단 메뉴·설정·다운로드 탭 배경, 중복 공유 폴더 연결 버튼과 계정 상태 푸터를 제거했다.

검증: Vitest 58개, Linux NAS 도우미 테스트 4개 통과. 웹·서버·Android release 빌드 성공. 공개 웹 12개 산출물과 Natural Earth 데이터 및 APK 해시 일치. 공개 API 404, 비인증 사설 사진 API 403, 사설 health 정상. 실제 NAS 원본을 삭제하는 운영 환경 검증과 실제 휴대폰 업데이트 설치는 수행하지 않았다.

이전 앱·도우미·SQLite 백업: `/srv/photo/.deploy/0.5.2-20260915/previous`.
