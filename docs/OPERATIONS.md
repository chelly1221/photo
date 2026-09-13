# 운영

## 구성

| 경로/서비스 | 용도 |
| --- | --- |
| `/srv/photo` | 앱 배포 경로 |
| `/srv/photo/state` | SQLite 인덱스, 썸네일, 미리보기, 업로드 임시 파일 |
| `/srv/photo/.env` | 비공개 API 설정과 허용 Tailscale 계정 |
| `/etc/photo/nas.credentials` | root 전용 NAS SMB 자격 증명 |
| `/etc/photo/connections/<UUID>` | GUI에서 등록한 NAS 연결별 설정, root 전용 0700/0600 |
| `/etc/photo/mounts/<UUID>.json` | 서버 재시작 시 복구할 선택 폴더 기록 |
| `/mnt/photo/<UUID>` | 앱에 등록한 공유 폴더의 마운트 |
| `photo.service` | 사설 API, 스캔 및 이미지 생성 |
| `photo-nas-<UUID>.service` | 선택 폴더별 독립 rclone 마운트 서비스 |
| `photo-web` | 읽기 전용 공개 정적 웹 컨테이너 |
| Tailscale Serve `8446` | `127.0.0.1:8793`의 인증 API |
| `photo.3chan.kr` | Caddy → `photo-web:8794` |

현재 설치는 기존 서버의 `3chan` 사용자를 사용합니다. NAS 주소는 앱에서 입력합니다. 다른 API 서버에 배포하려면 systemd, Go의 허용 origin과 `src/lib/tailscale.ts`를 함께 변경해야 합니다. 공개 사이트에 `/api` 프록시를 추가하면 안 됩니다. 기존 수동 SMB 연결은 `photo-mount.py`를 통해 계속 지원합니다.

## 초기 설치

배포 서버에 Docker, Tailscale, cifs-utils, Python 3, Node.js 22.13 이상, rclone 1.60 이상, fuse3, openssh-client를 준비합니다. 현재 Node 런타임은 공식 Node Docker 이미지에서 `/srv/photo/runtime/node`로 복사해 사용합니다. `runtime`은 Git에 포함하지 않습니다.

1. 웹/WASM/API를 빌드하고 `dist`, `dist-api`, `scripts`, package 파일, Docker 구성 파일을 `/srv/photo`에 배치합니다.
2. 서버에서 `npm ci --omit=dev`에 해당하는 Linux 의존성을 설치합니다. Windows `node_modules`를 복사하지 않습니다.
3. root 전용 SMB 자격 증명을 준비합니다. 현재 전용 provisioning 스크립트는 기존 `/etc/note/nas.credentials`에서 서버 내부 복사합니다.
4. `sudo python3 /srv/photo/scripts/provision-host.py`를 실행합니다. 이 스크립트는 제한된 마운트 도우미·sudoers·systemd·Tailscale Serve·Caddy 경로를 설정합니다. 기존 다른 앱 경로는 유지합니다.
5. `/srv/photo`에서 `docker compose up -d --build`를 실행하고 `releases`에 서명 APK를 배치합니다.

`.env.example`을 참고해 허용 로그인 목록을 설정합니다. NAS 비밀번호나 Tailscale auth key를 프런트엔드 배포물에 넣지 않습니다. 사용자는 앱에서 NAS 주소·계정을 입력하고 발견된 프로토콜과 폴더를 선택합니다. 감상용 폴더는 읽기 전용, 백업 대상으로 명시한 폴더만 읽기/쓰기로 마운트됩니다.

검색은 입력한 사설/Tailscale IPv4 한 대의 SMB 445, SFTP 22, WebDAV 443·5006·80·5005 포트만 확인합니다. 비밀번호는 프로토콜 선택 후 로그인할 때 전달합니다. SFTP 서버 키를 저장해 후속 변경을 거부하고 HTTPS 인증서는 검증합니다. HTTP WebDAV는 선택 화면에 암호화되지 않는 연결임을 표시합니다. 사용자 지정 포트, WebDAV 하위 서비스 URL, 공인 IP·호스트명·IPv6 입력은 현재 지원하지 않습니다.

`photo-nas`는 JSON stdin으로만 요청을 받아 계정 정보를 명령행이나 응답에 노출하지 않습니다. rclone의 비밀번호 obscuring은 암호화 보관함이 아니므로 root 파일 권한이 보안 경계입니다. 새 연결 중 취소한 계정 설정은 제거하며, 사용하지 않은 연결은 한 시간 이후 다음 연결 시 정리합니다. 저장한 연결 설정과 마운트 기록은 상태 DB와 함께 비공개 백업이 필요합니다. 새 마운트는 독립 systemd 서비스에서 실행되어 API 재시작과 수명을 분리하고, 서버 부팅 때 복원합니다. VFS 쓰기 캐시는 끄고 NAS에 직접 기록합니다. FUSE는 하드 링크를 지원하지 않아 새 파일 생성 시 배타적 복사를 사용합니다.

## 업데이트

최신 빌드 결과를 배치한 다음 다음을 실행합니다.

```sh
cd /srv/photo
docker compose up -d --build
sudo systemctl restart photo
sudo systemctl is-active photo
curl --fail http://127.0.0.1:8793/api/health
```

의존성이 바뀌면 서버의 production 의존성도 다시 설치합니다. APK 업데이트는 같은 서명 키와 증가한 `versionCode`를 사용합니다. `android/app/build.gradle`의 `versionName`, 웹 다운로드 링크도 함께 갱신합니다.

## 보관과 복구

- NAS 원본과 백업 폴더는 NAS 자체 스냅샷/백업 정책으로 보호합니다.
- 앱 상태를 복사할 때 서비스를 중지한 뒤 `/srv/photo/state`를 보관하거나 SQLite 일관성 있는 백업을 사용합니다. 즐겨찾기·공유 설정·백업 완료 기록은 DB에 있습니다.
- 썸네일 파일이 사라지면 이후 스캔에서 재생성합니다. 코덱 등으로 실패한 항목은 수동 재스캔 시 다시 시도합니다.
- NAS 연결이 끊어지면 기존 인덱스를 보존합니다. 전체 디렉터리 순회가 성공한 스캔에서만 사라진 항목을 인덱스에서 제거합니다.
- 웹/Android 로그아웃은 해당 기기의 Tailscale 상태와 사진 캐시를 정리합니다. NAS 원본은 지우지 않습니다.
- `.local`의 Android 서명 키와 설정은 별도 비공개 백업이 필요합니다. 공개 저장소에는 올리지 않습니다.

## 확인 항목

공개 홈·favicon·WASM·APK는 200, 공개 `/api/photos`는 404, 로컬 사설 API의 인증 없는 `/api/photos`는 403이어야 합니다. Tailscale Serve를 통한 허용 계정의 `/api/identity`는 200이어야 합니다. 서비스 로그는 `journalctl -u photo`로 확인합니다.
