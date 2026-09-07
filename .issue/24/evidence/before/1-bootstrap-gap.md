# before-1 : 빈 DB 에서 관리자가 태어나지 않는다

`ADMIN_EMAILS=admin@corp.com` 하나만 주고 빈 DB 로 기동.

```
$ grep AdminRoleSynchronizer <기동 로그>
AdminRoleSynchronizer : 관리자 명단 동기화 : 명단 1건 · 승격 0건 · 강등 0건

$ select count(*), count(*) filter (where role='admin') from users
0 users, 0 admins
```

명단에 1건이 있는데 **승격 0건**이다. `AdminRoleSynchronizer` 는 이미 있는 계정의 역할만 바꾸고,
계정을 만들지는 않기 때문이다. 그 자리를 지금은 `AuthService.signup()` 의
`adminEmails.contains(email) ? "admin" : "user"` 가 메우고 있다 — **가입을 없애면 사라지는 자리다.**
