# Current Sprint

여기에는 **아직 안 끝난 것만** 둔다. 끝난 일의 경위는 [CHANGELOG](../06_changelog/CHANGELOG.md) 가 정본이다.
아직 착수하지 않은 항목은 [backlog.md](./backlog.md), 진행 중인 이슈는 GitHub Issues 에 있다.

## 지켜보는 것

다시 보이면 횟수를 더하고, 잦아지면 이슈로 올린다. 실 응답의 모델 변동은 [live-integration](../01_specs/live-integration.md) 「3-3. 지켜보는 응답 변동」 에 둔다.

- **CI 콜드 실행 지연** : 프론트 `AdminPage.test`(#513 뒤 `AdminUsersPage.test`) 「일회용 비밀번호 창은 배경 클릭으로 닫히지 않고 Esc · 닫기로 닫힌다」가 CI 에서 한 번 실패했다(10-26 PR #496, 문서만 바꾼 브랜치 · 재실행 통과 · 1040ms). #482 가 고친 `MessageListLazy` 와 같은 콜드 실행 지연으로 보인다.
- **Cloudflare 502** : cloudflared `malformed MIME header line ":"` 로 battery 에서 1회 났다 — 7일 로그 중 1건, 재현 0/10(10-23) — #515 와 같은 헤더 경합으로 보인다(같은 Tomcat 헤더 목록이 깨진 모양).
