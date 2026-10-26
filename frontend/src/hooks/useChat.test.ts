import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChat, RECHECK_INTERVAL_MS, RECHECK_WINDOW_MS } from './useChat'
import type { ChatStreamHandlers } from '../lib/endpoints'
import type { ChatMessage } from '../lib/types'

vi.mock('../lib/endpoints', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn().mockResolvedValue({
    id: 'c1',
    title: '새 대화',
    updatedAt: '',
  }),
  getMessages: vi.fn().mockResolvedValue([]),
  deleteConversation: vi.fn().mockResolvedValue(undefined),
  deleteConversationIfEmpty: vi.fn().mockResolvedValue(undefined),
  renameConversation: vi.fn(),
  streamChat: vi.fn(),
}))

const { streamChat, deleteConversation, deleteConversationIfEmpty, listConversations, getMessages } = await import(
  '../lib/endpoints'
)
const { ApiError } = await import('../lib/api')

/**
 * 스트림을 열어 둔 채 핸들러를 직접 호출할 수 있게 함.
 * `opened` 가 false 면 200 을 받기 전(서버에 닿기 전)인 요청을 흉내 낸다(#435)
 */
function openStream({ opened = true } = {}) {
  const control: {
    handlers?: ChatStreamHandlers
    signal?: AbortSignal
    finish?: () => void
    fail?: (e: unknown) => void
  } = {}
  vi.mocked(streamChat).mockImplementation((_body, handlers, signal) => {
    control.handlers = handlers
    control.signal = signal
    if (opened) handlers.onOpen?.()
    return new Promise<void>((resolve, reject) => {
      control.finish = resolve
      control.fail = reject
    })
  })
  return control
}

/**
 * 서버 이력을 케이스 끝까지 고정한다 - 답 없는 질문이 재확인 구간(#489) 내내 걷히지 않는 경우.
 * `conflict` 면 조건부 삭제도 계속 409 다. 끝나면 기본 모의로 되돌려 뒤 케이스로 새지 않게 한다
 */
function holdStored(saved: ChatMessage[], conflict = false) {
  vi.mocked(getMessages).mockResolvedValue(saved)
  if (conflict) {
    vi.mocked(deleteConversationIfEmpty).mockRejectedValue(new ApiError(409, '메시지가 있는 대화는 지우지 않음'))
  }
  onTestFinished(() => {
    vi.mocked(getMessages).mockReset().mockResolvedValue([])
    vi.mocked(deleteConversationIfEmpty).mockReset().mockResolvedValue(undefined)
  })
}

/** 스트림이 열릴 때까지 프라미스 체인만 흘림(fake timer 환경이라 waitFor를 쓰지 않음) */
async function startStream(send: () => void) {
  await act(async () => {
    send()
  })
  await act(async () => {})
}

describe('useChat 진행 단계(R-11)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('도달한 단계를 순서대로 최소 표시 시간만큼 유지한 뒤 비움', async () => {
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))
    expect(stream.handlers).toBeDefined()

    act(() => {
      stream.handlers?.onStage?.({ stage: 'analyzing', label: '질문 분석 중(목업)' })
      stream.handlers?.onStage?.({ stage: 'searching', label: '목업 코퍼스 조회 중' })
      stream.handlers?.onStage?.({ stage: 'generating', label: '답변 작성 중(목업)' })
      // 목업은 단계와 토큰이 사실상 같은 순간에 옴 - 그래도 단계는 순서대로 보여야 함
      stream.handlers?.onToken?.('안내는')
    })
    expect(result.current.stage).toBe('질문 분석 중(목업)')

    act(() => void vi.advanceTimersByTime(350))
    expect(result.current.stage).toBe('목업 코퍼스 조회 중')

    act(() => void vi.advanceTimersByTime(350))
    expect(result.current.stage).toBe('답변 작성 중(목업)')

    act(() => void vi.advanceTimersByTime(350))
    expect(result.current.stage).toBeNull() // 큐가 마르면 스스로 비워짐 → 답변으로 교체
  })

  it('참조 문서 확인 단계(reviewing)도 같은 큐로 최소 표시 시간만큼 보임(#375)', async () => {
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    act(() => {
      stream.handlers?.onStage?.({ stage: 'searching', label: '참조 문서 검색 중' })
      stream.handlers?.onStage?.({ stage: 'reviewing', label: '참조 문서 확인 중 · 정책.pdf 외 1건' })
      stream.handlers?.onStage?.({ stage: 'generating', label: '답변 작성 중' })
      stream.handlers?.onToken?.('안내는')
    })
    act(() => void vi.advanceTimersByTime(350))
    expect(result.current.stage).toBe('참조 문서 확인 중 · 정책.pdf 외 1건')

    act(() => void vi.advanceTimersByTime(350))
    expect(result.current.stage).toBe('답변 작성 중')
  })

  it('오류 경로에서는 남은 단계를 즉시 비움', async () => {
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    act(() => {
      stream.handlers?.onStage?.({ stage: 'analyzing', label: '질문 분석 중(목업)' })
      stream.handlers?.onStage?.({ stage: 'searching', label: '목업 코퍼스 조회 중' })
    })
    expect(result.current.stage).toBe('질문 분석 중(목업)')

    act(() => {
      stream.handlers?.onError?.('응답 생성 중 오류')
    })
    expect(result.current.stage).toBeNull()

    // 남은 큐가 되살아나지 않아야 함(잔류 0)
    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current.stage).toBeNull()
  })

  it('중단(abort) 경로에서도 단계가 남지 않음', async () => {
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    act(() => {
      stream.handlers?.onStage?.({ stage: 'searching', label: '목업 코퍼스 조회 중' })
    })
    expect(result.current.stage).toBe('목업 코퍼스 조회 중')

    // 사용자가 중단하면 fetch가 거부되며 catch 경로로 들어감
    await act(async () => {
      result.current.stop()
      stream.fail?.(new DOMException('aborted', 'AbortError'))
    })
    expect(result.current.stage).toBeNull()

    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current.stage).toBeNull()
  })
})

