# before-3 : 프론트는 백엔드 필드가 늘어도 초록이다

`RagDocument` 에 **필수** 필드 `uploadedByEmail` 을 추가한 상태.

```
$ npm run build
✓ built in 304ms

$ npx vitest run
 Test Files  13 passed (13)
      Tests  74 passed (74)
```

`tsconfig.app.json:26` 이 `src/**/*.test.tsx` 를 exclude 하고 vitest 는 타입을 보지 않아
`doc()` 픽스처가 어느 게이트도 거치지 않는다. 이슈의 「영원히 초록」은 사실이었다.
