## 작업 리포트 — app pids_limit 288

| 항목 | 전 | 후 |
| --- | --- | --- |
| app `pids_limit` | 256 | **288** |
| 산식 | Tomcat 200 + 유휴 36 + 여유(채팅 풀 누락) | Tomcat 200 + 채팅 16 + 그 밖 약 39 ≈ 255 → 288 |

- 근거 : 운영 유휴 PIDs 49(10-15) 에서 Tomcat 유휴 10 을 뺀 39 가 「그 밖」. 채팅 실행기 고정 풀은 첫 요청 때 늘어나 유휴엔 없다
- `docker compose config` 로 app 288 · db 128 확인. 문서 게이트 통과
- compose 주석에 「채팅 상한을 올리면 이 값도 같이 올린다」
- 운영 반영 : `deploy.sh` 가 compose 를 함께 보낸다 → 배포 후 `docker inspect` 로 PidsLimit 288 확인
