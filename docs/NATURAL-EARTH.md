# Natural Earth 지도

사용자가 골목·건물 지도를 필요로 하지 않고 출처 표시 없는 다크 지도를 요청하여,
OpenFreeMap 타일을 Natural Earth 공개 데이터로 교체했다.

- 국가 및 호수: 1:50m
- 지역 경계: 1:10m 선형 데이터를 0.025도 허용 오차로 간소화
- 도시 및 국가 지명: 한국어 우선, 없는 경우 원래 이름
- 표시: MapLibre GL, 확대 1–8, 사진 위치 자동 맞춤은 최대 7
- 색상: 바다·호수 순수 검정, 육지 #111, 낮은 대비의 얇은 경계선
- 확대·축소 버튼 없이 핀치·휠·키보드로 탐색
- 지명: 로컬 Pretendard로 표시, 겹침을 줄이고 최대 50개 표시
- 사진 클러스터와 목록 탐색은 기존 인증된 사진 API를 사용

지도 데이터는 `public/maps/natural-earth/`에 포함하며 외부 타일·글꼴·스타일
서버에 접속하지 않는다. 지도 데이터 약 5.8MiB는 웹·Android 앱 자산으로 제공된다.

데이터는 **Natural Earth v5.1.2**이며 [공식 이용 조건](https://www.naturalearthdata.com/about/terms-of-use/)
상 퍼블릭 도메인으로, 저자 출처 표시가 필요하지 않다. 지도 위에 로고·출처 버튼을
표시하지 않는다. MapLibre 소프트웨어 라이선스와 지도 데이터 라이선스는 별개다.

재생성: `node scripts/build-natural-earth.mjs`

스크립트는 공식 데이터 저장소의 고정 버전에서 내려받아 불필요한 속성을 제거한다.
정확한 원본 URL 및 SHA-256은 `public/maps/natural-earth/manifest.json`에 기록한다.
