## 무엇을 했나

**계정이 태어나는 자리를 회원가입에서 관리자 발급으로 옮겼다.** 로그인 화면의 가입 토글을 지우고, 관리 화면에 계정 추가 폼을 넣고, `POST /api/auth/signup` 을 라우트와 `permitAll` 양쪽에서 걷었다.

## 이슈에 없던 막힘을 먼저 찾았다

`AdminRoleSynchronizer` 는 **이미 있는 계정의 역할만** 바꾼다. 그 한계를 자기 Javadoc 이 적고 있었다.

> 명단에 있으나 아직 가입하지 않은 이메일은 아무 일도 하지 않는다 - 가입 시점에 `AuthService` 가 같은 명단을 보고 역할을 정한다.

빈 워크트리에서 실제로 띄워 확인했다.

```
관리자 명단 동기화 : 명단 1건 · 승격 0건 · 강등 0건
0 users, 0 admins
POST /api/admin/users -> 401
```

**가입을 없애면 `AuthService.signup()` 의 `adminEmails.contains(email) ? "admin" : "user"` 가 사라진다.** 그러면 빈 DB 에서 관리자가 영영 0명이고, 발급 API 는 관리자만 부를 수 있으므로 아무도 첫 계정을 만들지 못한다. 이슈의 완료 조건 3번이 정확히 이 지점을 요구하는데 방법은 적혀 있지 않았다.

그래서 **기동 러너가 계정째로 만든다.** 임시 비밀번호는 기동 로그에 한 번만 찍고 저장하지 않는다.

## 완료 조건 3번을 실제로 돌렸다

비어 있는 DB 로 기동해 끝까지 갔다.

```
관리자 계정 발급 : admin@corp.com · 임시 비밀번호 <임시 비밀번호> (최초 로그인 후 마이페이지에서 변경할 것)
관리자 명단 동기화 : 명단 1건 · 생성 1건 · 승격 0건 · 강등 0건

$ POST /api/auth/login   admin@corp.com / <임시 비밀번호>      → 200
$ POST /api/admin/users  {"email":"newbie@corp.com",...}      → 201  {temporaryPassword=<임시 비밀번호>}
$ POST /api/auth/login   newbie@corp.com / <임시 비밀번호>     → 200
$ POST /api/auth/signup  {...}                                 → 401
```

마지막 줄이 **404 가 아니라 401 인 것이 요점**이다. 컨트롤러에서만 지우고 `SecurityConfig` 의 `permitAll` 에 남겨 두면 필터를 통과해 404 가 된다. 401 은 두 곳 모두에서 사라졌다는 뜻이고, 케이스로도 고정했다(`AuthFlowTest.signup_endpoint_is_gone`).

남은 계정은 이렇다. **발급자가 관리자여도 받는 쪽은 일반 사용자**다 — `ADMIN_EMAILS` 명단에 있을 때만 관리자가 된다.

```
admin@corp.com  | admin     ← 기동 러너가 만듦
newbie@corp.com | user      ← 관리자가 발급
```

## 화면

**로그인 화면** — 가입 진입점이 사라지고 그 자리에 발급 안내가 들어간다. 진입점만 지우면 사용자는 어디로 가야 할지 모른 채 멈춘다.

