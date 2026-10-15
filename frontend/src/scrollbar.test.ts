/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// theme-tokens.test.ts 와 같은 이유로 파일을 직접 읽는다 - vitest 는 CSS 를 `?raw` 로 줘도 비운다
const css = readFileSync(`${process.cwd()}/src/index.css`, 'utf-8')
const sidebar = readFileSync(`${process.cwd()}/src/components/chat/Sidebar.tsx`, 'utf-8')

/**
 * #274 - 사이드바 대화 목록에 OS 기본 스크롤바(Windows : 화살표 달린 15px 막대)가 보였다.
 * jsdom 은 스크롤바를 그리지 않아 폭을 잴 수 없으므로, 규칙이 남아 있는지를 본다.
 */
describe('사이드바 스크롤바 숨김 (#274)', () => {
  it('scrollbar-none 이 Firefox 와 Chromium·Safari 를 모두 덮는다', () => {
    const rule = css.slice(css.indexOf('@utility scrollbar-none'))
    expect(rule).toMatch(/scrollbar-width:\s*none/)
    expect(rule).toMatch(/::-webkit-scrollbar\s*\{\s*display:\s*none/)
  })

  it('대화 목록은 스크롤은 유지하고 막대만 숨긴다', () => {
    const nav = sidebar.match(/<nav className="([^"]+)"/)?.[1] ?? ''
    expect(nav.split(' ')).toEqual(expect.arrayContaining(['scrollbar-none', 'overflow-y-auto']))
  })
})
