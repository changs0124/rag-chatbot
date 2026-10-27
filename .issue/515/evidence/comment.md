## 작업 요약

원인을 찾았습니다. **Spring Security 가 보안 헤더를 쓰는 시점**이 문제였습니다. 기본값은 컨트롤러가 돌아온 *뒤* 요청 스레드에서 헤더를 씁니다. SSE 는 그 순간 스트림 스레드가 이미 meta 를 쓰며 응답을 커밋하고 있을 수 있어서, 두 스레드가 Tomcat 헤더 목록을 동시에 고쳤습니다. 수정 : 보안 헤더를 체인 *앞에서* 쓰고, 커밋이 깨져도 요청을 바로 끝냅니다.

## 원인을 좁힌 근거

| 관찰 | 뜻 |
| --- | --- |
| conc8 시작 02:55:47Z, 타임아웃 03:05:46.654Z − 600초 = 02:55:46.65Z | `prepare` 는 즉시 끝났다(비동기 시작이 늦지 않음) → 1b(DB 잠금) 배제 |
| 같은 사용자(qa-h03)의 2턴이 126초에 **200** | 사용자당 동시 1 이므로 1턴의 스트림 작업은 그 전에 **끝나 자리를 반납**했다 → 1a(풀 대기) 배제 |
| 타임아웃 시 NPE 위치가 `Http11Processor.prepareResponse`(`MimeHeaders.setValue`) | 600초 동안 응답이 **한 번도 커밋되지 않았다** |
| 질문 미저장 · 오류 답 없음 | `sendQuietly` 가 meta 실패를 끊김으로 흡수 → #489 질문 철회 경로 |
| Spring 7.0.9 · Security 7.1.1 바이트코드 | SSE 경로는 헤더를 미리 flush 하지 않음 · `HeaderWriterFilter` 는 체인 뒤 `writeHeaders()` 를 동기화 없이 호출 · 커밋 감지 쪽도 같은 메서드를 스트림 스레드에서 호출 |

정리 : meta 커밋이 헤더 경합으로 NPE → 끊김으로 오판해 질문 철회 → `complete()` 도 같은 flush 에서 던져 `DeferredResult` 가 끝나지 않음 → 10분 타임아웃(Cloudflare 는 100초 뒤 524). 10-23 Cloudflare 502 「malformed MIME header」 1회도 같은 경합으로 봅니다.

## 변경 파일

- `config/SecurityConfig.java` — `HeaderWriterFilter.setShouldWriteHeadersEagerly(true)` (근본 수정)
- `service/ChatService.java` — `completeQuietly` 가 `complete` 실패 시 `completeWithError` 로 요청 종료 · 전송 실패의 원인이 I/O 도 닫힌 emitter 도 아니면 WARN(지금까지 조용히 흡수됨)
- 테스트 3건 — `SecurityHeadersEagerTest`(보안 헤더가 컨트롤러 전에 쓰여 있음) · `ChatStreamAbortTest` 2건(커밋 실패에도 요청 종료 · 끊김 판정)
- `backend.md` 「채팅 SSE 계약」 · CHANGELOG `[Unreleased]` · current-sprint · 하한 410 → 413

## 검증

| 항목 | 전 | 후 |
| --- | ---: | ---: |
| `SecurityHeadersEagerTest` | **실패** (`expected "nosniff" but was null`) | 통과 |
| 전체 `mvnw verify` | — | **413 / 413** |
| 로컬 목업 부하 : 멈춤(30초 무응답) | 0 / 432 | 0 / 1,296 |
| 첫 이벤트까지 p50 / p95 / max (ms) | 16 / 31~62 / 93 | 16 / 31~125 / 141 |
| 문서 검사 `check-all.sh docs` | — | 통과 |

부하 : 동시 16 × 3턴 × 3라운드, 25% 는 헤더 · meta · 첫 토큰에서 끊음. 3회(전) · 새 컨테이너 3번 × 3회(후). 원본은 `.issue/515/evidence/`.

**로컬에서는 수정 전에도 재현되지 않았습니다** — 경합 창이 아주 좁습니다. 그래서 회귀 테스트는 경합 자체가 아니라 그 전제(헤더를 *언제* 쓰는가)를 고정합니다. 실제 효과는 백엔드 배포 뒤 운영 동시 시험에서 524 · 새 WARN 0 으로 확인해야 합니다. after 의 max 가 조금 높은 것은 각 컨테이너 첫 실행(JVM 예열) 값입니다.

## 남은 이슈

- 배포 뒤 운영 동시 시험(524 · 「끊김이 아닌 예외」 WARN 0)
- **범위 밖 · 기존 문제** : 스트림을 끊으면 가끔(약 400요청에 0~3건) Tomcat 이 에러 페이지를 INCLUDE 디스패치로 부르고, 보안 설정이 INCLUDE 를 허용하지 않아 `AuthorizationDeniedException` ERROR 2줄이 남습니다. 수정 전 이미지에서도 같았습니다(새 컨테이너 기준 전 1건 · 후 0~3건). 사용자 영향은 없고 로그 잡음입니다 — 따로 이슈로 올릴지 정해야 합니다
