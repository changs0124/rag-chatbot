## 작업 요약

#525 리뷰에서 나온 문서 · 주석 정리. 동작 변화 없음(compose 는 주석만, `image:` 줄 무변경).

## 변경 전후

| 위치 | 전 | 후 |
| --- | --- | --- |
| `backend.md` 「감수하는 약점」 | app 이미지 태그 롤백만 | **`cloudflared` · `db` 는 태그로 안 돌아감** → 서버 compose 의 `image:` 를 이전 다이제스트로 고치고 `up -d <서비스>` · db 는 같은 메이저 안에서만 |
| compose cloudflared 「올릴 때」 | `pull` · `inspect RepoDigests` | + `--version` · `tunnel run --help \| grep token-file` · 되돌리는 법 포인터 |
| compose 212행 | 「… 다이제스트를 바꿀 때 확인」 | 절차 쪽으로 모아 꼬리 삭제 |
| CHANGELOG `[2026-10-28]` 머리 | 롤백 절차 전문 | 이전 다이제스트 + backend.md 포인터 |

설정 · 문서 변경이라 캡처 대신 diff 로 남긴다 — `.issue/527/evidence/before.txt` · `after.txt`

## 검증

- `docker compose config` exit 0 · `bash scripts/check-all.sh docs` 통과

## 남은 이슈

- 터널 미연결을 배포가 못 잡는 문제는 #528
