# after-1 : 빈 DB → 부트스트랩 → 발급 → 로그인 (완료 조건 3)

`ADMIN_EMAILS=admin@corp.com` 하나만 주고 **비어 있는 DB** 로 기동했다.

## 1. 기동 로그

```
관리자 계정 발급 : admin@corp.com · 임시 비밀번호 <임시 비밀번호> (최초 로그인 후 마이페이지에서 변경할 것)
관리자 명단 동기화 : 명단 1건 · 생성 1건 · 승격 0건 · 강등 0건
```

before 에서는 같은 조건에 **승격 0건**이었다 — 계정이 없어 아무 일도 하지 않았다. 이제 **생성 1건**이다.

## 2. 그 임시 비밀번호로 관리자 로그인 → 계정 발급

```
$ curl -X POST /api/auth/login  {"email":"admin@corp.com",password=<임시 비밀번호>}
200  (token 발급)

$ curl -X POST /api/admin/users -H 'Authorization: Bearer ...' \
       -d '{"email":"newbie@corp.com","name":"Newbie"}'
201
{temporaryPassword=<임시 비밀번호>}
```

## 3. 발급받은 사람이 로그인

```
$ curl -X POST /api/auth/login  {"email":"newbie@corp.com",password=<임시 비밀번호>}
login(newbie) -> 200
```

## 4. 스스로 가입하는 길은 없다

```
$ curl -X POST /api/auth/signup  {"email":"self@corp.com",...}
POST /api/auth/signup -> 401
```

**404 가 아니라 401 인 것이 요점이다.** 컨트롤러에서만 지우고 `SecurityConfig` 의 permitAll 에
남겨 두면 필터를 통과해 404 가 된다. 401 이라는 것은 **두 곳 모두에서 사라졌다**는 뜻이다.

## 5. 남은 계정

```
admin@corp.com   | admin
newbie@corp.com  | user
```

위는 기동 러너가 만들었고, 아래는 관리자가 발급했다. **발급자가 관리자여도 받는 쪽은 일반 사용자**다 —
`ADMIN_EMAILS` 명단에 있을 때만 관리자가 된다.
