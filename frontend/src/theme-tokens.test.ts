/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// vitest 는 CSS 를 처리 대상으로 보아 `?raw` 로 가져와도 빈 문자열을 준다 - 파일을 직접 읽는다.
// jsdom 환경의 import.meta.url 은 file: 이 아니라서 vitest 의 실행 위치(frontend/) 기준으로 읽는다
const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf-8')

/**
 * #191 - 화면은 라이트 하나다. 테마 전환을 걷은 뒤 그것이 조용히 되살아나는 길을 막는다.
 *
 * 가장 위험한 것은 `dark:` 다. 종전에는 `data-theme` 에 묶은 커스텀 variant 가 있었는데 지금은 없다.
 * 그러면 Tailwind 4 의 기본 `dark:` 가 살아나고, 그건 **OS 의 prefers-color-scheme 미디어쿼리**다 —
 * 누가 `dark:bg-…` 한 줄을 쓰면 OS 가 다크인 사용자에게만 화면이 갈리고, 개발자 화면에서는 안 보인다.
 */

// 화면 코드 전부. 이 파일 자신은 검사 문자열을 들고 있으므로 뺀다
const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./theme-tokens.test.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('테마는 하나다 (#191)', () => {
  it('화면 코드에 dark: · data-theme · prefers-color-scheme 이 없다', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) =>
      text
        .split('\n')
        .map((line, i) => ({ path, line: i + 1, text: line }))
        .filter(({ text }) => /(?<![\w-])dark:|data-theme|dataset\.theme|prefers-color-scheme/.test(text)),
    )
    // 검사가 헛돌지 않는지 — 소스를 실제로 읽었는가
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    expect(offenders).toEqual([])
  })

  it('index.css 는 라이트로 못 박고 다크 토큰 블록이 없다', () => {
    expect(css).toMatch(/color-scheme:\s*light;/)
    expect(css).not.toMatch(/data-theme|prefers-color-scheme:\s*dark|@custom-variant dark/)
    // 토큰 정의는 :root 한 벌뿐이다
    expect(css.match(/--c-canvas:/g)).toHaveLength(1)
  })
})