| before | after |
|---|---|
| [before — 가입 토글](https://github.com/changs0124/rag-chatbot/blob/main/.issue/24/evidence/before/login-signup-toggle.webp) | [after — 발급 안내](https://github.com/changs0124/rag-chatbot/blob/main/.issue/24/evidence/after/login-no-signup.webp) |

**관리 화면 사용자 구역** — 계정 추가 폼이 생긴다. 계정이 태어나는 유일한 자리다.

> 저장소가 private 이라 `raw.githubusercontent.com` 이 인증 없이는 404 를 돌려준다. 이미지를 코멘트에 직접 박지 못해 **저장소 안 파일 링크**로 건다 — 로그인한 상태에서 열린다.

| before | after |
|---|---|
| [before — 추가 수단 없음](https://github.com/changs0124/rag-chatbot/blob/main/.issue/24/evidence/before/admin-users-section.webp) | [after — 계정 추가 폼](https://github.com/changs0124/rag-chatbot/blob/main/.issue/24/evidence/after/admin-create-account.webp) |

## 착수 전에 정한 것 두 가지

**테스트 하네스** — 이 작업의 가장 큰 조각이었다. `AbstractPgIntegrationTest.signup()` 을 16개 파일이 쓰고 있었다. `createUser()` 로 이름을 바꾸고 **내부를 실제 발급 경로로** 돌렸다 : 관리자로 로그인 → 발급 API → 임시 비밀번호로 다시 로그인. DB 직접 삽입이 빠르지만 그러면 16개 파일이 새 발급 로직을 **한 번도 밟지 않는다.** 뿌리 관리자(`root@rag.test`)의 계정 자체는 기동 러너가 만들고, 테스트는 그 비밀번호만 아는 값으로 덮는다.

**`SignupPolicy`** — 없애지 않고 `EmailDomainPolicy` 로 이름을 바꿔 발급 경로에 그대로 걸었다. 관리자가 주소를 손으로 치므로 오타 한 번이면 사외 주소에 계정이 열린다. `live` fail-fast 도 그대로다.

## 기각한 대안 (부트스트랩)

- **`ADMIN_BOOTSTRAP_PASSWORD` 환경변수** — 값을 바꾸지 않으면 계속 유효한 비밀번호로 남고, 변수 하나에 문서 네 곳이 같이 는다
- **Flyway 시드** — 해시가 저장소에 박혀 모든 배포가 같은 초기 비밀번호를 갖는다
- **`signup` 을 관리자에게만 남기기** — 이슈의 목표와 정면으로 부딪힌다

## 기록된 결정을 뒤집었다

`features.md` 에 「가입 자체를 닫기 | **기각**」(2026-08-19)이 적혀 있었다. 기각 사유는 "관리자가 계정을 일일이 발급해야 해 운영 부담이 선형으로 는다"였다.

**무엇이 바뀌었나** : 그 사이 FEAT-ADMIN-003 이 임시 비밀번호 생성·1회 반환·기존 토큰 무효화를 갖췄고 관리 화면에 사용자 목록도 이미 있었다. 발급에 새로 든 것은 **폼 하나와 엔드포인트 하나**다. 반대편에서는 도메인 제한만으로 부족하다는 것이 드러났다 — 같은 도메인 안이면 퇴사자를 포함해 누구든 스스로 계정을 만들 수 있었다.

뒤집는 근거를 `features.md` 본문에도 남겼다. 남기지 않으면 다음 사람이 옛 표만 보고 되돌린다.

## 검증

```
backend   ./mvnw clean verify   Tests run: 167, Failures: 0, Errors: 0   BUILD SUCCESS
frontend  vitest 76/76 · oxlint 통과 · tsc + build 통과
게이트     check-case-floor backend 167/167 · check-response-contract 4곳 일치
          check-doc-refs 184건 통과
문서       현재형으로 회원가입을 서술하는 곳 0건 (과거 이력은 그대로 둠)
```

`BACKEND_MIN` 165 → 167 · `FRONTEND_MIN` 74 → 76. 문서는 10곳을 손봤다.

## 감수하는 약점

- 임시 비밀번호 전달 구간이 제품 밖이다(사내 메신저 등). FEAT-ADMIN-003 이 이미 안고 있던 약점과 같다
- **첫 관리자의 임시 비밀번호가 기동 로그에 남는다.** 로그 수집기를 붙이면 그쪽으로도 간다. 위 두 대안은 각각 더 나빴다
- 부트스트랩 계정의 이름이 이메일과 같다. 기동 시점에 사람 이름을 알 방법이 없어서이고, 마이페이지에서 바꿀 수 있다
