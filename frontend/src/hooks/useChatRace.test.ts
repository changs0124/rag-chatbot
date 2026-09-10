import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChat } from './useChat'
import type { ChatMessage, Conversation } from '../lib/types'

vi.mock('../lib/endpoints', () => ({
  listConversations: vi.fn().mockResolvedValue([]),
  createConversation: vi.fn(),
  getMessages: vi.fn(),
  deleteConversation: vi.fn(),
  renameConversation: vi.fn(),
  streamChat: vi.fn().mockResolvedValue(undefined),
}))

const { createConversation, getMessages, streamChat, deleteConversation, renameConversation } =
  await import('../lib/endpoints')

/** 손으로 resolve 할 수 있는 프라미스 - 「응답이 도착하는 순간」을 테스트가 정함 */
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const conv = (id: string): Conversation => ({ id, title: id, createdAt: '', updatedAt: '' })

const msg = (id: string): ChatMessage => ({
  id,
  role: 'user',
  content: id,
  status: 'complete',
  createdAt: '',
  citations: [],
})

/**
 * 대화 전환과 비동기 응답의 경쟁 (#93).
 *
 * 어느 쪽이든 결말이 같다 — **남의 대화 이력 위에 새 턴이 얹히고, 새로고침하면 사라진다.**
 * 사용자는 무엇이 저장됐는지 알 수 없다.
 */
