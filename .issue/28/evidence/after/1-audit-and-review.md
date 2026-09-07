# after : 고친 자리와 근거

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
