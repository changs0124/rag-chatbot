## 작업 요약

관리 화면을 **문서 관리**(`/admin/documents`)와 **사용자 관리**(`/admin/users`)로 나누고, 사용자 관리에 **사용자 삭제**를 더했습니다. 비밀번호 초기화는 동작 그대로 사용자 관리로 옮겼습니다. 명세(FEAT-ADMIN-004 · REQ-ADMIN-005)를 구현보다 먼저 커밋했습니다(`663e79f`).

삭제 정책(사용자 결정) : 일반 사용자만 삭제 → 204, 대화 · 메시지 · 인용 · 첨부 행 cascade, 첨부 파일은 DB 삭제 뒤 즉시 디스크에서 지움(실패는 WARN, 매시 회수가 백업) · **관리자 계정(자기 자신 포함) 400** · **문서를 올린 기록이 있는 사용자 409**(감사 기록 유지) · 없는 id / 비관리자 호출 404 · 지운 사용자의 토큰은 다음 요청부터 401.

## 변경 전후

| 전 | 후 |
| --- | --- |
| ![관리 화면 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/513/evidence/before/admin.webp) | ![문서 관리 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/513/evidence/after/admin.webp) |
| ![마이페이지 - 전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/513/evidence/before/mypage.webp) | ![마이페이지 - 후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/513/evidence/after/mypage.webp) |

<details><summary>사용자 관리 화면 · 삭제 확인 창</summary>

| 사용자 관리 | 삭제 확인 |
| --- | --- |
| ![사용자 관리](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/513/evidence/after/users.webp) | ![삭제 확인](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/513/evidence/after/users-confirm.webp) |

</details>

빨간 박스가 변경 구간입니다. 전에는 「문서 관리」 화면 아래에 사용자 절이 섞여 있었고, 지금은 `/admin` 이 문서 관리로 넘어가며 사용자는 별도 화면에서 다룹니다. 삭제 버튼은 일반 사용자 행에만 있습니다. (캡처는 로컬 vite + API 목업, 1280px)

## 백엔드 검증

| 항목 | 결과 |
| --- | ---: |
| 삭제 204 · cascade · 파일 삭제 | 통과 |
| 관리자 · 자기 자신 400 | 통과 |
| 업로더 409(문서 soft delete 뒤에도) · 409 뒤 첨부 파일 유지 | 통과 |
| 없는 id 404 · 비관리자 404 | 통과 |
| 삭제 뒤 그 사용자 토큰 401 | 통과 |
| 파일 삭제 실패해도 204 + WARN | 통과 |
| 409 는 업로더 FK 일 때만(다른 위반은 다시 던짐) | 통과 |

원본 : `.issue/513/evidence/backend-tests.txt`. `scripts/check-all.sh` 백엔드 **410/410** · 프론트 **308/308** · lint · build 통과(gitleaks · trivy 는 로컬 미설치로 미측정).

## 커밋

- `663e79f` docs(spec) — 명세 먼저
- `710d108` feat(admin) — 삭제 API
- `3e1c9f2` feat(admin) — 화면 분리 · 삭제 버튼
- `672c7a1` fix(admin) — 독립 리뷰(opus) 반영 : 409 범위 좁힘 · 삭제 실패 뒤 목록 재조회 · 응답 역전 방지 · 행 버튼 접근 이름

## 남은 이슈

- **배포 순서** : 백엔드를 먼저 배포해야 합니다. 프론트(Vercel)가 먼저 나가면 삭제 버튼이 404 를 받습니다.
- 문서를 올린 기록이 있는 계정은 지울 수 없습니다(명세의 감수하는 한계). 세션을 끊으려면 비밀번호 초기화.
- 삭제와 겹친 그 사용자의 진행 중 업로드 · 대화 생성은 500 이 될 수 있습니다(한 요청 수준, 명세에 기록).
