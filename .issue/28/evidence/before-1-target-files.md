# before : 감사 대상 4개 파일의 상태

```
  348 docs/02_architecture/backend.md
  177 docs/02_architecture/frontend.md
  119 docs/CONVENTIONS.md
  546 docs/01_specs/features.md
 1190 total
```

## 이슈가 지목한 네 자리

```
[계층 혼재]
48:  주면 프론트는 그대로 노출한다. 위 필터 단계 오류는 이 형태가 아니다.
92:  `CorsConfig` 의 **노출 헤더 등록이 빠지면 브라우저가 값을 숨겨 조용히 아무 일도 일어나지 않으므로**
251:| `ALLOWED_ORIGINS` | 기동은 되지만 **브라우저가 모든 API 호출을 CORS 로 차단**해 화면이 전부 실패 |
169:2. 백엔드의 `ALLOWED_ORIGINS` 에 Vercel 도메인을 넣는다. 안 넣으면 브라우저가 모든 호출을 CORS 로 막는다.

[거짓 전칭]
docs/CONVENTIONS.md:73:- 엔드포인트는 `lib/endpoints.ts`에 **한 줄짜리 함수**로 노출한다.

[과대 서술]
74:  기대기만 하면 조용히 깨지므로 케이스로 잠가 두었다.
```
