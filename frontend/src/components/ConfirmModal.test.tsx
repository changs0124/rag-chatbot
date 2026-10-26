import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConfirmModal from './ConfirmModal'

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
})
