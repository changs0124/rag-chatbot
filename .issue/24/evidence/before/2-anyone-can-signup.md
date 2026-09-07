# before-2 : URL 을 아는 누구나 계정을 만든다

```
$ curl -X POST /api/auth/signup  {"email":"outsider@gmail.com","password":"...","name":"Outsider"}
{token=<JWT>, "user": {"id": "9d3d2301-6f0e-4f42-883a-ee6a0e98ffb4", "email": "outsider@gmail.com", "name": "Outsider", "theme": "system", "role": "user"}}

$ curl -X POST /api/auth/signup  {"email":"admin@corp.com","password":"...","name":"Admin"}
{token=<JWT>, "user": {"id": "5ff8aa2a-b192-4a8d-adfa-a3c008a3b95e", "email": "admin@corp.com", "name": "Admin", "theme": "system", "role": "admin"}}

$ select email, role from users
outsider@gmail.com | user
admin@corp.com | admin
```

`ALLOWED_EMAIL_DOMAINS` 가 비어 있어(mock 기본값) **사외 주소가 그대로 통과한다.**
그리고 관리자는 **명단에 있는 주소로 스스로 가입해야** 생긴다 — 지금의 부트스트랩 경로가 가입이다.
