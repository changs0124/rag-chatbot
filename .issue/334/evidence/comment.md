## 작업 요약

#297 이후 다시 쌓인 경위 서술과 문서 간 중복을 정본 한 곳으로 줄였다.

- 41건 중 40건을 적용하고 1건(R32)은 일부만 적용했다
- README 표 셋(문서 · CI 잡 · 환경변수)은 사용자 결정대로 두었다(R7~R9 제외)
- CHANGELOG 는 이 이슈 항목만 더했다

| 문서 | 줄였다 |
| --- | ---: |
| backend.md | 75 |
| CONVENTIONS.md | 52 |
| INDEX.md | 39 |
| live-integration.md | 36 |
| design-system.md | 31 |
| features.md | 30 |
| frontend.md | 25 |
| api.md · requirements · backlog · current-sprint · overview | 32 |
| **합계(CHANGELOG 제외)** | **약 320 (6,497 → 6,177)** |

## 검증

- 지운 문장마다 그 사실이 남은 정본 한 곳을 적고 열어서 확인했다(`verify.txt` 항목별)
  - 「CL」 항목은 지우기 전에 CHANGELOG 에 그 이력이 있는지 확인했다
- `check-all.sh docs` 와 `check-doc-versions.sh` 통과
  - 섹션 참조 33건이 하나도 사라지지 않았다. 새 참조 4건도 실제 헤딩을 가리킨다
- 코드 주석이 가리키는 절 이름 · 번호가 전부 남았다
  - live-integration §0 · 2-x · 3-1 · 3-2 · 5-1 · 5-2
  - overview 「데이터 흐름」 · 「알려진 제약」
  - backend 「유량 제어」 · 「배포」
  - design-system 7-2 · 7-3
- 운영 절차가 전부 남았다 : 배포 · 롤백(`:previous` · `prev-<sha>`) · 스냅샷 복구 4단계 · cloudflared 다이제스트 갱신 · 시크릿 권한
- 리뷰 : 처음에는 REQUEST_CHANGES 였다. 반영한 것
  - backend.md 에 「중단(사용자 정지 · 연결 끊김)은 실패가 아니다」를 되살렸다. #297 이 계층마다 일부러 남긴 문장이다
  - erd.md 의 「`error` 로 통일하면」 뜻을 바로잡았다
  - Dockerfile 주석이 가리키던 첨부 볼륨 문장을 backend.md 「배포」에 한 줄로 두었다
  - CONVENTIONS 의 #135 근거를 가리키게 했다
  - `check-doc-versions.sh` 의 「못 잡는 것」에 목록형 서술을 더했다
  - backlog 의 드라이버 하한을 지키는 게이트가 없다는 이유를 되살렸다
  - `OpenAiRealService` 주석이 관측 원본을 가리키게 했다
- 원본 : `.issue/334/evidence/` (줄 수 전후 · 섹션 참조 전후 · 항목별 판정)

## 이슈와 다른 점

- **R32 는 일부만 적용했다.** live-integration §3 의 「확인됨」 열은 지웠지만, 머리에 「A~E 확인 · F 무해(#184 · #37)」와 관측 원본 경로를 남겼다. 코드 주석이 §3 을 관측 기록의 정본으로 가리키기 때문이다
- 기술 스택 표가 README 로 모여, 이를 말하던 `check-doc-versions.sh` 머리 주석을 고쳤다

## 남은 이슈

- 리뷰 제안 중 둘은 반영하지 않았다(낮음, 정본 없는 작은 사실)
  - design-system 의 「`ResizableSidebar` 는 FEAT- ID 가 없고 구현이 정본」
  - #281 의 「API 직접 12회 중 2회」 빈도