describe('useChat 중단·오류 상태(AC-9·AC-17)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  async function abort(stream: ReturnType<typeof openStream>) {
    await act(async () => {
      stream.fail?.(new DOMException('aborted', 'AbortError'))
    })
  }

  it('중단은 실패가 아님 - 받은 데까지 complete 로 남김', async () => {
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    act(() => void stream.handlers?.onToken?.('부분 답변'))
    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].content).toBe('부분 답변')
    expect(result.current.messages[1].status).toBe('complete')
    // 서버 저장분과 같은 표시 - 이게 없으면 화면이 "자료 없음"을 거짓으로 붙임
    expect(result.current.messages[1].stopped).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('받은 것이 없이 중단하면 빈 답변 버블을 남기지 않음', async () => {
    // 남겨 두면 새로고침에 사라짐 - 서버도 부분 텍스트가 비면 저장하지 않음. 질문 쪽은 판정이 가른다(#489, 아래 토큰 0개 케이스)
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))
    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(result.current.messages.some((m) => m.role === 'assistant')).toBe(false)
  })

  it('200 을 받기 전에 중단하면 질문 말풍선도 남기지 않음 (#435)', async () => {
    // 서버에 닿지 않은 요청은 질문도 저장되지 않는다 - 남기면 새로고침에 사라져 화면과 재조회가 어긋남.
    // 200 을 받은 뒤의 중단은 위 테스트처럼 질문을 남긴다 - 서버가 200 전에 질문을 저장하기 때문이다
    const stream = openStream({ opened: false })
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))
    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(result.current.messages).toHaveLength(0)
    expect(result.current.error).toBeNull()
  })

  it('200 을 받기 전에 중단하면 보낸 것을 입력창에 되돌리고, 그 턴이 만든 빈 대화를 지운다 (#440)', async () => {
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    expect(result.current.activeId).toBe('c1')
    expect(result.current.conversations.map((c) => c.id)).toEqual(['c1'])

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(giveBack).toHaveBeenCalledTimes(1)
    // 비었을 때만 지우기로 묻는다(#447) - 확인과 삭제를 따로 하지 않는다
    expect(deleteConversationIfEmpty).toHaveBeenCalledWith('c1')
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(getMessages).not.toHaveBeenCalled()
    expect(result.current.conversations).toEqual([])
    // 다음 전송이 지운 대화로 나가지 않게 새 대화 상태로 돌아간다
    expect(result.current.activeId).toBeNull()
    // 목록은 지운 뒤에 다시 받는다 - 먼저 받으면 지우기 전 목록으로 되살아난다
    const deleteOrder = vi.mocked(deleteConversationIfEmpty).mock.invocationCallOrder[0]
    const lastList = vi.mocked(listConversations).mock.invocationCallOrder.at(-1)!
    expect(lastList).toBeGreaterThan(deleteOrder)
  })

  it('기존 대화에서 200 전에 중단하면 글만 되돌리고 대화는 지우지 않음 (#440)', async () => {
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    // 첫 턴이 열려 있으면 두 번째 전송이 거절되므로 끝낸다
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    vi.mocked(deleteConversation).mockClear()
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(giveBack).toHaveBeenCalledTimes(1)
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(deleteConversationIfEmpty).not.toHaveBeenCalled()
    expect(result.current.activeId).toBe('c1')
  })

  it('200 전에 끊었어도 서버가 질문을 저장했으면(409) 남기고, 되돌리지도 지우지도 않음 (#440 · #447)', async () => {
    // 서버는 질문 저장 · 첨부 연결을 커밋한 뒤 200 을 돌려준다 - 그 사이의 중단은 이미 저장된 턴이다.
    // 지우면 저장된 질문이 사라지고, 되돌린 첨부는 이미 쓰여 다시 보낼 수 없다
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    // 답 없는 질문이 재확인 구간 내내 남는 경우다(#489) - 걷히지 않았으니 저장됨이다
    holdStored([{ id: 'm1', role: 'user', content: '환불 정책', status: 'complete', citations: [] }], true)

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })

    expect(giveBack).not.toHaveBeenCalled()
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(result.current.activeId).toBe('c1')
    expect(result.current.messages.map((m) => m.content)).toEqual(['환불 정책'])
  })

  it('조건부 삭제가 실패하면 글은 되돌리되 대화는 남음 (#440 · #447)', async () => {
    // 지우지 못했으니 대화는 그대로다 - 저장됐는지 모르지만 입력은 잃지 않는다
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    vi.mocked(deleteConversationIfEmpty).mockRejectedValueOnce(new Error('network'))

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(giveBack).toHaveBeenCalledTimes(1)
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(result.current.activeId).toBe('c1')
  })

  it('409 인데 이력을 못 받아도 되돌리지 않음 (#447)', async () => {
    // 저장된 것은 확실하다 - 되돌리면 같은 질문이 두 번 나가고, 이미 쓰인 첨부는 400 이다
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    vi.mocked(deleteConversationIfEmpty).mockRejectedValueOnce(new ApiError(409, '메시지가 있는 대화는 지우지 않음'))
    vi.mocked(getMessages).mockRejectedValueOnce(new Error('network'))

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(giveBack).not.toHaveBeenCalled()
    expect(result.current.activeId).toBe('c1')
    // 저장된 질문이 화면에서 사라지지 않게 말풍선을 되살린다
    expect(result.current.messages.map((m) => m.content)).toEqual(['환불 정책'])
  })

  it('조건부 삭제가 404 면 이미 지워진 것으로 보고 새 대화 상태로 돌아간다 (#447)', async () => {
    // 다른 탭에서 지웠거나 앞선 삭제의 응답을 잃은 경우 - 대화를 남겨 두면 다음 전송이 「대화 없음」이다
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    vi.mocked(deleteConversationIfEmpty).mockRejectedValueOnce(new ApiError(404, '대화 없음'))

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(giveBack).toHaveBeenCalledTimes(1)
    expect(result.current.activeId).toBeNull()
    expect(result.current.conversations).toEqual([])
  })

  it('기존 대화는 이력으로 가른다 - 마지막이 보낸 질문이면 남기고 되돌리지 않음 (#440)', async () => {
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))
    holdStored([
      { id: 'm1', role: 'user', content: '첫 질문', status: 'complete', citations: [] },
      { id: 'm2', role: 'assistant', content: '답', status: 'complete', citations: [] },
      { id: 'm3', role: 'user', content: '둘째 질문', status: 'complete', citations: [] },
    ])

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })

    expect(giveBack).not.toHaveBeenCalled()
    expect(deleteConversationIfEmpty).not.toHaveBeenCalled()
    expect(result.current.messages.map((m) => m.content)).toEqual(['첫 질문', '답', '둘째 질문'])
  })

  it('서버가 질문을 걷었으면(#489) 이력에 보낸 질문이 없어 글과 첨부 카드를 함께 되돌린다', async () => {
    // 서버는 토큰을 하나도 못 보내고 끊긴 턴의 질문을 지우고 첨부 연결만 푼다 - 카드는 다시 보낼 수 있다
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const card = { id: 'a1', fileType: 'image' as const, url: '/api/files/a1' }
    await startStream(() => result.current.send('둘째 질문', [card], giveBack))
    vi.mocked(getMessages).mockResolvedValueOnce([
      { id: 'm1', role: 'user', content: '첫 질문', status: 'complete', citations: [] },
      { id: 'm2', role: 'assistant', content: '답', status: 'complete', citations: [] },
    ])

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    // false = 글만이 아니라 카드까지 되돌린다
    expect(giveBack).toHaveBeenCalledWith(false)
    expect(deleteConversationIfEmpty).not.toHaveBeenCalled()
    // 걷힌 질문 말풍선은 다시 붙지 않는다 - 입력창으로 돌아갔다
    expect(result.current.messages.map((m) => m.content)).not.toContain('둘째 질문')
    expect(result.current.activeId).toBe('c1')
  })

  it('저장됨으로 보였어도 재확인에서 질문이 사라지면(#489 철회) 되돌리고 새 대화는 조건부 삭제를 다시 한다', async () => {
    // 서버는 끊김을 다음 이벤트를 쓸 때 알아챈다 - 첫 확인이 철회보다 먼저 처리되면 409 · 질문만 있는 이력이다
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    vi.mocked(deleteConversationIfEmpty).mockRejectedValueOnce(new ApiError(409, '메시지가 있는 대화는 지우지 않음'))
    vi.mocked(getMessages).mockResolvedValueOnce([
      { id: 'm1', role: 'user', content: '환불 정책', status: 'complete', citations: [] },
    ])

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    expect(giveBack).not.toHaveBeenCalled()
    // 다음 확인에서는 질문이 없다(기본 모의 [] · 조건부 삭제 204)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS)
    })

    expect(giveBack).toHaveBeenCalledWith(false)
    expect(deleteConversationIfEmpty).toHaveBeenCalledTimes(2)
    expect(result.current.activeId).toBeNull()
    expect(result.current.conversations).toEqual([])
    expect(result.current.streaming).toBe(false)
  })

  it('재확인에서 질문 뒤에 답 행이 생기면 저장됨으로 확정한다 (#489)', async () => {
    // 끊기기 전에 서버가 보낸 토큰이 있었으면 stopped 부분 답이 저장된다 - 질문은 걷히지 않는다
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))
    const asked: ChatMessage[] = [
      { id: 'm1', role: 'user', content: '첫 질문', status: 'complete', citations: [] },
      { id: 'm2', role: 'assistant', content: '답', status: 'complete', citations: [] },
      { id: 'm3', role: 'user', content: '둘째 질문', status: 'complete', citations: [] },
    ]
    vi.mocked(getMessages)
      .mockResolvedValueOnce(asked)
      .mockResolvedValueOnce([
        ...asked,
        { id: 'm4', role: 'assistant', content: '부분', status: 'complete', stopped: true, citations: [] },
      ])

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS)
    })

    expect(giveBack).not.toHaveBeenCalled()
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
    expect(result.current.streaming).toBe(false)
  })

  it('재확인 구간 내내 질문만 있으면 지금처럼 저장됨으로 남긴다 (#489)', async () => {
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    holdStored([{ id: 'm1', role: 'user', content: '환불 정책', status: 'complete', citations: [] }], true)

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    // 구간 동안은 판정 중이라 다시 보내기가 막힌다
    expect(result.current.streaming).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })

    expect(giveBack).not.toHaveBeenCalled()
    // 첫 확인 1번 + 간격마다 1번
    expect(getMessages).toHaveBeenCalledTimes(1 + Math.floor(RECHECK_WINDOW_MS / RECHECK_INTERVAL_MS))
    expect(result.current.messages.map((m) => m.content)).toEqual(['환불 정책'])
    expect(result.current.activeId).toBe('c1')
    expect(result.current.streaming).toBe(false)
  })

  /** 첫 턴을 정상 완료해 「기존 대화」 상태를 만든다 */
  async function existingConversation() {
    const first = openStream()
    const hook = renderHook(() => useChat())
    await startStream(() => hook.result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    return hook
  }

  const askedTwice: ChatMessage[] = [
    { id: 'm1', role: 'user', content: '첫 질문', status: 'complete', citations: [] },
    { id: 'm2', role: 'assistant', content: '답', status: 'complete', citations: [] },
    { id: 'm3', role: 'user', content: '둘째 질문', status: 'complete', citations: [] },
  ]

  it('200 뒤 토큰 0개에서 중단이 아닌 끊김(종단 이벤트 없음)도 판정해, 서버가 걷었으면 되돌린다 (#489 리뷰)', async () => {
    const stream = openStream()
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))

    await act(async () => {
      stream.handlers?.onError?.('응답이 중간에 끊겼습니다')
      stream.fail?.(new Error('응답이 중간에 끊겼습니다'))
    })

    expect(deleteConversationIfEmpty).toHaveBeenCalledWith('c1')
    expect(giveBack).toHaveBeenCalledWith(false)
    expect(result.current.messages).toHaveLength(0)
  })

  it('200 뒤 토큰 0개 끊김에 서버가 error 답 행을 남겼으면(타임아웃 #359) 저장됨 - 실패 말풍선을 겹쳐 붙이지 않는다 (#489 리뷰)', async () => {
    const { result } = await existingConversation()
    const stream = openStream()
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))
    vi.mocked(getMessages).mockResolvedValueOnce([
      ...askedTwice,
      { id: 'm4', role: 'assistant', content: '', status: 'error', citations: [] },
    ])

    await act(async () => {
      stream.handlers?.onError?.('응답이 중간에 끊겼습니다')
      stream.fail?.(new Error('응답이 중간에 끊겼습니다'))
    })

    expect(giveBack).not.toHaveBeenCalled()
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4'])
  })

  it('새 대화의 재확인 중에 대화를 옮기면 옮긴 화면에서 곧바로 보낼 수 있고, 빈 대화 정리는 계속한다 (#489 리뷰)', async () => {
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    holdStored([{ id: 'm1', role: 'user', content: '환불 정책', status: 'complete', citations: [] }], true)
    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    expect(result.current.streaming).toBe(true)

    await act(async () => {
      await result.current.selectConversation('c9')
    })
    expect(result.current.streaming).toBe(false)
    openStream()
    let accepted = false
    await act(async () => {
      accepted = await result.current.send('다른 질문', [])
    })
    expect(accepted).toBe(true)
    const before = vi.mocked(getMessages).mock.calls.filter((c) => c[0] === 'c1').length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_INTERVAL_MS)
    })
    // 새 대화는 빈 대화를 치워야 하므로 판정을 이어 간다
    expect(vi.mocked(getMessages).mock.calls.filter((c) => c[0] === 'c1').length).toBeGreaterThan(before)
    // 옮긴 대화의 스트림 상태를 앞 턴의 정리가 덮지 않는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })
    expect(result.current.streaming).toBe(true)
    expect(giveBack).not.toHaveBeenCalled()
  })

  it('판정 중에 대화를 옮기면 옮겨 간 화면에는 settling 이 없고 곧바로 보낼 수 있다 (#483 · #489 통합)', async () => {
    // 200 뒤 토큰 0개 중단도 판정 구간이다 - 재확인 동안 settling 이 서고, 옮기면 잠금과 함께 내린다
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))
    holdStored([{ id: 'm1', role: 'user', content: '환불 정책', status: 'complete', citations: [] }], true)
    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    expect(result.current.settling).toBe(true)

    await act(async () => {
      await result.current.selectConversation('c9')
    })
    expect(result.current.settling).toBe(false)
    const next = openStream()
    let accepted = false
    await act(async () => {
      accepted = await result.current.send('다른 질문', [])
    })
    expect(accepted).toBe(true)
    // 뒤에서 이어 간 판정이 끝나도 옮겨 간 화면의 스트림 · settling 을 덮지 않는다
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })
    expect(result.current.settling).toBe(false)
    expect(result.current.streaming).toBe(true)
    expect(next.handlers).toBeDefined()
  })

  it('기존 대화의 재확인 중에 대화를 옮기면 재확인을 곧바로 멈춘다 (#489 리뷰)', async () => {
    const { result } = await existingConversation()
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))
    holdStored(askedTwice)
    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    await act(async () => {
      await result.current.selectConversation('c9')
    })
    const before = vi.mocked(getMessages).mock.calls.filter((c) => c[0] === 'c1').length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })

    expect(vi.mocked(getMessages).mock.calls.filter((c) => c[0] === 'c1').length).toBe(before)
    expect(giveBack).not.toHaveBeenCalled()
    expect(result.current.streaming).toBe(false)
  })

  it('재확인 중 401 이면 곧바로 끝낸다 - 확인 요청에는 시간 제한 신호가 붙는다 (#489 리뷰)', async () => {
    const { result } = await existingConversation()
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))
    vi.mocked(getMessages).mockResolvedValueOnce(askedTwice).mockRejectedValue(new ApiError(401, '인증 필요'))
    onTestFinished(() => void vi.mocked(getMessages).mockReset().mockResolvedValue([]))

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })

    const calls = vi.mocked(getMessages).mock.calls.filter((c) => c[0] === 'c1')
    expect(calls).toHaveLength(2)
    expect(calls[1][1]).toBeInstanceOf(AbortSignal)
    expect(result.current.streaming).toBe(false)
  })

  it('200 을 받은 뒤 토큰 0개에서 멈추면 200 전과 같은 판정을 탄다 (#489)', async () => {
    // 서버는 보낸 토큰이 없으면 질문을 걷는다 - 말풍선을 남기면 새로고침에 사라지고 글은 돌아오지 않는다
    const stream = openStream()
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    act(() => void stream.handlers?.onStage?.({ stage: 'analyzing', label: '질문 분석 중' }))

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(deleteConversationIfEmpty).toHaveBeenCalledWith('c1')
    expect(giveBack).toHaveBeenCalledWith(false)
    expect(result.current.messages).toHaveLength(0)
    expect(result.current.activeId).toBeNull()
  })

  it('토큰을 하나라도 받은 뒤의 중단은 되돌리지도 지우지도 않음 (#440 · #489)', async () => {
    // 서버가 질문 + 부분 답을 저장했으므로 말풍선이 남고, 입력창에 되돌리면 같은 글이 두 번 보인다
    const stream = openStream()
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    act(() => void stream.handlers?.onToken?.('부분'))

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(giveBack).not.toHaveBeenCalled()
    expect(deleteConversation).not.toHaveBeenCalled()
    expect(result.current.activeId).toBe('c1')
  })

  it('대화를 옮겨서 200 전에 끊기면 글은 되돌리지 않고 빈 대화는 지운다 (#440)', async () => {
    // 입력창은 대화마다 따로가 아니다 - 되돌리면 옮겨 간 대화로 그 글이 잘못 나갈 수 있다
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))

    await act(async () => {
      result.current.newConversation()
    })
    await abort(stream)

    expect(giveBack).not.toHaveBeenCalled()
    expect(deleteConversationIfEmpty).toHaveBeenCalledWith('c1')
    expect(result.current.conversations).toEqual([])
  })

  it('정상 완료 뒤 abort 예외가 나도 stopped 를 세우지 않음', async () => {
    // 서버는 그 답변을 stopped=false 로 저장했으므로, 화면만 stopped 가 되면
    // 무자료 배너가 화면과 재조회에서 갈림
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    act(() => {
      stream.handlers?.onToken?.('완성된 답변')
      // 서버가 보내는 done 페이로드 모양대로 부른다(ChatService: finishReason=stop + noSource).
      // **useChat 의 onDone 은 인자를 받지 않으므로 이 값은 단언에 영향을 주지 않는다** - 계약을
      // 재현하려고 넣는 것이다. noSource 가 나중에 실제 분기에 쓰이면 그 분기는 여기서 안 잡힌다
      stream.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
    })
    expect(result.current.messages[1].status).toBe('complete')

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(result.current.messages[1].content).toBe('완성된 답변')
    expect(result.current.messages[1].stopped).toBeFalsy()
  })

  it('내용이 비어도 onDone 이 확정했으면 버블을 지우지 않음', async () => {
    // 빈 버블 제거는 "중단으로 아무것도 못 받은" 경우만을 위한 것임. 정상 완료분은 서버가
    // 저장했으므로 지우면 새로고침에 되살아나 화면과 재조회가 어긋남
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    // noSource 값은 이 테스트를 가르지 않는다(위 케이스 주석) - 검증하는 것은 "onDone 이 왔다는 사실" 하나다
    act(() => void stream.handlers?.onDone?.({ finishReason: 'stop', noSource: true }))
    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(result.current.messages).toHaveLength(2)
    expect(result.current.messages[1].status).toBe('complete')
  })

  it('SSE 실패는 백지 대신 인라인 오류로 남음(AC-17)', async () => {
    // 에러 바운더리는 렌더 예외만 잡음 - 스트림 실패는 여기서 메시지 상태로 드러나야 함
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    act(() => void stream.handlers?.onError?.('응답 생성 중 오류'))

    expect(result.current.messages[0].content).toBe('환불 정책') // 화면이 비지 않음
    expect(result.current.messages[1].status).toBe('error')
    expect(result.current.error).toBe('응답 생성 중 오류')
  })

  /** streamChat 의 200 전 거절과 같은 모양 - onError 를 부르고 ApiError 를 던진다 */
  async function reject(stream: ReturnType<typeof openStream>, status: number, message: string) {
    await act(async () => {
      stream.handlers?.onError?.(message)
      stream.fail?.(new ApiError(status, message))
    })
  }

  it('200 전 429 거절은 판정 없이 보낸 것을 되돌리고, 말풍선 · 빈 대화를 남기지 않고, 오류를 보인다 (#480)', async () => {
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))
    expect(result.current.activeId).toBe('c1')

    await reject(stream, 429, '동시 스트림 상한 초과')

    expect(giveBack).toHaveBeenCalledTimes(1)
    // 429 는 때의 문제라 첨부 카드도 되돌린다
    expect(giveBack).toHaveBeenCalledWith(false)
    expect(result.current.messages).toHaveLength(0)
    // 새 대화는 비었을 때만 지우기로 정리한다(#447) - 이력으로 묻지 않는다
    expect(deleteConversationIfEmpty).toHaveBeenCalledWith('c1')
    expect(getMessages).not.toHaveBeenCalled()
    expect(result.current.conversations).toEqual([])
    expect(result.current.activeId).toBeNull()
    expect(result.current.error).toBe('동시 스트림 상한 초과')
  })

  it('기존 대화의 200 전 4xx 거절은 서버에 묻지 않고 되돌리며 대화는 지우지 않음 (#480)', async () => {
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))

    await reject(stream, 400, '메시지는 4000자까지 보낼 수 있음')

    expect(giveBack).toHaveBeenCalledTimes(1)
    // 그 밖의 4xx 는 카드가 거절 원인일 수 있어 글만 되돌린다 - 카드까지 돌리면 다시 보내도 같은 거절이다
    expect(giveBack).toHaveBeenCalledWith(true)
    expect(getMessages).not.toHaveBeenCalled()
    expect(deleteConversationIfEmpty).not.toHaveBeenCalled()
    expect(result.current.messages.map((m) => m.content)).toEqual(['첫 질문', ''])
    expect(result.current.activeId).toBe('c1')
    expect(result.current.error).toBe('메시지는 4000자까지 보낼 수 있음')
  })

  it('200 전 fetch reject(네트워크)는 서버에 물어 되돌리고, 빈 대화를 지우고, 오류 배너를 보인다 (#480)', async () => {
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))

    // fetch 자체가 실패하면 streamChat 은 onError 없이 던진다
    await act(async () => {
      stream.fail?.(new TypeError('Failed to fetch'))
    })

    expect(giveBack).toHaveBeenCalledTimes(1)
    expect(giveBack).toHaveBeenCalledWith(false)
    expect(result.current.messages).toHaveLength(0)
    expect(deleteConversationIfEmpty).toHaveBeenCalledWith('c1')
    expect(result.current.conversations).toEqual([])
    expect(result.current.activeId).toBeNull()
    expect(result.current.error).toBeTruthy()
  })

  it('200 전 5xx 는 닿았을 수 있어 서버에 묻는다 - 질문이 저장됐으면 남기고 실패한 답 말풍선을 붙인다 (#480)', async () => {
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))
    const saved: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '첫 질문', status: 'complete', citations: [] },
      { id: 'a1', role: 'assistant', content: '답', status: 'complete', citations: [] },
      { id: 'u2', role: 'user', content: '둘째 질문', status: 'complete', citations: [] },
    ]
    holdStored(saved)

    await reject(stream, 502, '요청 실패 (502)')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECHECK_WINDOW_MS)
    })

    expect(getMessages).toHaveBeenCalledWith('c1')
    expect(giveBack).not.toHaveBeenCalled()
    // 200 전에 끊긴 턴은 서버가 답을 만들지 않는다(#487 실측) - 저장 이력 뒤에 실패한 답을 붙여 실패를 보인다
    expect(result.current.messages.map((m) => m.id).slice(0, 3)).toEqual(['u1', 'a1', 'u2'])
    expect(result.current.messages).toHaveLength(4)
    expect(result.current.messages[3]).toMatchObject({ role: 'assistant', status: 'error', content: '' })
    expect(result.current.error).toBe('요청 실패 (502)')
  })

  it('기존 대화의 200 전 404 는 대화가 지워졌는지 물어, 지워졌으면 목록에서 빼고 새 대화 상태로 돌아간다 (#480)', async () => {
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))
    // 다른 탭에서 지운 대화
    vi.mocked(getMessages).mockRejectedValueOnce(new ApiError(404, '대화 없음'))

    await reject(stream, 404, '대화 없음')

    expect(getMessages).toHaveBeenCalledWith('c1')
    expect(giveBack).toHaveBeenCalledWith(true)
    expect(result.current.conversations).toEqual([])
    expect(result.current.activeId).toBeNull()
    expect(result.current.messages).toEqual([])
    expect(result.current.error).toBe('대화 없음')
  })

  it('기존 대화의 200 전 404 「첨부 없음」은 대화가 있으면 대화를 그대로 둔다 (#480)', async () => {
    const first = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('첫 질문', []))
    await act(async () => {
      first.handlers?.onDone?.({ finishReason: 'stop', noSource: false })
      first.finish?.()
    })
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    await startStream(() => result.current.send('둘째 질문', [], giveBack))

    await reject(stream, 404, '첨부 없음')

    expect(getMessages).toHaveBeenCalledWith('c1')
    expect(giveBack).toHaveBeenCalledWith(true)
    expect(result.current.activeId).toBe('c1')
    expect(result.current.messages.map((m) => m.content)).toEqual(['첫 질문', ''])
  })

  it('200 전 401 은 판정 · 빈 대화 삭제를 건너뛴다 (#480)', async () => {
    // 토큰이 만료돼 로그아웃으로 가는 길 - 같은 토큰으로 더 물어도 401 이다
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))

    await reject(stream, 401, '인증 필요')

    expect(deleteConversationIfEmpty).not.toHaveBeenCalled()
    expect(getMessages).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(0)
  })

  it('새 대화의 200 전 4xx 뒤 빈 대화 삭제가 실패하면 글은 되돌리고 대화는 남는다 (#480)', async () => {
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    vi.mocked(deleteConversationIfEmpty).mockRejectedValueOnce(new ApiError(500, '서버 오류'))
    // 첫 로드와 실패 뒤 다시 받는 목록 - 지우지 못한 대화가 서버에 남아 있다
    const kept = { id: 'c1', title: '새 대화', updatedAt: '' }
    vi.mocked(listConversations).mockResolvedValueOnce([]).mockResolvedValueOnce([kept])
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))

    await reject(stream, 429, '동시 스트림 상한 초과')

    expect(deleteConversationIfEmpty).toHaveBeenCalledWith('c1')
    expect(giveBack).toHaveBeenCalledWith(false)
    expect(result.current.conversations.map((c) => c.id)).toEqual(['c1'])
    expect(result.current.activeId).toBe('c1')
    expect(result.current.messages).toHaveLength(0)
  })

  // #483 F17 : 판정 중에는 다시 보내기가 거절된다. 그 사실을 settling 으로 드러내 입력창이 정지 버튼 대신 비활성 보내기를 보이게 한다
  it('200 전 판정이 도는 동안 settling 이 참이고 끝나면 거짓이다 (#483)', async () => {
    const stream = openStream({ opened: false })
    let finishDelete: () => void = () => {}
    vi.mocked(deleteConversationIfEmpty).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishDelete = resolve)),
    )
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], vi.fn()))
    expect(result.current.settling).toBe(false)

    await act(async () => {
      stream.fail?.(new TypeError('Failed to fetch'))
    })
    expect(result.current.settling).toBe(true)
    expect(result.current.streaming).toBe(true)

    await act(async () => finishDelete())
    expect(result.current.settling).toBe(false)
    expect(result.current.streaming).toBe(false)
  })

  it('비중단 실패 뒤 판정 중에 대화를 옮기면 되돌리지 않고 빈 대화는 지운다 (#480)', async () => {
    const stream = openStream({ opened: false })
    const giveBack = vi.fn()
    let finishDelete: () => void = () => {}
    vi.mocked(deleteConversationIfEmpty).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finishDelete = resolve)),
    )
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', [], giveBack))

    await act(async () => {
      stream.fail?.(new TypeError('Failed to fetch'))
    })
    await act(async () => {
      await result.current.selectConversation('c9')
    })
    await act(async () => finishDelete())

    expect(giveBack).not.toHaveBeenCalled()
    expect(result.current.conversations).toEqual([])
    expect(result.current.activeId).toBe('c9')
  })
})

