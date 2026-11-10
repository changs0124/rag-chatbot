import { StrictMode } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChat } from './useChat'
import type { ChatMessage, Conversation } from '../lib/types'
import { deferred, msg } from '../test/fixtures'

vi.mock('../lib/endpoints', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  deleteConversation: vi.fn(),
  deleteConversationIfEmpty: vi.fn().mockResolvedValue(undefined),
  renameConversation: vi.fn(),
  streamChat: vi.fn().mockResolvedValue(undefined),
}))

const { getMessages, listConversations, streamChat } = await import('../lib/endpoints')

const conv = (id: string): Conversation => ({ id, title: id, updatedAt: '2026-11-10T00:00:00Z' })

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
    // 빈 화면만 남기면 이력이 있는 대화가 새 대화처럼 보인다(#359)
    expect(result.current.error).toBe('대화를 불러오지 못했습니다')
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
  /**
   * #323 F1 - 이력이 오는 동안 보낸 메시지는 받지 않는다.
   *
   * 고치기 전에는 받아 들여 직전 대화의 목록에 말풍선을 붙이고 스트림을 열었는데, 곧이어 도착한 이력이
   * 목록을 갈아 끼워 답 말풍선이 사라졌다. 이후 토큰은 갈 곳을 잃어 대화를 다시 골라야 답이 보였다.
   */
  it('불러오는 중에 보낸 메시지는 받지 않는다', async () => {
    const a = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockReturnValueOnce(a.promise)
    const { result } = renderHook(() => useChat())

    act(() => void result.current.selectConversation('c1'))
    let accepted: unknown
    await act(async () => {
      accepted = await result.current.send('q', [])
    })
    await act(async () => a.resolve([msg('c1-1')]))

    expect(streamChat).not.toHaveBeenCalled()
    expect(result.current.messages.map((m) => m.id)).toEqual(['c1-1'])
    expect(accepted).toBe(false)
  })

  /** 반대편 - 이력이 도착하면 막음이 풀려 전송을 받는다(#323) */
  it('이력이 도착한 뒤에는 전송을 받는다', async () => {
    const a = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockReturnValueOnce(a.promise)
    const { result } = renderHook(() => useChat())

    act(() => void result.current.selectConversation('c1'))
    await act(async () => a.resolve([msg('c1-1')]))

    let accepted: unknown
    await act(async () => {
      accepted = await result.current.send('q', [])
    })
    expect(accepted).toBe(true)
    expect(streamChat).toHaveBeenCalledTimes(1)
  })

  /** 첫 목록이 오기 전에는 빈 배열이 「없음」이 아니다(#663) - 사이드바가 스켈레톤을 깔 수 있게 로딩을 따로 알린다 */
  it('첫 대화 목록이 오는 동안 conversationsLoading 이 켜지고, 목록이 오면 꺼진다', async () => {
    const list = deferred<Conversation[]>()
    vi.mocked(listConversations).mockReturnValueOnce(list.promise)
    const { result } = renderHook(() => useChat())
    expect(result.current.conversationsLoading).toBe(true)

    await act(async () => list.resolve([conv('a')]))
    expect(result.current.conversationsLoading).toBe(false)
    expect(result.current.conversations.map((c) => c.id)).toEqual(['a'])
  })

  it('빈 목록이 와도 · 실패해도 로딩은 꺼진다(실패는 오류가 따로 알린다, #385)', async () => {
    vi.mocked(listConversations).mockResolvedValueOnce([])
    const empty = renderHook(() => useChat())
    await act(async () => {})
    expect(empty.result.current.conversationsLoading).toBe(false)
    expect(empty.result.current.conversations).toEqual([])

    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const failed = renderHook(() => useChat())
    await act(async () => {})
    expect(failed.result.current.conversationsLoading).toBe(false)
    expect(failed.result.current.error).toBe('대화 목록을 불러오지 못했습니다')
  })

  /** StrictMode(개발)는 첫 로드를 두 번 낸다 - 세대에 막힌 앞 요청이 먼저 끝나도 뒤 요청이 올 때까지 로딩을 유지한다 */
  it('StrictMode 에서 앞 요청이 먼저 끝나도 마지막 요청이 올 때까지 로딩이 유지된다', async () => {
    const first = deferred<Conversation[]>()
    const second = deferred<Conversation[]>()
    vi.mocked(listConversations).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useChat(), { wrapper: StrictMode })

    await act(async () => first.resolve([]))
    expect(result.current.conversationsLoading).toBe(true)

    await act(async () => second.resolve([conv('a')]))
    expect(result.current.conversationsLoading).toBe(false)
    expect(result.current.conversations.map((c) => c.id)).toEqual(['a'])
  })

  /** 오류 배너는 다른 동작이 걷어 가므로 목록 실패를 따로 든다(#675) - 다시 시도가 성공하면 내린다 */
  it('첫 로드가 실패하면 conversationsFailed 가 켜지고 오류가 걷혀도 남으며, 다시 시도가 성공하면 꺼진다', async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useChat())
    await act(async () => {})
    expect(result.current.conversationsFailed).toBe(true)

    act(() => result.current.newConversation())
    expect(result.current.error).toBeNull()
    expect(result.current.conversationsFailed).toBe(true)

    const again = deferred<Conversation[]>()
    vi.mocked(listConversations).mockReturnValueOnce(again.promise)
    act(() => result.current.retryConversations())
    expect(result.current.conversationsLoading).toBe(true)
    await act(async () => again.resolve([conv('a')]))
    expect(result.current.conversationsLoading).toBe(false)
    expect(result.current.conversationsFailed).toBe(false)
    expect(result.current.conversations.map((c) => c.id)).toEqual(['a'])
  })

  it('다시 시도도 실패하면 실패 표시가 남고 로딩은 꺼진다', async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useChat())
    await act(async () => {})
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('still down'))
    await act(async () => result.current.retryConversations())
    expect(result.current.conversationsLoading).toBe(false)
    expect(result.current.conversationsFailed).toBe(true)
  })

  // #684 : 다시 시도가 성공했는데 입력창 위 「대화 목록을 불러오지 못했습니다」가 그대로 남았다
  it('다시 시도가 성공하면 목록 오류 줄이 걷힌다(다른 동작 없이)', async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useChat())
    await act(async () => {})
    expect(result.current.error).toBe('대화 목록을 불러오지 못했습니다')

    vi.mocked(listConversations).mockResolvedValueOnce([conv('a')])
    await act(async () => result.current.retryConversations())
    expect(result.current.error).toBeNull()
    expect(result.current.conversationsFailed).toBe(false)
  })

  it('다시 시도가 또 실패하면 걷혔던 오류 줄을 다시 건다', async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useChat())
    await act(async () => {})
    act(() => result.current.newConversation())
    expect(result.current.error).toBeNull()

    vi.mocked(listConversations).mockRejectedValueOnce(new Error('still down'))
    await act(async () => result.current.retryConversations())
    expect(result.current.error).toBe('대화 목록을 불러오지 못했습니다')
  })

  it('세대가 밀린 다시 시도 응답은 실패 표시를 건드리지 않는다', async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useChat())
    await act(async () => {})
    const stale = deferred<Conversation[]>()
    vi.mocked(listConversations).mockReturnValueOnce(stale.promise)
    act(() => result.current.retryConversations())
    // 그 사이 목록을 고친 다른 동작(삭제 성공)이 세대를 올렸다 - 늦게 온 옛 응답은 버린다
    const { deleteConversation } = await import('../lib/endpoints')
    vi.mocked(deleteConversation).mockResolvedValueOnce(undefined)
    await act(async () => void (await result.current.deleteConversation('z')))
    await act(async () => stale.resolve([conv('a')]))
    expect(result.current.conversationsFailed).toBe(true)
    expect(result.current.conversations).toEqual([])
  })

  it('다른 오류는 다시 시도가 덮지 않는다', async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useChat())
    await act(async () => {})
    vi.mocked(listConversations).mockResolvedValueOnce([conv('a')])
    const { deleteConversation } = await import('../lib/endpoints')
    vi.mocked(deleteConversation).mockRejectedValueOnce(new Error('x'))
    let ok: unknown
    await act(async () => {
      ok = await result.current.deleteConversation('a')
    })
    expect(ok).toBe(false)
    const other = result.current.error
    expect(other).not.toBe('대화 목록을 불러오지 못했습니다')
    await act(async () => result.current.retryConversations())
    expect(result.current.error).toBe(other)
  })

  /** 대화 목록 첫 로드가 실패하면 「대화가 없습니다」가 아니라 오류로 알린다(#385, #77 · #359 와 같은 이유) */
  it('대화 목록을 처음 불러오지 못하면 오류를 띄운다', async () => {
    vi.mocked(listConversations).mockRejectedValueOnce(new Error('down'))
    const { result } = renderHook(() => useChat())
    await act(async () => {})

    expect(result.current.conversations).toEqual([])
    expect(result.current.error).toBe('대화 목록을 불러오지 못했습니다')
  })

  /** 불러오기가 실패해도 막음이 풀린다 - 안 풀리면 그 대화에서는 영영 보낼 수 없다(#323) */
  it('불러오기가 실패해도 그 뒤 전송을 받는다', async () => {
    const a = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockReturnValueOnce(a.promise)
    const { result } = renderHook(() => useChat())

    act(() => void result.current.selectConversation('c1'))
    await act(async () => a.reject(new Error('down')))

    let accepted: unknown
    await act(async () => {
      accepted = await result.current.send('q', [])
    })
    expect(accepted).toBe(true)
    expect(streamChat).toHaveBeenCalledTimes(1)
  })
})
