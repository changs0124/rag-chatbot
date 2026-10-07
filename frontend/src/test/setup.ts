import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vitest globals 를 쓰지 않아 RTL 자동 정리가 걸리지 않는다 - 앞 케이스의 DOM 이 남으면 「없음」 단언이
// 그 렌더를 보고 흔들린다. 파일마다 두던 afterEach(cleanup) 를 여기 한 곳으로 모았다(#219)
afterEach(cleanup)

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

