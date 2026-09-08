import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChat } from './useChat'
import type { ChatStreamHandlers } from '../lib/endpoints'

vi.mock('../lib/endpoints', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn().mockResolvedValue({
    id: 'c1',
    title: '새 대화',
    createdAt: '',
    updatedAt: '',
  }),
  getMessages: vi.fn().mockResolvedValue([]),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
  streamChat: vi.fn(),
}))

const { streamChat } = await import('../lib/endpoints')

/** 스트림을 열어 둔 채 핸들러를 직접 호출할 수 있게 함 */
function openStream() {
  const control: {
    handlers?: ChatStreamHandlers
    signal?: AbortSignal
    finish?: () => void
    fail?: (e: unknown) => void
  } = {}
  vi.mocked(streamChat).mockImplementation((_body, handlers, signal) => {
    control.handlers = handlers
    control.signal = signal
    return new Promise<void>((resolve, reject) => {
      control.finish = resolve
      control.fail = reject
    })
  })
  return control
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

    // 남은 큐가 되살아나지 않아야 함(잔류 0, AC-23)
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
    // 남겨 두면 새로고침에 사라짐 - 서버도 부분 텍스트가 비면 저장하지 않음(2026-07-28 정책)
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))
    expect(result.current.messages).toHaveLength(2)

    await act(async () => {
      result.current.stop()
    })
    await abort(stream)

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe('user')
  })

  it('정상 완료 뒤 abort 예외가 나도 stopped 를 세우지 않음', async () => {
    // 서버는 그 답변을 stopped=false 로 저장했으므로, 화면만 stopped 가 되면
    // 무자료 배너가 화면과 재조회에서 갈림(재리뷰 라운드 2 N-4)
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    act(() => {
      stream.handlers?.onToken?.('완성된 답변')
      // 서버가 실제로 보내는 done 페이로드와 같은 모양임(ChatService: finishReason=stop + noSource)
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
    // 저장했으므로 지우면 새로고침에 되살아나 화면과 재조회가 어긋남(재리뷰 라운드 3 ③)
    const stream = openStream()
    const { result } = renderHook(() => useChat())
    await startStream(() => result.current.send('환불 정책', []))

    // 토큰이 하나도 안 왔으니 인용도 없음 - 서버라면 noSource=true 로 보냈을 상황임
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
