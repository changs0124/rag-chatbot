import { describe, it, expect } from 'vitest'

/**
 * #192 - 화면의 아이콘은 무채색 라인 아이콘(components/icons.tsx)만 쓴다.
 *
 * 이모지·장식 기호(📄 ⚠ ● ← → …)는 글꼴과 OS 마다 모양이 다르고, 일부는 **컬러 이모지로** 떠서
 * 무채색 화면에서 혼자 튄다. 한 번 걷어낸 뒤 다시 들어오는 길을 여기서 막는다.
 * 주석은 검사하지 않는다 - 설명에 화살표를 쓰는 것까지 막을 이유는 없다.
 */

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// 화살표(U+2190–21FF) · 기술 기호(U+2300–23FF) · 도형(U+25A0–25FF) · 기타 기호·딩뱃(U+2600–27BF) ·
// 화살표 보충(U+2B00–2BFF) · 그림 문자(U+1F300 이상)
const DECORATIVE = /[←-⇿⌀-⏿■-◿☀-➿⬀-⯿]|[\u{1F300}-\u{1FAFF}]/u

const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g
// 앞이 ':' 가 아닐 때만 한 줄 주석으로 본다 - 문자열 속 'http://' 를 주석으로 오인하지 않게
const LINE_COMMENT = /(^|[^:])\/\/.*$/gm

/** 주석을 공백으로 지운다. 여러 줄 블록(JSX 의 중괄호 주석 포함)의 이어지는 줄까지 빠지고 줄 번호는 그대로다 */
function stripComments(text: string): string {
  return text.replace(BLOCK_COMMENT, (m) => m.replace(/[^\n]/g, ' ')).replace(LINE_COMMENT, '$1')
}

describe('화면에 이모지·장식 기호가 없다 (#192)', () => {
  it('화면 코드(주석 제외)에 이모지·장식 기호가 0개', () => {
    const offenders = Object.entries(sources).flatMap(([path, text]) =>
      stripComments(text)
        .split('\n')
        .map((line, i) => ({ path, line: i + 1, text: line.trim() }))
        .filter(({ text }) => DECORATIVE.test(text)),
    )
    // 검사가 헛돌지 않는지 — 화면 코드를 실제로 읽었는가
    expect(Object.keys(sources).length).toBeGreaterThan(20)
    expect(offenders).toEqual([])
  })
})
