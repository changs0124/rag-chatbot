import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConfirmModal from './ConfirmModal'
import { useModalFocus } from '../hooks/useModalFocus'

// #484 F10 : 열리자마자 Enter 한 번이 삭제가 되지 않도록 첫 포커스는 파괴 버튼이 아니라 「취소」다
describe('ConfirmModal', () => {
  it('첫 포커스는 취소 버튼이다', () => {
    render(<ConfirmModal title="대화를 삭제할까요?" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('button', { name: '취소' })).toHaveFocus()
    expect(screen.getByRole('button', { name: '삭제' })).not.toHaveFocus()
  })

  it('대화상자 이름이 제목이다', () => {
    render(<ConfirmModal title="대화를 삭제할까요?" onConfirm={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: '대화를 삭제할까요?' })).toBeInTheDocument()
  })

  // #674 : 숨는 조상(데스크톱 사이드바 hidden md:block) 안에서 띄워도 body 아래에 그려져, 폭이 줄어 조상이 숨어도 창은 보이고
  // inert 는 앱 뿌리 하나에 걸린다
  it('숨은 조상 안에서 띄워도 body 바로 아래에 그리고 앱 뿌리를 inert 로 막는다', () => {
    const { container } = render(
      <div data-testid="hidden-parent" hidden>
        <ConfirmModal title="대화를 삭제할까요?" onConfirm={vi.fn()} onCancel={vi.fn()} />
      </div>,
    )
    const dialog = screen.getByRole('dialog', { name: '대화를 삭제할까요?' })

    expect(dialog.parentElement).toBe(document.body)
    expect(screen.getByTestId('hidden-parent')).not.toContainElement(dialog)
    expect(container).toHaveAttribute('inert')
  })

  // #674 : 바깥 창(드로어)이 먼저 닫혀도 확인 창이 떠 있는 동안 뒤 화면은 막혀 있다
  it('바깥 창이 먼저 닫혀도 확인 창이 떠 있는 동안 앱 뿌리의 inert 는 남는다', () => {
    function Outer() {
      const ref = useModalFocus<HTMLDivElement>()
      return (
        <div ref={ref} role="dialog" aria-modal="true" aria-label="드로어">
          <button>드로어 안</button>
        </div>
      )
    }
    // 드로어가 먼저 열리고(바깥 inert 소유), 그 위에 확인 창 - 회전으로 드로어만 닫히는 경우(#656 효과)
    function Harness({ drawer }: { drawer: boolean }) {
      return (
        <div>
          <p data-testid="main">본문</p>
          {drawer && <Outer />}
          <ConfirmModal title="이동할까요?" onConfirm={vi.fn()} onCancel={vi.fn()} />
        </div>
      )
    }
    const { rerender } = render(<Harness drawer />)
    expect(screen.getByTestId('main').closest('[inert]')).not.toBeNull()

    rerender(<Harness drawer={false} />)

    expect(screen.getByRole('dialog', { name: '이동할까요?' })).toBeInTheDocument()
    expect(screen.getByTestId('main').closest('[inert]')).not.toBeNull()
  })
})
