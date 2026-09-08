## 결론

**"재검토" 라고 적힌 세 곳을 "지원 종료" 라는 사실로 바꿨다.** 실제 업그레이드는 [#48](https://github.com/changs0124/rag-chatbot/issues/48).

## 하나의 사실이 세 문서에 흩어져 같이 낡아 있었다

```text
docs/04_tasks/backlog.md:12       - [ ] Spring Boot 3.5.16 업그레이드 재검토 (OSS EOL 트랙)
docs/01_specs/requirements.md:143 - **Spring Boot 3.5.16은 OSS EOL 트랙** — 업그레이드 재검토가 필요하다.
docs/02_architecture/overview.md:158 - **Spring Boot 3.5.16** 은 OSS EOL 트랙이다. 업그레이드 재검토가 필요하다.
```

셋 다 날짜도 근거도 없이 **"재검토"** 다. **어느 하나만 읽어도 "아직 여유가 있다" 고 판단하게 되므로 셋을 함께 고쳤다.**

## 실제 상황

- 3.5 브랜치의 OSS 지원은 **2026-06-30 종료**
- `backend/pom.xml:11` 이 문 **`3.5.16` 이 마지막 무상 패치**다 — 2026-06-25 릴리스, EOL 5일 전. `3.5.17` 은 나오지 않고 앞으로도 나오지 않는다
- 오늘 기준 **약 2개월 반 경과**
- 이 버전은 올렸다가 남은 게 아니다. **최초 스캐폴드(`5c5b05d`)부터 3.5.16 이었다**

## 실측 대조

| 검사 | 변경 전 | 변경 후 |
|------|---------|---------|
| `grep -rln "2026-06-30" docs/` | **0건** | **4건** — `backlog` · `requirements` · `overview` · `CHANGELOG` |
| `bash scripts/check-doc-refs.sh` | 통과 | 통과 (참조 201건 · 실재 194건) |

`grep "재검토"` 는 3건 → 1건이 되는데, **남은 1건은 거짓 서술이 아니라 새로 쓴 문장 자체**다(`"재검토 단계가 아니라 기한 경과다"`). 그래서 이 grep 은 이제 판정에 쓸 수 없고, 판정은 위 표의 날짜 실재 건수로 한다.

## 위험을 어떻게 적었는가

**"이미 막혔다" 가 아니라 "막히는 시점을 우리가 못 고른다" 로 적었다.** `deps (백엔드 의존성 취약점)` 잡은 지금 통과하고 있다([#46](https://github.com/changs0124/rag-chatbot/pull/46) CI 10/10). 다만 3.5.x 에 새 CVE 가 공개되면 올릴 버전이 Maven Central 에 없어 고칠 방법 없이 막히고, 그 시점을 정하는 것은 외부다.

`scripts/check-runtime-versions.sh` 는 확인해 보니 **`java.version`(17) 만 검사하고 Spring Boot 버전은 보지 않는다.** 이 게이트는 영향 없다.

## 우선순위를 올렸다

**「보통」 → 「높은 우선순위」.** 기존 상위 둘(OpenAI 실 연동 · Vector Store 구축)은 **실 OpenAI 키가 없어 지금 손댈 수 없는** 항목이다. 반면 이건 막힌 것이 없고, 시점을 우리가 고를 수 없는 유일한 항목이다.

## 손대지 않은 곳

`backend.md:3` · `INDEX.md:12` · `overview.md:12`(mermaid) · `README.md:12` 는 **버전만 적었고 지원 상태를 주장하지 않는다.** `3.5.16` 은 여전히 사실이라 그대로 뒀다.

## 완료 기준 대조

- [x] `backlog.md` 가 "재검토" 가 아니라 "지원 종료 상태" 로 갱신 — 2026-06-30 · 마지막 패치 · 권장 경로(4.1) 명시
- [x] 우선순위 재배치 판단·반영 — 「보통」 → 「높은 우선순위」, 근거 포함
- [x] `deps` CI 잡이 이 상태에서 어떻게 되는지 기록
- [x] 근거 링크 — <https://www.danvega.dev/blog/spring-boot-end-of-life>
- [x] 실제 업그레이드가 범위 밖(#48)임을 항목에 명시

## 증거

- [변경 전 문서 서술](../blob/main/.issue/47/evidence/before/현재문서-서술.md)
- [변경 후 문서 서술](../blob/main/.issue/47/evidence/after/변경후-서술.md)
