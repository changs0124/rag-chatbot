## 작업 리포트 — 기본 모델 gpt-6-sol

| 지표 | 전 | 후 |
| --- | ---: | ---: |
| 이력(CHANGELOG) 밖 `gpt-4o` 가 있는 파일 | 20 | **0** |
| `application.yml` 기본값 | `gpt-4o` | `gpt-6-sol` |

- 운영은 env 로 이미 sol — 동작 영향 없음. env 를 빠뜨렸을 때만 달라진다(이제 운영과 같은 모델)
- 함께 바꾼 곳 : `.env.example` · `OpenAiRealService` javadoc · README · INDEX · overview(「노후 라인」 제약 → 「계열을 바꾸면 QA 를 다시 잰다」) · live-integration · 테스트 15곳의 모델명 문자열
- `./mvnw clean verify` 통과 · 문서 게이트 통과. 원본 `.issue/304/evidence/{before,after}/grep.txt`
