## 작업 요약
- `MessageList.tsx` 의 `Markdown` 을 `React.lazy(() => import('./Markdown'))` 로 바꾸고, 답변 자리를 `<Suspense>` 로 감쌌다. fallback 은 같은 글을 평문(`whitespace-pre-wrap break-words`)으로 보인다.
- `MessageBubble` 의 `memo`(#405)는 그대로다.
- 테스트: 첫 렌더가 평문 fallback 이라 서식을 확인하는 단언 앞에 `findBy*` 를 붙였다(단언은 약화하지 않음). 청크 도착 전 평문 → 도착 후 서식 전환을 보는 테스트 1건을 `MessageListLazy.test.tsx` 에 추가했다(React.lazy 는 한 번 해석되면 파일 안에서 계속 해석된 채라 파일을 나눔).

## 변경 전후
| 청크 | 전 (raw / gzip) | 후 (raw / gzip) |
|---|---|---|
| 엔트리 `index-*.js` | 468.32 kB / 147.38 kB | 292.31 kB / 92.76 kB |
| `Markdown-*.js` (신규) | - | 175.89 kB / 53.86 kB |
| `index-*.css` | 78.56 kB / 22.23 kB | 78.56 kB / 22.23 kB |

엔트리 청크 gzip -54.62 kB (-37%). 합계는 거의 같고(+1.24 kB), 로그인 화면이 받는 양만 줄었다.

## 검증
- `npm run lint` 통과 · `npm test` 196 통과(기존 195 + 1) · `npm run build` 통과
- `scripts/case-floors.env` FRONTEND_MIN 195 → 196
- 빌드 산출물 전후: `.issue/417/evidence/{before,after}/build.txt`

## 변경 파일
- `frontend/src/components/chat/MessageList.tsx`
- `frontend/src/components/chat/MessageList.test.tsx`, `MessageListRender.test.tsx`, `MessageListLazy.test.tsx`(신규)
- `scripts/case-floors.env`, `docs/02_architecture/frontend.md`, `docs/06_changelog/CHANGELOG.md`

## 남은 이슈
- 첫 답변이 그려질 때 청크를 처음 받으므로 그 순간 평문 → 서식 전환이 한 번 보일 수 있다(이후 캐시). 필요하면 로그인 후 유휴 시간에 미리 받는 방안은 별도 이슈.
