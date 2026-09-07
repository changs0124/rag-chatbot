관련 이슈: [#36 fix(backend): 문서 형식을 MIME 으로 판정해 .md · .docx 가 환경에 따라 거부된다](https://github.com/changs0124/rag-chatbot/issues/36) (통합 테스트 뒤 close)

## 변경 내용

화면은 `.md` 와 `.docx` 를 고를 수 있게 열어 두는데 서버가 content-type 으로만 판정해, 같은 파일이 사용자 PC 설정에 따라 되기도 하고 안 되기도 했다.

- `frontend/src/pages/AdminPage.tsx:33` — `ACCEPT = '.pdf,.txt,.md,.docx'` → **확장자**
- `backend/.../AdminDocumentService.java:88` — `ALLOWED.get(file.getContentType())` → **content-type**

브라우저는 `File.type` 을 **OS 의 MIME 레지스트리**에서 채운다. Windows 에서 `.md` 는 등록이 없는 경우가 흔하고, 그때 값이 비어 `application/octet-stream` 으로 전송된다. `.docx` 도 Office 가 없는 환경에서 같은 결이다. 실기동으로 확인했다.

```
$ curl -X POST /api/admin/documents -F "file=@note.md;type=application/octet-stream"
400 {"code":"BAD_REQUEST","message":"지원하지 않는 문서 형식: application/octet-stream (허용: PDF · TXT · MD · DOCX)"}
```

**매직바이트로 푸는 길은 코드가 이미 배제해 두었다** — `AdminDocumentService.java:45` 주석대로 `txt`·`md` 는 시그니처가 없고 `docx` 는 zip 이라 `PK` 만으로 구분되지 않는다. 그래서 content-type 을 1차로 두고, **형식을 모를 때만** 파일명 확장자를 2차로 본다.

## 이 변경의 진짜 위험은 검사 해제

폴백을 넓게 잡으면 파일명만 바꿔 낸 파일이 통과한다. `image/png` 처럼 **형식을 아는데 목록에 없는** 것까지 확장자를 봐 주면 검사가 사실상 해제된다. 신규 5건 중 3건을 이 방어에 썼고, 세 건 모두 **고치기 전에 이미 통과**해 기준선이 잡힌 상태에서 고쳤다.

| 케이스 | 기대 | 막는 것 |
|---|---|---|
| `설치.exe` as octet-stream | **400** | 폴백이 허용 목록을 넓히는 것 |
| `위장.pdf` as octet-stream + 내용 불일치 | **400** | 매직바이트 우회 (TC-ADMIN-013 재발) |
| `image/png` + `위장.md` 파일명 | **400** | "모르는 형식" 과 "받지 않기로 한 형식" 의 혼동 |

확장자로 형식을 정한 뒤에도 PDF 매직바이트 검사는 그대로 돈다.

거부 메시지도 고쳤다. 형식을 모를 때 content-type 을 되뇌면 "octet-stream 을 지원하지 않는다" 로 읽히는데, 실제로는 **확장자가 목록에 없어서** 막힌 것이다. 판정 근거가 된 쪽을 보여준다.

## 검증

```
$ ./mvnw -B test -Dtest=AdminDocumentFlowTest
고치기 전 : [ERROR] Tests run: 19, Failures: 2   ← .md · .docx 만 실패
고친 뒤   : [INFO]  Tests run: 19, Failures: 0

$ ./mvnw -B clean test
[INFO] Tests run: 172, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS

$ bash scripts/check-case-floor.sh backend
케이스 수(backend) : 실측 172 / 하한 172   OK
```

기존 **TC-ADMIN-012**(이미지 거부) · **TC-ADMIN-013**(가짜 PDF 거부)이 회귀 방어의 핵심이고 둘 다 통과했다. `features.md` 와 `api.md` 에 형식 판정 규칙을 적었다.

## 범위 밖으로 남긴 것

`OpenAiService.uploadDocument(filename, bytes, contentType)` 의 **`contentType` 파라미터가 쓰이지 않는다.** `OpenAiRealService:350-360` 은 폼에 `purpose` 와 `file` 만 넣고 OpenAI 가 파일명으로 형식을 추론한다. 이 변경과 무관한 기존 미사용 파라미터라 건드리지 않았다.

## merge 시 주의

`scripts/case-floors.env` 의 `BACKEND_MIN` 을 172 로 올렸다. [#41](https://github.com/changs0124/rag-chatbot/pull/41) 도 같은 줄을 172 로 올린다 — **두 PR 이 같은 줄에서 충돌한다.** 둘 다 들어가면 실측이 **177** 이 되므로 통합 시 그 값으로 맞춰야 한다.
