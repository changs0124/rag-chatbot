import { afterEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import MessageList from './MessageList'
import type { ChatMessage } from '../../lib/types'
import { resetFigureCache } from '../../lib/docFigures'

describe('MessageList', () => {
  it('renders assistant content with its citations', () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '환불 정책', status: 'complete', citations: [] },
      {
        id: 'a1',
        role: 'assistant',
        content: '안내는 다음과 같음 [1]',
        status: 'complete',
        citations: [{ seq: 1, sourceName: '이용 정책 문서', snippet: '발췌' }],
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
        citations: [{ seq: 1, sourceName: '이용 정책 문서', snippet: '발췌' }],
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
    expect(screen.getByText(/무엇을 도와드릴까요/)).toBeInTheDocument()
  })

  // 진행 단계 표시(REQ-CHAT-005)
  const pending: ChatMessage[] = [
    { id: 'u1', role: 'user', content: '환불 정책', status: 'complete', citations: [] },
    { id: 'a1', role: 'assistant', content: '', status: 'streaming', citations: [] },
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

  describe('문서 그림 표식 (FEAT-CHAT-004)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      resetFigureCache()
    })

    const answer = (content: string): ChatMessage[] => [
      {
        id: 'a1',
        role: 'assistant',
        content,
        status: 'complete',
        citations: [{ seq: 1, sourceName: '매뉴얼', snippet: '' }],
      },
    ]

    it('draws the figure in place of its marker', async () => {
      vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fig') })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['png']), { status: 200 })))
      render(<MessageList messages={answer('앞 문장\n[[그림:tm-p061-f1]]\n뒤 문장')} />)

      const img = await screen.findByAltText('문서 그림')
      expect(img).toHaveAttribute('src', 'blob:fig')
      expect(screen.getByText('앞 문장')).toBeInTheDocument()
      expect(screen.getByText('뒤 문장')).toBeInTheDocument()
      expect(screen.queryByText(/\[\[그림:/)).not.toBeInTheDocument()

      // 누르면 확대 보기로 연다
      fireEvent.click(screen.getByLabelText('문서 그림 확대'))
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('leaves nothing behind for a figure the server does not have', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      vi.stubGlobal('fetch', fetchMock)
      render(<MessageList messages={answer('설명\n[[그림:tm-p999-f9]]')} />)

      await waitFor(() => expect(fetchMock).toHaveBeenCalled())
      expect(screen.queryByAltText('문서 그림')).not.toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
      expect(screen.queryByText(/그림:/)).not.toBeInTheDocument()
    })
  })

  describe('답변 마크다운 (#270)', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
      resetFigureCache()
    })

    const msg = (role: 'user' | 'assistant', content: string): ChatMessage => ({
      id: role + content.length,
      role,
      content,
      status: 'complete',
      citations: role === 'assistant' ? [{ seq: 1, sourceName: '매뉴얼', snippet: '' }] : [],
    })

    it('굵게 · 목록 · 표를 기호가 아니라 서식으로 그린다', () => {
      render(
        <MessageList
          messages={[msg('assistant', '핀 배열은 **CN3** 이다.\n\n- 3상 입력\n- 모터 파워\n\n| 핀 | 신호 |\n|---|---|\n| B1 | +6 |')]}
        />,
      )
      expect(screen.getByText('CN3').tagName).toBe('STRONG')
      // 출처 목록도 listitem 이라 본문 항목만 글자로 집는다
      expect(screen.getByText('3상 입력').tagName).toBe('LI')
      expect(screen.getByText('모터 파워').tagName).toBe('LI')
      expect(screen.getByRole('table')).toBeInTheDocument()
      expect(screen.getByRole('cell', { name: '+6' })).toBeInTheDocument()
      expect(screen.queryByText(/\*\*|\|---/)).not.toBeInTheDocument()
    })

    it('문장부호로 끝나는 굵게 뒤에 조사가 붙어도 굵게로 그린다 (#287)', () => {
      // 표준 강조 규칙으로는 닫는 ** 앞이 문장부호 · 뒤가 글자면 안 닫힌다(Markdown.tsx 머리 주석, #287)
      render(
        <MessageList
          messages={[
            msg(
              'assistant',
              '최종원인은 **설계불량(부품선정오류)**으로 기록됐고, **19번 파라미터는 ‘잔류펄스 허용범위’**입니다.',
            ),
          ]}
        />,
      )
      expect(screen.getByText('설계불량(부품선정오류)').tagName).toBe('STRONG')
      expect(screen.getByText('19번 파라미터는 ‘잔류펄스 허용범위’').tagName).toBe('STRONG')
      expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument()
    })

    it('원시 HTML 은 실행하지 않고 위험한 링크 스킴은 지운다', () => {
      const { container } = render(
        <MessageList
          messages={[msg('assistant', '<img src=x onerror="alert(1)"> <script>alert(2)</script>\n\n[누르기](javascript:alert(3))')]}
        />,
      )
      expect(container.querySelector('img, script')).toBeNull()
      const link = screen.getByText('누르기').closest('a')
      expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript:/i)
    })

    // 그리면 모델 출력에 실린 바깥 주소를 브라우저가 곧바로 불러 쿼리로 값이 새어 나갈 수 있다(#359)
    it('마크다운 이미지는 그리지 않는다', () => {
      const { container } = render(
        <MessageList messages={[msg('assistant', '앞 글\n\n![요약](https://e.example/a.png?d=secret)\n\n뒤 글')]} />,
      )
      expect(container.querySelector('img')).toBeNull()
      expect(screen.getByText('앞 글')).toBeInTheDocument()
      expect(screen.getByText('뒤 글')).toBeInTheDocument()
    })

    it('그림 표식 앞뒤의 마크다운과 그림이 함께 나온다', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['png']), { status: 200 })))
      vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:fig' })
      render(<MessageList messages={[msg('assistant', '**각 부 명칭**\n[[그림:tm-p020-f1]]\n1. 엔코더 커넥터')]} />)
      expect(screen.getByText('각 부 명칭').tagName).toBe('STRONG')
      expect(await screen.findByAltText('문서 그림')).toBeInTheDocument()
      expect(screen.getByText('엔코더 커넥터').tagName).toBe('LI')
    })

    it('사용자가 친 글은 서식으로 바꾸지 않는다', () => {
      render(<MessageList messages={[msg('user', '**굵게** 가 아니라 별표 그대로')]} />)
      expect(screen.getByText('**굵게** 가 아니라 별표 그대로')).toBeInTheDocument()
    })
  })
})
