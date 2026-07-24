import '@testing-library/jest-dom/vitest'

// jsdom에 없는 matchMedia 폴리필 (ThemeProvider의 시스템 테마 해석용)
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
