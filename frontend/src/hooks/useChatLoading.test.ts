import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChat } from './useChat'
import type { ChatMessage } from '../lib/types'

vi.mock('../lib/endpoints', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
  streamChat: vi.fn().mockResolvedValue(undefined),
}))

const { getMessages } = await import('../lib/endpoints')

/** 손으로 끝낼 수 있는 프라미스 - 「이력이 도착하는 순간」을 테스트가 정함 */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const msg = (id: string): ChatMessage => ({
  id,
  role: 'user',
  content: id,
  status: 'complete',
  createdAt: '',
  citations: [],
})

/** 대화를 고른 뒤 이력이 올 때까지의 로딩 상태(#291) */
describe('useChat 이력 불러오는 중', () => {
  afterEach(() => vi.clearAllMocks())

  it('고른 순간부터 도착할 때까지 loadingMessages 가 켜진다', async () => {
    const a = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockReturnValueOnce(a.promise)
    const { result } = renderHook(() => useChat())

    act(() => void result.current.selectConversation('a'))
    expect(result.current.loadingMessages).toBe(true)

    await act(async () => a.resolve([msg('a-1')]))
    expect(result.current.loadingMessages).toBe(false)
    expect(result.current.messages.map((m) => m.id)).toEqual(['a-1'])
  })

  it('A→B 를 빠르게 누르면 A 가 먼저 와도 B 가 올 때까지 로딩이 유지된다', async () => {
    const a = deferred<ChatMessage[]>()
    const b = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
    const { result } = renderHook(() => useChat())

    act(() => void result.current.selectConversation('a'))
    act(() => void result.current.selectConversation('b'))
    await act(async () => a.resolve([msg('a-1')]))
    expect(result.current.loadingMessages).toBe(true)

    await act(async () => b.resolve([msg('b-1')]))
    expect(result.current.loadingMessages).toBe(false)
    expect(result.current.messages.map((m) => m.id)).toEqual(['b-1'])
  })

  it('불러오기가 실패해도 로딩이 끝난다', async () => {
    const a = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockReturnValueOnce(a.promise)
    const { result } = renderHook(() => useChat())

    act(() => void result.current.selectConversation('a'))
    await act(async () => a.reject(new Error('down')))
    expect(result.current.loadingMessages).toBe(false)
    expect(result.current.messages).toEqual([])
  })

  it('불러오는 중에 새 대화를 누르면 로딩이 바로 끝난다', async () => {
    const a = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockReturnValueOnce(a.promise)
    const { result } = renderHook(() => useChat())

    act(() => void result.current.selectConversation('a'))
    act(() => result.current.newConversation())
    expect(result.current.loadingMessages).toBe(false)

    await act(async () => a.resolve([msg('a-1')]))
    expect(result.current.loadingMessages).toBe(false)
    expect(result.current.messages).toEqual([])
  })
})
