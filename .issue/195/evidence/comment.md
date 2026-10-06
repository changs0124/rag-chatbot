## 작업 요약

2026-10-06 공개된 권고 둘 때문에 CI `deps (프론트 의존성 취약점)` 잡이 열린 PR 전부에서 실패하던 것을 고쳤습니다.
`npm audit fix`(force 없이)로 **패치 버전만** 올렸고, `package.json` 범위 안이라 **lock 파일만** 바뀌었습니다. 커밋 `cbc16a2`

## 전후

| 패키지 | 전 | 후 | 권고 |
| --- | --- | --- | --- |
| `source-map-js` | 1.2.1 | **1.2.2** | high · GHSA-68fv-2mgg-jv7q |
| `vitest` · `@vitest/mocker` | 4.1.10 | **4.1.11** | moderate · GHSA-82fw-gwwq-j7x9 |
| `npm audit --audit-level=high` | 3건 (high 1) · exit 1 | **0건 · exit 0** | |

원본 : [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/195/evidence/before/npm-audit.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/195/evidence/after/npm-audit.txt). 화면·API 변경이 없어 캡처는 생략했습니다.

## 영향

- 두 패키지 모두 postcss · Tailwind · vitest 를 거치는 **빌드·테스트 도구 의존**이라 배포 번들(`dist/`)에 실리지 않습니다(빌드 결과에서 0건 확인). 사용자 화면에 닿는 위험은 아니었습니다

## 검증

- `oxlint` · `vite build` · vitest **115/115** · 케이스 하한 115/115 통과

## 남은 이슈

- 없음. 머지 후 #194 · #190 PR 을 main 위로 올리면 deps 잡이 초록이 됩니다
