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

  /**
   * #102 - 드래그 도중 언마운트되면 `userSelect` 를 되돌린다.
   *
   * 리스너만 떼는 것으로는 부족하다. `document.body.style.userSelect` 는 **이 컴포넌트 밖에 남아**,
   * 로그아웃 뒤 로그인 화면에서도 텍스트 선택이 막힌 채가 된다.
   */
  it('드래그 중 언마운트되면 텍스트 선택 잠금을 푼다', () => {
    const { unmount } = render(subject)
    fireEvent.pointerDown(screen.getByRole('separator'), { pointerId: 1, clientX: 300 })
    expect(document.body.style.userSelect).toBe('none')

    unmount()

    expect(document.body.style.userSelect).toBe('')
  })

  /**
   * #102 - `pointercancel` 도 드래그를 끝낸다.
   *
   * 브라우저가 제스처를 가로채거나 포인터가 사라지면 `pointerup` 이 오지 않는다. 그때 `dragging` 이
   * 참으로 남으면 **버튼을 누르지 않았는데도 폭이 계속 따라온다.**
   *
   * (「창 밖에서 뗐다」는 상태는 jsdom 에 없어 직접 못 잰다. `setPointerCapture` 가 그 창을 없애는데,
   * 그 효과는 실제 브라우저에서만 관측된다.)
   */
  it('pointercancel 이 오면 드래그가 끝난다', () => {
    render(subject)
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: SIDEBAR_DEFAULT_WIDTH })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 400 })
    expect(panel()).toHaveStyle({ width: '400px' })

    fireEvent.pointerCancel(window, { pointerId: 1 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 320 })

    expect(panel()).toHaveStyle({ width: '400px' }) // 더 이상 따라오지 않는다
    expect(document.body.style.userSelect).toBe('')
  })
})
