import '@testing-library/jest-dom/vitest'

// jsdom에 없는 PointerEvent 폴리필 (확대 보기의 핀치 줌 검사용).
// 없으면 fireEvent 가 PointerEvent 대신 밋밋한 Event 를 만들어 pointerId·clientX 가 전달되지 않고,
// 검사는 "아무 일도 안 일어남"을 통과로 읽어 버림
if (typeof window.PointerEvent !== 'function') {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  window.PointerEvent = PointerEventPolyfill as unknown as typeof window.PointerEvent
}

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
