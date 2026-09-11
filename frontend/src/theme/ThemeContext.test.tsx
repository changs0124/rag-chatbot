import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeContext'

/*
 * 주소창 색(`<meta name="theme-color">`)이 **OS 가 아니라 앱 테마를 따라가는지** 본다(#156).
 *
 * **색 값을 여기 적지 않는다.** 적으면 `index.css` · `Logo.tsx` · `index.html` 에 이어
 * 색을 든 네 번째 자리가 생긴다(`design-system.md` 「색 값을 들고 있는 파일」).
 * 그래서 값이 아니라 **배선**을 단언한다 — 테스트가 토큰을 심고, `<meta>` 가 그것을 따라오는지 본다.
 *
 * jsdom 은 `index.css` 를 적용하지 않으므로 `color-scheme` 쪽은 여기서 볼 수 없다.
 * 그쪽 회귀 보호는 캡처가 맡는다.
 */

const LIGHT = 'rgb(1, 2, 3)'
const DARK = 'rgb(4, 5, 6)'

function seedTokens() {
  const style = document.createElement('style')
  style.id = 'test-tokens'
  style.textContent = `:root{--c-canvas:${LIGHT}}:root[data-theme="dark"]{--c-canvas:${DARK}}`
  document.head.appendChild(style)
}

function seedMeta() {
  const meta = document.createElement('meta')
  meta.setAttribute('name', 'theme-color')
  meta.setAttribute('content', '#ffffff')
  document.head.appendChild(meta)
}

const themeColor = () =>
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content')

/** 테마를 고르는 최소 화면 */
function Picker() {
  const { setTheme } = useTheme()
  return (
    <>
      <button onClick={() => setTheme('light')}>라이트</button>
      <button onClick={() => setTheme('dark')}>다크</button>
      <button onClick={() => setTheme('system')}>시스템</button>
    </>
  )
}

/** OS 가 다크라고 답하게 만든다 */
function mockOsDark(dark: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: dark,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

beforeEach(() => {
  localStorage.clear()
  seedTokens()
  seedMeta()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.getElementById('test-tokens')?.remove()
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove())
  delete document.documentElement.dataset.theme
})

describe('주소창 색', () => {
  it('테마를 바꾸면 그 테마의 canvas 토큰을 따라간다', () => {
    // OS 는 다크지만 앱에서 라이트를 고른다 - 어긋나는 조합이 이 이슈의 증상이다
    mockOsDark(true)
    render(
      <ThemeProvider>
        <Picker />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '라이트' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(themeColor()).toBe(LIGHT)

    fireEvent.click(screen.getByRole('button', { name: '다크' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(themeColor()).toBe(DARK)
  })

  it('시스템을 고르면 OS 설정을 해석한 쪽 값을 쓴다', () => {
    mockOsDark(true)
    render(
      <ThemeProvider>
        <Picker />
      </ThemeProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '시스템' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(themeColor()).toBe(DARK)
  })
})
