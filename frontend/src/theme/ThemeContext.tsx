import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Theme } from '../lib/types'

const THEME_KEY = 'rag_chatbot_theme'

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme
  root.dataset.theme = resolved

  /*
   * 주소창 색은 여기서 함께 옮긴다. `<meta>` 는 CSS 변수를 못 읽어 토큰을 직접 못 쓰고,
   * `media="(prefers-color-scheme: …)"` 로 두면 **OS 를 보므로 앱 설정과 어긋난다**(#156).
   * 그래서 data-theme 을 바꾼 **뒤에** 그 상태의 canvas 값을 읽어 넣는다 -
   * 색 값을 JS 로 복사해 오는 것이 아니라 토큰에서 읽으므로 정본은 여전히 index.css 다.
   */
  const meta = document.querySelector('meta[name="theme-color"]')
  const canvas = getComputedStyle(root).getPropertyValue('--c-canvas').trim()
  if (meta && canvas) meta.setAttribute('content', canvas)
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme) ?? 'system')

  useEffect(() => {
    applyTheme(theme)
    localStorage.setItem(THEME_KEY, theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