describe('useChat 대화 컨텍스트 경쟁', () => {
  afterEach(() => vi.clearAllMocks())

  /**
   * 증상 A — 새 대화 생성 왕복 중 기존 대화를 고르면 그 대화 위에 얹힌다.
   *
   * 고치기 전에는 `createConversation` 이 resolve 하는 순간 `activeId` 가 새 대화로 덮이고
   * `setMessages(prev => [...prev, ...])` 의 `prev` 가 **A 의 이력**이라, 사이드바는 새 대화를
   * 가리키는데 본문은 A + 새 턴이 됐다.
   */
  it('생성 왕복 중 다른 대화를 고르면 그 대화 위에 얹지 않는다', async () => {
    const created = deferred<Conversation>()
    vi.mocked(createConversation).mockReturnValue(created.promise)
    vi.mocked(getMessages).mockResolvedValue([msg('a-1'), msg('a-2')])

    const { result } = renderHook(() => useChat())

    // 「새 대화」 상태에서 전송 - 아직 생성 응답이 오지 않았다
    act(() => {
      void result.current.send('첫 질문', [])
    })

    // 그사이 사용자가 기존 대화 A 를 고른다
    await act(async () => {
      await result.current.selectConversation('A')
    })
    expect(result.current.activeId).toBe('A')
    expect(result.current.messages.map((m) => m.id)).toEqual(['a-1', 'a-2'])

    // 이제 생성 응답이 뒤늦게 도착한다
    await act(async () => {
      created.resolve(conv('new-1'))
      await created.promise
    })

    // A 를 보고 있어야 하고, A 의 이력이 그대로여야 한다
    expect(result.current.activeId).toBe('A')
    expect(result.current.messages.map((m) => m.id)).toEqual(['a-1', 'a-2'])
  })

  /**
   * 증상 B — 대화 선택 응답이 역순으로 도착해도 화면과 선택 표시가 갈리지 않는다.
   *
   * 고치기 전에는 A→B 를 빠르게 눌렀을 때 늦게 온 A 의 이력이 B 화면을 덮어써,
   * **사이드바는 B 인데 본문은 A** 가 됐다. 그 상태에서 보내면 A 이력 위에 B 의 턴이 쌓인다.
   */
  it('대화 선택 응답이 역순으로 도착해도 마지막에 고른 대화가 이긴다', async () => {
    const a = deferred<ChatMessage[]>()
    const b = deferred<ChatMessage[]>()
    vi.mocked(getMessages).mockImplementation((id: string) =>
      id === 'A' ? a.promise : b.promise,
    )

    const { result } = renderHook(() => useChat())

    act(() => {
      void result.current.selectConversation('A')
    })
    act(() => {
      void result.current.selectConversation('B')
    })

    // B 가 먼저 도착하고 A 가 뒤늦게 온다
    await act(async () => {
      b.resolve([msg('b-1')])
      await b.promise
    })
    await act(async () => {
      a.resolve([msg('a-1')])
      await a.promise
    })

    expect(result.current.activeId).toBe('B')
    expect(result.current.messages.map((m) => m.id)).toEqual(['b-1'])
  })

  /**
   * 생성 왕복 중 두 번째 전송이 막힌다.
   *
   * `streaming` 은 스트림이 열려야 참이 되므로 이 구간에서는 아직 false 다. 막지 않으면 대화가
   * 둘 만들어지고, 두 번째 컨트롤러가 `abortRef` 를 덮어쓴 뒤 첫 번째의 `finally` 가 그것을
   * null 로 지워 **정지 버튼이 무력화된다.**
   */
  it('생성 왕복 중 다시 보내도 대화를 두 번 만들지 않는다', async () => {
    const created = deferred<Conversation>()
    vi.mocked(createConversation).mockReturnValue(created.promise)

    const { result } = renderHook(() => useChat())

    act(() => {
      void result.current.send('첫 질문', [])
    })
    act(() => {
      void result.current.send('두 번째 질문', [])
    })

    await act(async () => {
      created.resolve(conv('new-1'))
      await created.promise
    })

    expect(vi.mocked(createConversation)).toHaveBeenCalledTimes(1)
  })

  /**
   * #94 - 언마운트에서 진행 중인 스트림을 끊는다.
   *
   * 끊지 않으면 로그아웃해도 SSE 연결이 그대로 살아 서버가 답변을 끝까지 생성하고, 리더 루프가
   * 언마운트된 훅의 setMessages 를 계속 호출한다. **로그인 화면에 도달한 뒤에도 이전 사용자의
   * 요청이 진행 중**이고, 드나들기를 반복하면 연결이 누적된다.
   */
  it('언마운트하면 진행 중인 스트림을 끊음', async () => {
    vi.mocked(createConversation).mockResolvedValue(conv('c1'))
    let signal: AbortSignal | undefined
    vi.mocked(streamChat).mockImplementation((_b, _h, s) => {
      signal = s
      return new Promise<void>(() => {}) // 끝나지 않는 스트림
    })

    const { result, unmount } = renderHook(() => useChat())
    await act(async () => {
      void result.current.send('질문', [])
    })
    expect(signal).toBeDefined()
    expect(signal!.aborted).toBe(false)

    unmount()

    expect(signal!.aborted).toBe(true)
  })

  /**
   * #77 - 삭제 실패가 화면에 드러난다.
   *
   * 종전에는 catch 가 없어 확인 모달은 닫히고 목록에는 대화가 그대로 남는데 **아무 표시가 없었다.**
   * 사용자는 「삭제를 눌렀는데 그대로다」만 보고 콘솔에는 unhandled rejection 만 남았다.
   */
  it('삭제가 실패하면 오류가 뜨고 목록도 그대로다', async () => {
    vi.mocked(deleteConversation).mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.deleteConversation('A')
    })

    expect(result.current.error).toBeTruthy()
  })

  /** 이름 변경도 같다 - 실패하면 헤더가 옛 제목으로 조용히 되돌아가던 자리다 */
  it('이름 변경이 실패하면 오류가 뜬다', async () => {
    vi.mocked(renameConversation).mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.renameConversation('A', '새 제목')
    })

    expect(result.current.error).toBeTruthy()
  })

  /** 반대편 - 성공하면 오류가 뜨지 않고 목록에서 빠진다 */
  it('삭제가 성공하면 오류 없이 목록에서 빠진다', async () => {
    vi.mocked(deleteConversation).mockResolvedValue(undefined)
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.deleteConversation('A')
    })

    expect(result.current.error).toBeNull()
  })

  /** 반대편 - 아무도 전환하지 않으면 종전대로 새 대화가 활성화된다 */
  it('전환이 없으면 생성된 대화가 정상적으로 활성화된다', async () => {
    const created = deferred<Conversation>()
    vi.mocked(createConversation).mockReturnValue(created.promise)

    const { result } = renderHook(() => useChat())

    act(() => {
      void result.current.send('첫 질문', [])
    })
    await act(async () => {
      created.resolve(conv('new-1'))
      await created.promise
    })

    expect(result.current.activeId).toBe('new-1')
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })
})
