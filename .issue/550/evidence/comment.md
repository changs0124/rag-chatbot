## #550 작업 리포트 — 운영 SSH 를 터널로, 22 는 브라우저 SSH 대역만

성격 : 인프라 설정 · 문서(화면 변화 없음) — 캡처 대신 명령 출력을 증거로 남긴다.

### 무엇을 바꿨나

| 위치 | 변경 |
|------|------|
| Cloudflare Access | 앱 `ssh.chseong.fyi`(Self-hosted · 세션 24h · Allow = 운영자 이메일 1개) — 터널 경로보다 **먼저** 만들었다 |
| Cloudflare Tunnel `rag-chatbot` | 경로 추가 `ssh.chseong.fyi` → `ssh://host.docker.internal:22`(설정 v1 → v2, `api.chseong.fyi` 그대로) · proxied CNAME |
| `docker-compose.yml` | `cloudflared` 에 `extra_hosts: host.docker.internal:host-gateway` — 컨테이너 안 `localhost` 는 cloudflared 자신이라서. 서버에 먼저 올려 `up -d cloudflared`(앱 · db 재기동 없음) |
| 개발 PC | `cloudflared` 2026.10.7 설치 · `~/.ssh/config` 별칭 `HostName ssh.chseong.fyi` + `ProxyCommand cloudflared access ssh` (백업 `config.bak-550`) · known_hosts 에 같은 호스트 키를 새 이름으로 |
| Lightsail 방화벽 | 22/tcp : `0.0.0.0/0` · `::/0` → **`lightsail-connect` 만** |
| 문서 | `backend.md` 운영 구성 표 · 「SSH 도 터널로 들어온다」 · ssh config 예시 · 「감수하는 약점」(cloudflared 재생성 = 터널 SSH 세션 끊김 → 브라우저 SSH) · 복구 절차 · CHANGELOG |

### before (11-02 00:01 UTC)

```json
{ "fromPort": 22, "protocol": "tcp", "state": "open",
  "cidrs": ["0.0.0.0/0"], "ipv6Cidrs": ["::/0"], "cidrListAliases": [] }
```

```
$ timeout 8 bash -c 'exec 3<>/dev/tcp/13.209.194.28/22 && head -c 40 <&3'
SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13.2 -> 열림(배너 수신)
```

### after (11-02 00:26 UTC)

```json
{ "fromPort": 22, "protocol": "tcp", "state": "open",
  "cidrs": [], "ipv6Cidrs": [], "cidrListAliases": ["lightsail-connect"] }
```

```
$ timeout 8 bash -c 'exec 3<>/dev/tcp/13.209.194.28/22 && head -c 40 <&3'
 -> 닫힘/타임아웃

$ ssh chseong-seoul-01 'echo $SSH_CONNECTION'
172.19.0.3 51188 172.17.0.1 22     # 출발지 = cloudflared 컨테이너, 도착 = host-gateway:22

$ scp 20MB 왕복 sha256 대조
local=659a794a7551a60e remote=659a794a7551a60e 13초

$ curl https://api.chseong.fyi/api/health     → 200
$ curl https://ssh.chseong.fyi/ (로그인 없이)  → 302 Access 로그인
```

서버 compose 와 브랜치 compose sha256 일치(`4e6cdb10…`), 서버 `compose config -q` 통과. `check-all.sh docs` 통과.

### 완료 기준

- [x] 22 의 `cidrs` · `ipv6Cidrs` 비고 `lightsail-connect` 만
- [x] PC 에서 고정 IP 직접 22 타임아웃
- [x] `ssh chseong-seoul-01` · scp 가 터널로 성공(실제 배포는 다음 `deploy.sh` 가 첫 실전)
- [ ] Lightsail 콘솔 브라우저 SSH 접속 — **사용자 확인 대기**
- [x] 운영 `/api/health` 200 · 터널 유지
- [x] 문서 동기화 · `check-all.sh docs`

### 남은 것 · 주의

- cloudflared 를 바꾸는 배포(다이제스트 · compose 의 cloudflared 블록)는 `deploy.sh` 의 `up -d` 가 자기 SSH 를 끊는다 → 브라우저 SSH 로 `up -d cloudflared`
- Access 세션 24h 가 지나면 첫 ssh 에서 브라우저 로그인이 다시 뜬다
