# before — 변경 전 원문 (커밋 d58d578)

## docs/01_specs/live-integration.md §1 준비물 (28-51)
```markdown
## 1. 준비물

| 준비물 | 환경변수 | 없으면 생기는 일 |
|--------|----------|------------------|
| OpenAI API 키 | `OPENAI_API_KEY` | `APP_MODE=live` 기동 즉시 실패(fail-fast). per-request 401로 흐르지 않는다 |
| 공용 Vector Store ID | `OPENAI_VECTOR_STORE_ID` | 기동·응답은 되지만 `file_search` 툴을 아예 붙이지 않아 **출처가 항상 0건**이 된다 |
| 모델 이름 | `OPENAI_MODEL` | 미지정 시 `gpt-4o`. 비전 입력을 쓰므로 **이미지 지원 모델이어야 한다** |
| 실행 모드 | `APP_MODE=live` | 미설정이면 `AppModeGuard`가 기동을 막는다(의도된 설계) |
| **계정 허용 도메인** | `ALLOWED_EMAIL_DOMAINS` | **기동 즉시 실패**(FEAT-AUTH-001). 비면 관리자의 오타 한 번으로 사외 주소에 계정이 열리므로, 조용히 열리지 않도록 일부러 막는다 |
| 관리자 이메일 명단 | `ADMIN_EMAILS` | 관리자가 0명이 되어 **문서를 등록할 사람이 없다.** 기동은 정상이라 5절 단계에서야 드러난다 |

전량은 `backend/.env.example` 에 이름만 적혀 있다. 값은 저장소에 넣지 않는다.

**기동을 막는 것은 셋이다** — `APP_MODE` · `OPENAI_API_KEY` · `ALLOWED_EMAIL_DOMAINS`(+ `JWT_SECRET`).
나머지는 기동은 되고 **나중에 증상으로 드러나므로** 더 찾기 어렵다 :

| 빠뜨린 것 | 드러나는 시점 | 증상 |
|-----------|--------------|------|
| `OPENAI_VECTOR_STORE_ID` | 2-3 | 답변은 되는데 출처가 늘 0건 → 전부 "자료 없음" |
| `ADMIN_EMAILS` | 5 | 관리 화면에 들어갈 사람이 없어 문서를 못 올린다 |
| `OPENAI_MODEL` (비전 미지원으로 바꾼 경우) | 2-5 | 이미지 첨부만 답변이 어긋난다 |

**`ADMIN_EMAILS` 의 주소는 `ALLOWED_EMAIL_DOMAINS` 밖이어도 된다.** 도메인 검사를 면제받으므로
관리자 이메일이 사내 도메인이 아니어도 부트스트랩이 막히지 않는다.
```

## docs/01_specs/live-integration.md §2 투입 절차 (53-93)
```markdown
## 2. 투입 절차

각 단계는 **다음 단계로 넘어가기 전에 확인할 것**을 함께 적는다. 확인 없이 다음으로 넘어가면
실패했을 때 어느 단계가 원인인지 분리되지 않는다.

### 2-1. Vector Store를 만들고 문서 1건만 넣는다

처음부터 전량을 올리지 않는다. **문서 1건**이면 3절의 가정이 전부 드러난다.

- 확인 : Vector Store의 파일 상태가 `completed` 인지 본다. `in_progress` 로 멈춰 있으면 파싱 단계에서
  막힌 것이라 아래 단계가 전부 무의미하다.

### 2-2. 백엔드를 `APP_MODE=live` 로 띄운다

- 확인 : 기동이 성공한다. **키나 계정 허용 도메인이 비면 여기서 즉시 실패**하므로, 기동됐다는 것
  자체가 그 둘이 들어갔다는 근거다.
- 확인 : 기동 로그의 `관리자 명단 동기화` 줄을 본다. 명단 건수가 0이면 `ADMIN_EMAILS` 를 빠뜨린
  것이고, 그대로 두면 5절에서 문서를 올릴 사람이 없다.

### 2-3. 2-1에서 넣은 문서의 내용을 묻는다

- 확인 ① : 답변 토큰이 **흘러서** 온다(한 번에 뭉쳐 오지 않는다). 뭉쳐 오면 스트리밍이 아니라
  버퍼링된 것이므로 `RestClient` 응답 처리를 봐야 한다.
- 확인 ② : 진행 단계에 **「참조 문서 검색 중」** 이 뜬다. 안 뜨면 `file_search` 호출 이벤트가
  도착하지 않은 것이다(3절 가정 A).
- 확인 ③ : 답변 하단에 **출처 각주가 뜬다**. 각주가 없고 「자료 없음」 배너가 뜨면 인용 추출이
  실패한 것이다(3절 가정 B·C).

### 2-4. 자료에 없는 것을 묻는다

- 확인 : 「자료 없음 - 관련 자료를 찾지 못해 추론으로 답변함」 배너가 뜬다. 2-3과 2-4가 **모두**
  기대대로 나와야 무자료 판정이 동작하는 것이다. 한쪽만 보면 "항상 0건"과 구분되지 않는다.

### 2-5. 이미지를 첨부해 묻는다

- 확인 : 이미지 내용을 반영한 답변이 온다. `OPENAI_MODEL` 을 비전 미지원 모델로 바꿨다면 여기서 드러난다.

### 2-6. 전량 업로드

2-1~2-5가 전부 통과한 뒤에 문서를 전량 올린다. 이 시점부터는 저장 용량 과금이 시작된다.

```

## docs/INDEX.md 실행 (20-31)
```markdown
## 실행

```bash
# 백엔드 (backend/.env.example 참고 — APP_MODE, JWT_SECRET 필수)
cd backend && ./mvnw spring-boot:run     # http://localhost:8080

# 프론트 (frontend/.env.example 참고)
cd frontend && npm ci && npm run dev     # http://localhost:5173
```

`APP_MODE`는 기본값이 없다. 미설정이면 `AppModeGuard`가 기동을 막는다 — 목업이 우연히 켜지는 경로를 없애기 위한 의도적 설계다.

```

## docs/02_architecture/backend.md 데모 (322,325-331)
```markdown
### 데모 - 로컬 + 터널

프론트는 Vercel(https)에 있고 백엔드는 로컬이므로 `http://공인IP:8080` 직결은 성립하지 않는다 —
https 페이지가 http 를 부르면 브라우저가 mixed content 로 막는다. 터널이 https 종단을 대신 맡는다.

1. 백엔드를 평소대로 띄운다(`./mvnw spring-boot:run`, `:8080`)
2. 터널을 연다 — `ngrok http 8080` 또는 `cloudflared tunnel --url http://localhost:8080`
3. 백엔드 `ALLOWED_ORIGINS` 에 **Vercel 도메인**을 넣는다. 터널 주소가 아니다 —
   이 값은 백엔드의 공개 주소가 아니라 **요청을 보내는 화면의 출처**다
4. Vercel `VITE_API_BASE_URL` 에 **터널 주소**를 넣고 재배포한다
```

## 링크 수
```
$ grep -c '](\|http' docs/01_specs/live-integration.md
0
```
