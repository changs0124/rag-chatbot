import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import Sidebar from './Sidebar'
import type { Conversation } from '../../lib/types'

function conv(id: string, at: Date): Conversation {
  return { id, title: id, updatedAt: at.toISOString() }
}

function groupOf(title: string) {
  // 묶음 = 라벨 <p> 와 항목 목록을 감싼 div
  return screen.getByText(title).closest('nav > div') as HTMLElement
}

describe('Sidebar 시간 묶음', () => {
  afterEach(() => vi.useRealTimers())

  /**
   * #324 F6 : 「오늘」은 24시간 이동 창이 아니라 로컬 달력 날짜다.
   * 어제 23시 대화가 오늘 09시에 「오늘」로 보이면 "어제 그 대화" 를 찾는 눈이 엇나간다.
   */
  it('묶음은 로컬 자정 기준이다 - 어제 23시는 「지난 7일」', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 16, 9, 0))
    render(
      <BrowserRouter>
        <Sidebar
          conversations={[
            conv('오늘 새벽', new Date(2026, 9, 16, 0, 30)),
            conv('어제 밤', new Date(2026, 9, 15, 23, 0)),
            conv('엿새 전 새벽', new Date(2026, 9, 10, 1, 0)),
            conv('이레 전 밤', new Date(2026, 9, 9, 23, 0)),
          ]}
          activeId={null}
          onSelect={vi.fn()}
          onNew={vi.fn()}
          onDelete={vi.fn()}
          userName="사용자"
          onLogout={vi.fn()}
        />
      </BrowserRouter>,
    )

    expect(within(groupOf('오늘')).getByText('오늘 새벽')).toBeInTheDocument()
    expect(within(groupOf('지난 7일')).getByText('어제 밤')).toBeInTheDocument()
    expect(within(groupOf('지난 7일')).getByText('엿새 전 새벽')).toBeInTheDocument()
    expect(within(groupOf('이전')).getByText('이레 전 밤')).toBeInTheDocument()
  })
})

// #484 F8 : 삭제 버튼은 데스크톱에서 투명(opacity-0)이므로 키보드 포커스·행 안 포커스에서 드러나야 하고, 이름에 대화 제목이 있어야 한다
describe('Sidebar 삭제 버튼 (#484)', () => {
  function renderSidebar() {
    render(
      <BrowserRouter>
        <Sidebar
          conversations={[conv('c1', new Date())]}
          activeId={null}
          onSelect={vi.fn()}
          onNew={vi.fn()}
          onDelete={vi.fn()}
          userName="사용자"
          onLogout={vi.fn()}
        />
      </BrowserRouter>,
    )
  }

  it('이름에 대화 제목이 들어 있다', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: "'c1' 대화 삭제" })).toBeInTheDocument()
  })

  it('키보드 포커스 때 투명하지 않도록 클래스가 걸려 있다', () => {
    renderSidebar()

    const cls = screen.getByRole('button', { name: "'c1' 대화 삭제" }).className
    expect(cls).toContain('md:focus-visible:opacity-100')
    expect(cls).toContain('md:group-focus-within:opacity-100')
  })

  it('삭제 확인 모달의 첫 포커스는 취소이고 이름이 붙는다', () => {
    renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: "'c1' 대화 삭제" }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName(/삭제/)
    expect(within(dialog).getByRole('button', { name: '취소' })).toHaveFocus()
  })
})
