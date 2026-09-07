## 무엇을 했나

이슈가 지목한 네 자리를 고치고, 대상 4개 파일을 **파일 단위로 한 번씩 훑어** 같은 유형을 더 찾았다.
그리고 **검토를 다른 눈에 맡겼다** — 이 문서들 상당 부분을 오늘 내가 썼기 때문이다.

## 이슈가 지목한 네 자리

| 유형 | 조치 | 근거 |
|---|---|---|
| 계층 혼재 | `backend.md` 의 「프론트는 그대로 노출한다」 → 「사용자에게 보일 것을 전제로 쓴다」 | 주어를 이 문서가 통제하는 것(우리가 쓰는 `message`)으로 되돌림 |
| 거짓 전칭 | 「한 줄짜리 함수」 → 내포 판별. 사본 두 곳 | `uploadFile` · `uploadDocument` · `streamChat` 이 반례 |
| 표의 누락 | `features.md` 예외표에 6번째 상태 | `AdminDocumentService` 에 `@Transactional` 없음 → insert 는 커밋, 재조회 실패 시 500 |
| 과대 서술 | `GlobalExceptionFallbackTest` 가 잠그는 것을 열거하고 미측정 사실을 명시 | 그 파일의 케이스 4개는 도메인 예외까지만 |

## 훑기가 찾은 것 (이슈에 없음)

```
$ grep -n "화면이 3개뿐" docs/02_architecture/frontend.md   # 같은 파일 15줄 위 라우트 표에는 넷
$ grep -n "path=" frontend/src/App.tsx | wc -l              # 4 (+ 와일드카드)

$ grep -rn "userRepository.insert" backend/src/main/java/    # 2곳 - 발급 API 와 기동 러너
  backend.md 는 "발급은 POST /api/admin/users 뿐" 이라고 적고 있었다
```

## 외부 검토가 잡은 것 — 13건 전부 사실이었다

**그중 셋은 이 감사가 새로 만든 거짓이다.**

```
$ grep -n "allowed-origins" backend/src/main/resources/application.yml backend/src/main/java/com/ragchatbot/config/CorsConfig.java
application.yml:57:    allowed-origins: ${ALLOWED_ORIGINS:http://localhost:5173}
CorsConfig.java:23:  @Value("${app.cors.allowed-origins:http://localhost:5173}")
  -> "허용 출처가 하나도 없어" 는 거짓. 기본값이 하나 남는다

$ grep -n "api" frontend/src/auth/AuthContext.tsx | head -3
41:    api
42:      .get<Me>('/api/auth/me')
50:    const res = await api.post<AuthResponse>('/api/auth/login', …)
  -> "endpoints.ts 한 곳에 모은다" 는 거짓. 모양 주장을 위치 주장으로 바꾸며 범위가 넓어졌다

$ grep -n "^##" docs/02_architecture/frontend.md | grep "데이터"
  (없음)  -> 가리킨 섹션이 존재하지 않는다. check-doc-refs 는 파일 경로만 본다
```

나머지 열 건 중 하나는 **오늘 #24 가 만든 사본 불일치**였다 — 계정 발급에 201 이 붙어
`api.md` 만 「두 곳」으로 갱신되고 `CONVENTIONS.md` · `backend.md` 는 「문서 업로드」에 머물렀다.

```
$ grep -rn "@ResponseStatus(HttpStatus.CREATED)" backend/src/main/java/
AdminController.java:58   (문서 업로드)
AdminController.java:79   (계정 발급)   ← #24 가 더함
```

## 검증

```
참조 수집 187건 · 실재 검사 185건
문서 참조 검사 통과
```

문서만 바뀌므로 `./mvnw` 는 돌리지 않았다.

## 이 이슈의 정지 규칙은 지켰다

「대상 문서 파일 전체를 한 번에 감사하고 닫는다.」 이웃 줄로 범위를 넓히지 않았다.
검토가 지적한 `backend/.env.example` 한 줄만 예외로 고쳤다 — 감사 대상 파일은 아니지만
내가 `backend.md` 에서 걷어낸 것과 **같은 결함**이 그대로 남아 있었고, 알면서 두는 쪽이 더 나빴다.

`check-doc-refs.sh` 가 섹션 이름을 검사하지 않는다는 것은 게이트를 늘리는 일이라 **원인이 다르다.**
`docs/04_tasks/backlog.md` 에 적고 여기서는 닫는다.

## 배운 것

**혼자 채점하면 자기가 방금 쓴 문장은 안 보인다.** 이 감사는 「참이지만 위생이 나쁜 서술」을 고치러
들어가서 **새 거짓 셋을 심었고**, 그 셋은 전부 내가 문장을 *더 정확하게 만들려다* 생겼다 —
모호한 표현을 구체적인 것으로 바꿀 때 그 구체가 코드와 맞는지를 다시 안 봤다.

`#22` · `#23` 에서 열두 라운드를 돌게 한 것과 같은 실패다. 다른 점은 이번엔 **한 번에 잡혔다**는 것이다.
