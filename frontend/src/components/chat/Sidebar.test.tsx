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
  function renderSidebar(activeId: string | null = null) {
    render(
      <BrowserRouter>
        <Sidebar
          conversations={[conv('c1', new Date())]}
          activeId={activeId}
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

  // #590 : 색으로만 드러난 현재 대화를 낭독기에도 알린다
  it('지금 대화 항목에 aria-current 가 붙는다', () => {
    renderSidebar('c1')

    expect(screen.getByRole('button', { name: 'c1' })).toHaveAttribute('aria-current', 'page')
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

  // #656 : 대화를 지우면 연 ✕ 가 행째 사라진다 - 포커스를 「새 대화」로 돌려 드로어 안이면 Esc 도 계속 먹게 한다
  it('대화를 지워 행이 사라지면 포커스가 새 대화 버튼으로 간다', () => {
    const props = { activeId: null, onSelect: vi.fn(), onNew: vi.fn(), onDelete: vi.fn(), userName: '사용자', onLogout: vi.fn() }
    const { rerender } = render(
      <BrowserRouter>
        <Sidebar conversations={[conv('c1', new Date())]} {...props} />
      </BrowserRouter>,
    )
    // 브라우저는 누른 버튼에 포커스를 준다 - jsdom 은 안 주므로 직접 준다(확인 창은 닫힐 때 이 ✕ 로 포커스를 돌려준다)
    const x = screen.getByRole('button', { name: "'c1' 대화 삭제" })
    x.focus()
    fireEvent.click(x)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(x).toHaveFocus()
    rerender(
      <BrowserRouter>
        <Sidebar conversations={[]} {...props} />
      </BrowserRouter>,
    )

    expect(props.onDelete).toHaveBeenCalledWith('c1')
    expect(screen.getByRole('button', { name: '새 대화' })).toHaveFocus()
  })

  // #674 : 삭제가 실패해 행이 남은 뒤, 나중에 다른 경로(다른 기기에서 지움 · 목록 갱신)로 그 행이 빠져도 포커스를 옮기지 않는다
  it('삭제가 실패한 뒤 나중에 그 행이 빠져도 포커스를 새 대화로 옮기지 않는다', () => {
    const props = { activeId: null, onSelect: vi.fn(), onNew: vi.fn(), onDelete: vi.fn(), userName: '사용자', onLogout: vi.fn() }
    const c1 = conv('c1', new Date())
    const c2 = conv('c2', new Date())
    const view = (list: Conversation[]) => (
      <BrowserRouter>
        <Sidebar conversations={list} {...props} />
      </BrowserRouter>
    )
    const { rerender } = render(view([c1, c2]))
    fireEvent.click(screen.getByRole('button', { name: "'c1' 대화 삭제" }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    // 실패 - 목록은 그대로(새 배열로 다시 그려짐)
    rerender(view([c1, c2]))
    const elsewhere = screen.getByRole('button', { name: "'c2' 대화 삭제" })
    elsewhere.focus()
    ;(document.activeElement as HTMLElement).blur()

    // 한참 뒤 다른 경로로 c1 이 빠진다
    rerender(view([c2]))

    expect(screen.getByRole('button', { name: '새 대화' })).not.toHaveFocus()
  })
})

// #663 : 첫 목록이 오기 전에는 「대화가 없습니다」 대신 스켈레톤 - 대화가 있는 사용자에게 잠깐 「없다」고 말하지 않게
describe('Sidebar 첫 로드 (#663)', () => {
  const renderSidebar = (conversations: Conversation[], loading: boolean) =>
    render(
      <BrowserRouter>
        <Sidebar
          conversations={conversations}
          activeId={null}
          onSelect={vi.fn()}
          onNew={vi.fn()}
          onDelete={vi.fn()}
          userName="사용자"
          onLogout={vi.fn()}
          loading={loading}
        />
      </BrowserRouter>,
    )

  it('목록을 기다리는 동안은 스켈레톤과 상태 문구만 - 「대화가 없습니다」는 없다', () => {
    renderSidebar([], true)
    expect(screen.getByTestId('conversation-list-skeleton')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('대화 목록 불러오는 중')
    expect(screen.queryByText('대화가 없습니다')).not.toBeInTheDocument()
  })

  it('다 읽었는데 비었으면 「대화가 없습니다」, 스켈레톤 · 상태 문구는 없다', () => {
    renderSidebar([], false)
    expect(screen.getByText('대화가 없습니다')).toBeInTheDocument()
    expect(screen.queryByTestId('conversation-list-skeleton')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('기다리는 중이라도 그 사이 만든 대화가 있으면 목록을 보인다', () => {
    renderSidebar([conv('방금 만든 대화', new Date())], true)
    expect(screen.getByText('방금 만든 대화')).toBeInTheDocument()
    expect(screen.queryByTestId('conversation-list-skeleton')).not.toBeInTheDocument()
  })
})
