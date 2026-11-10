import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useRef, useState } from 'react'
import { useModalFocus } from './useModalFocus'

/*
 * #644 : 모달 · 드로어가 떠 있는 동안 바깥은 inert, 닫히면 연 요소로 포커스 복귀.
 * jsdom 은 inert 를 Tab 이동에 반영하지 않는다 - 여기서는 「속성이 걸리고 풀리는가」와 포커스 이동만 잠근다.
 * 실제 Tab 이 모달 밖으로 나가지 않는 것은 브라우저 탐침(.issue/644/evidence)이 본다.
 */

function Dialog({ label, onClose, returnTo }: { label: string; onClose: () => void; returnTo?: () => HTMLElement | null }) {
  const ref = useModalFocus<HTMLDivElement>(returnTo)
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label}>
      <button onClick={onClose}>{label} 닫기</button>
    </div>
  )
}

function Harness({ disableOpener = false }: { disableOpener?: boolean }) {
  const [open, setOpen] = useState(false)
  // 한 번 열면 계속 막힌다 - 요청 중 막힌 버튼이 창이 닫힐 때까지 풀리지 않는 경우를 흉내 낸다
  const [used, setUsed] = useState(false)
  const fallback = useRef<HTMLButtonElement>(null)
  return (
    <div>
      <button
        onClick={() => {
          setOpen(true)
          setUsed(true)
        }}
        disabled={disableOpener && used}
      >
        열기
      </button>
      <button ref={fallback}>돌아갈 곳</button>
      <p data-testid="outside">바깥</p>
      {open && <Dialog label="창" onClose={() => setOpen(false)} returnTo={() => fallback.current} />}
    </div>
  )
}

describe('useModalFocus', () => {
  it('열린 동안 바깥 형제에 inert 를 걸고, 닫히면 풀고 연 버튼으로 포커스를 돌린다', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: '열기' })
    opener.focus()
    fireEvent.click(opener)

    expect(screen.getByTestId('outside')).toHaveAttribute('inert')
    expect(opener).toHaveAttribute('inert')
    expect(screen.getByRole('dialog')).not.toHaveAttribute('inert')
    // 포커스가 바깥에 있었으니 안의 첫 버튼으로 옮겨진다
    expect(screen.getByRole('button', { name: '창 닫기' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: '창 닫기' }))

    expect(screen.getByTestId('outside')).not.toHaveAttribute('inert')
    expect(opener).not.toHaveAttribute('inert')
    expect(opener).toHaveFocus()
  })

  it('연 버튼이 막혀 있으면 returnTo 가 준 요소로 돌아간다', () => {
    render(<Harness disableOpener />)
    const opener = screen.getByRole('button', { name: '열기' })
    opener.focus()
    fireEvent.click(opener)
    fireEvent.click(screen.getByRole('button', { name: '창 닫기' }))

    expect(screen.getByRole('button', { name: '돌아갈 곳' })).toHaveFocus()
  })

  it('겹쳐 뜬 창이 닫혀도 바깥 창이 건 inert 는 남는다', () => {
    function Nested() {
      const [inner, setInner] = useState(false)
      const ref = useModalFocus<HTMLDivElement>()
      return (
        <div ref={ref} role="dialog" aria-label="바깥 창">
          <button onClick={() => setInner(true)}>안쪽 열기</button>
          {inner && <Dialog label="안쪽" onClose={() => setInner(false)} />}
        </div>
      )
    }
    function Page() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <p data-testid="page">본문</p>
          <button onClick={() => setOpen(true)}>바깥 열기</button>
          {open && <Nested />}
        </div>
      )
    }
    render(<Page />)
    fireEvent.click(screen.getByRole('button', { name: '바깥 열기' }))
    fireEvent.click(screen.getByRole('button', { name: '안쪽 열기' }))
    expect(screen.getByRole('button', { name: '안쪽 열기' })).toHaveAttribute('inert')

    fireEvent.click(screen.getByRole('button', { name: '안쪽 닫기' }))

    expect(screen.getByRole('button', { name: '안쪽 열기' })).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: '안쪽 열기' })).toHaveFocus()
    expect(screen.getByTestId('page')).toHaveAttribute('inert')
  })

  // #656 : StrictMode(개발)는 효과를 두 번 돌린다 - 첫 정리가 포커스를 연 요소로 돌려놓아도 다시 data-autofocus 로 간다
  it('StrictMode 에서도 첫 포커스는 data-autofocus 요소다', () => {
    function Two() {
      const ref = useModalFocus<HTMLDivElement>()
      return (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="창">
          <button>내려받기</button>
          <button autoFocus data-autofocus>
            닫기
          </button>
        </div>
      )
    }
    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>열기</button>
          {open && <Two />}
        </>
      )
    }
    render(
      <StrictMode>
        <Opener />
      </StrictMode>,
    )
    const opener = screen.getByRole('button', { name: '열기' })
    opener.focus()
    fireEvent.click(opener)

    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus()
  })
})
