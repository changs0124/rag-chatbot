import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ResizableSidebar, {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './ResizableSidebar'

const STORAGE_KEY = 'rag_chatbot_sidebar_width'

function panel() {
  return screen.getByTestId('panel').parentElement as HTMLElement
}

function drag(toX: number) {
  const handle = screen.getByRole('separator')
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: SIDEBAR_DEFAULT_WIDTH })
  fireEvent.pointerMove(window, { pointerId: 1, clientX: toX })
  fireEvent.pointerUp(window, { pointerId: 1, clientX: toX })
}

describe('ResizableSidebar', () => {
  // vitest globals 미사용이라 RTL 자동 정리가 안 걸림 - 렌더가 누적되지 않게 직접 정리함
  afterEach(cleanup)
  beforeEach(() => localStorage.clear())

  const subject = <ResizableSidebar><div data-testid="panel">목록</div></ResizableSidebar>

  it('손잡이를 끌면 폭이 따라온다', () => {
    render(subject)
    drag(330)
    expect(panel()).toHaveStyle({ width: '330px' })
  })

  it('최소·최대를 넘겨 끌어도 경계에서 멈춘다', () => {
    render(subject)

    drag(40)
    // 화면 밖으로 사라지는 사이드바를 만들지 않음
    expect(panel()).toHaveStyle({ width: `${SIDEBAR_MIN_WIDTH}px` })

    drag(900)
    expect(panel()).toHaveStyle({ width: `${SIDEBAR_MAX_WIDTH}px` })
  })

  it('끝낸 폭을 저장하고, 다시 열 때 그 폭으로 연다', () => {
    const { unmount } = render(subject)
    drag(300)
    expect(localStorage.getItem(STORAGE_KEY)).toBe('300')

    unmount()
    render(subject)
    expect(panel()).toHaveStyle({ width: '300px' })
  })

  it('저장된 값이 범위 밖이면 무시하고 기본 폭으로 연다', () => {
    // 수동 변조·규격 변경으로 남은 값이 화면을 망가뜨리지 않게 함
    localStorage.setItem(STORAGE_KEY, '5000')
    render(subject)
    expect(panel()).toHaveStyle({ width: `${SIDEBAR_DEFAULT_WIDTH}px` })
  })

  it('손잡이를 더블클릭하면 기본 폭으로 돌아간다', () => {
    render(subject)
    drag(400)
    fireEvent.doubleClick(screen.getByRole('separator'))
    expect(panel()).toHaveStyle({ width: `${SIDEBAR_DEFAULT_WIDTH}px` })
  })

  it('마우스 없이 화살표 키로도 조절된다', () => {
    render(subject)
    const handle = screen.getByRole('separator')

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(panel()).toHaveStyle({ width: `${SIDEBAR_DEFAULT_WIDTH + 16}px` })

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(panel()).toHaveStyle({ width: `${SIDEBAR_DEFAULT_WIDTH - 16}px` })
    expect(handle).toHaveAttribute('aria-valuenow', String(SIDEBAR_DEFAULT_WIDTH - 16))
  })
})
