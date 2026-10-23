import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChat } from './useChat'
import type { ChatMessage } from '../lib/types'
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
