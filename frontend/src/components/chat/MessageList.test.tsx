import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import MessageList from './MessageList'
import type { ChatMessage } from '../../lib/types'

describe('MessageList', () => {
  // vitest globals 미사용이라 RTL 자동 정리가 안 걸림 - 렌더가 누적되지 않게 직접 정리함
  afterEach(cleanup)

  it('renders assistant content with its citations', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '환불 정책', status: 'complete', createdAt: '', citations: [] },
      {
        id: 'a1',
        role: 'assistant',
        content: '안내는 다음과 같음 [1]',
        status: 'complete',
        createdAt: '',
        citations: [{ seq: 1, sourceName: '이용 정책 문서', snippet: '발췌', uri: 'corpus://1' }],
      },
    ]
    render(<MessageList messages={messages} />)
    expect(screen.getByText('안내는 다음과 같음 [1]')).toBeInTheDocument()
    expect(screen.getByText('출처')).toBeInTheDocument()
    expect(screen.getByText('이용 정책 문서')).toBeInTheDocument()
  })

  it('marks an assistant answer with no citations as 자료 없음', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '일반적인 관점에서 이렇게 볼 수 있음.',
        status: 'complete',
        createdAt: '',
        citations: [],
      },
    ]
    render(<MessageList messages={messages} />)
    // 접두가 본문에 섞이지 않고 별도 표시로 나와야 함(화면·재조회 동일 규칙)
    expect(screen.getByText(/자료 없음/)).toBeInTheDocument()
    expect(screen.getByText('일반적인 관점에서 이렇게 볼 수 있음.')).toBeInTheDocument()
  })

  it('중단된 답변에는 자료 없음을 붙이지 않음', () => {
    // 중단은 출처 판정 전에 끝나므로 citations 가 늘 0건임 - 배너를 붙이면 100% 거짓말이 됨
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '답변을 쓰다가',
        status: 'complete',
        stopped: true,
        createdAt: '',
        citations: [],
      },
    ]
    render(<MessageList messages={messages} />)
    expect(screen.queryByText(/자료 없음/)).not.toBeInTheDocument()
    expect(screen.getByText('답변을 쓰다가')).toBeInTheDocument()
  })

  it('does not mark an answer that has citations', () => {
    const messages: ChatMessage[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: '안내는 다음과 같음 [1]',
        status: 'complete',
        createdAt: '',
        citations: [{ seq: 1, sourceName: '이용 정책 문서', snippet: '발췌', uri: 'corpus://1' }],
      },
    ]
    render(<MessageList messages={messages} />)
    expect(screen.queryByText(/자료 없음/)).not.toBeInTheDocument()
  })

  // 첨부 확대 보기 (FEAT-CHAT-002)
  const withAttachments = (count: number): ChatMessage[] => [
    {
      id: 'u1',
      role: 'user',
      content: '이 사진들 설명해줘',
      status: 'complete',
      createdAt: '',
      citations: [],
      attachments: Array.from({ length: count }, (_, i) => ({
        id: `f${i + 1}`,
        fileType: 'image' as const,
        url: `/api/files/f${i + 1}?token=t`,
      })),
    },
  ]

  it('말풍선 썸네일을 누르면 같은 서명 URL 로 확대함', () => {
    render(<MessageList messages={withAttachments(1)} />)
    fireEvent.click(screen.getByLabelText('첨부 이미지 확대'))

    const dialog = screen.getByRole('dialog')
    // 재요청 없이 화면에 이미 뜬 것과 같은 URL 을 씀
    expect(within(dialog).getByAltText('첨부 이미지')).toHaveAttribute(
      'src',
      expect.stringContaining('/api/files/f1?token=t'),
    )
    // 한 장뿐이면 좌우 이동이 없음
    expect(screen.queryByLabelText('다음 이미지')).not.toBeInTheDocument()
  })

  it('여러 장이면 좌우로 넘기고 끝에서는 순환하지 않음', () => {
    render(<MessageList messages={withAttachments(3)} />)
    fireEvent.click(screen.getAllByLabelText('첨부 이미지 확대')[1])

    expect(screen.getByText('2 / 3')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('다음 이미지'))
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    // 마지막에서 되돌아가면 "넘어갔다"고 오해하게 됨
    expect(screen.getByLabelText('다음 이미지')).toBeDisabled()
  })

  it('확대 보기는 Esc · 배경 클릭 · 닫기 버튼 어느 쪽으로도 닫힘', () => {
    render(<MessageList messages={withAttachments(1)} />)
    const open = () => fireEvent.click(screen.getByLabelText('첨부 이미지 확대'))

    open()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    open()
    fireEvent.click(screen.getByLabelText('닫기'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    open()
    // 배경(모달 뒤를 덮는 레이어)
    fireEvent.click(screen.getByRole('dialog').firstElementChild as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // 닫은 뒤에도 대화는 그대로 남아 있어야 함
    expect(screen.getByText('이 사진들 설명해줘')).toBeInTheDocument()
  })

  it('shows empty state when there are no messages', () => {
    render(<MessageList messages={[]} />)
    expect(screen.getByText(/무엇이든 물어보세요/)).toBeInTheDocument()
  })

  // R-11 진행 단계 표시
  const pending: ChatMessage[] = [
    { id: 'u1', role: 'user', content: '환불 정책', status: 'complete', createdAt: '', citations: [] },
    { id: 'a1', role: 'assistant', content: '', status: 'streaming', createdAt: '', citations: [] },
  ]

  it('shows the stage label in a status region separated from the log', () => {
    render(<MessageList messages={pending} stage="목업 코퍼스 조회 중" />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('목업 코퍼스 조회 중')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    // log 영역 안에 중첩되면 낭독이 누적되므로 분리되어야 함
    expect(screen.getByRole('log')).not.toContainElement(status)
    // 고정 문구는 제거됨(중복 표시 0건)
    expect(screen.queryByText('응답 생성 중…')).not.toBeInTheDocument()
  })

  it('holds the stage line while it is still within its minimum display time', () => {
    // 토큰이 이미 도착했어도 단계가 살아 있는 동안은 단계 줄을 유지함(최소 표시 시간)
    const streamedWithStage: ChatMessage[] = [
      pending[0],
      { ...pending[1], content: '문의하신 내용에 대한' },
    ]
    render(<MessageList messages={streamedWithStage} stage="답변 작성 중(목업)" />)
    expect(screen.getByRole('status')).toHaveTextContent('답변 작성 중(목업)')
    expect(screen.queryByText('문의하신 내용에 대한')).not.toBeInTheDocument()
  })

  it('replaces the stage line with answer text once tokens arrive', () => {
    const streamed: ChatMessage[] = [
      pending[0],
      { ...pending[1], content: '문의하신 내용에 대한 안내는' },
    ]
    render(<MessageList messages={streamed} stage={null} />)
    expect(screen.getByText('문의하신 내용에 대한 안내는')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps no stage line when the turn ended by abort or error', () => {
    const ended: ChatMessage[] = [
      pending[0],
      { ...pending[1], status: 'error' },
    ]
    render(<MessageList messages={ended} stage={null} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText(/응답 중 오류가 발생했습니다/)).toBeInTheDocument()
  })
})
