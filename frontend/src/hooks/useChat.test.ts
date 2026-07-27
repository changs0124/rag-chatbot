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
  uploadFile: vi.fn(),
  streamChat: vi.fn(),
}))

const { streamChat } = await import('../lib/endpoints')

/** 스트림을 열어 둔 채 핸들러를 직접 호출할 수 있게 함 */
function openStream() {
  const control: {
    handlers?: ChatStreamHandlers
    finish?: () => void
    fail?: (e: unknown) => void
  } = {}
  vi.mocked(streamChat).mockImplementation((_body, handlers) => {
    control.handlers = handlers
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