describe('useChat 대화 전환 시 이전 스트림 중단', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  /** 스트림을 열고 단계를 하나 띄운 상태를 만듦 */
  async function streamingWithStage() {
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))
    act(() => {
      stream.handlers?.onStage?.({ stage: 'searching', label: '목업 코퍼스 조회 중' })
      stream.handlers?.onToken?.('부분 답변')
    })
    expect(result.current.stage).toBe('목업 코퍼스 조회 중')
    return { stream, result }
  }

  it('다른 대화를 고르면 이전 스트림이 끊기고 단계가 잔류하지 않음', async () => {
    const { stream, result } = await streamingWithStage()

    await act(async () => {
      void result.current.selectConversation('c2')
      stream.fail?.(new DOMException('aborted', 'AbortError'))
    })

    expect(stream.signal?.aborted).toBe(true)
    expect(result.current.stage).toBeNull()
    // 이전 턴의 부분 답변이 새 대화 화면으로 넘어오지 않아야 함
    expect(result.current.messages).toHaveLength(0)

    act(() => void vi.advanceTimersByTime(1000))
    expect(result.current.stage).toBeNull()
  })

  it('새 대화를 열어도 이전 스트림이 끊김', async () => {
    const { stream, result } = await streamingWithStage()

    await act(async () => {
      result.current.newConversation()
      stream.fail?.(new DOMException('aborted', 'AbortError'))
    })

    expect(stream.signal?.aborted).toBe(true)
    expect(result.current.stage).toBeNull()
    expect(result.current.messages).toHaveLength(0)
  })

  it('스트리밍 중인 대화를 삭제하면 그 스트림이 끊김', async () => {
    // 안 끊으면 사라진 대화에 대고 서버가 계속 씀
    const { stream, result } = await streamingWithStage()

    await act(async () => {
      void result.current.deleteConversation('c1')
      stream.fail?.(new DOMException('aborted', 'AbortError'))
    })

    expect(stream.signal?.aborted).toBe(true)
    expect(result.current.stage).toBeNull()
  })
})

describe('useChat 새 대화 제목(#434)', () => {
  afterEach(() => vi.clearAllMocks())

  it('제목은 코드 포인트 30자로 자른다 - 이모지를 반으로 가르지 않음', async () => {
    // UTF-16 slice 면 29번째 자리의 이모지가 반쪽 서로게이트로 잘려, 서버가 400 으로 거절한다
    openStream()
    const { createConversation } = await import('../lib/endpoints')
    const { result } = renderHook(() => useChat())
    const text = '가'.repeat(29) + '😀' + '뒤'

    await startStream(() => result.current.send(text, []))

    const title = vi.mocked(createConversation).mock.calls[0][0]
    expect(title).toBe('가'.repeat(29) + '😀')
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(title)).toBe(false)
  })
})
