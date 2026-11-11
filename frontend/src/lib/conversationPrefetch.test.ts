import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./endpoints', () => ({ listConversations: vi.fn() }))

const { listConversations } = await import('./endpoints')
const { setToken } = await import('./api')
const { prefetchConversations, takePrefetchedConversations, PREFETCH_MAX_AGE_MS } = await import('./conversationPrefetch')

const jwtOf = (sub: string) => `h.${btoa(JSON.stringify({ sub }))}.s`
const conv = { id: 'c1', title: '점검', updatedAt: '' }

describe('대화 목록 미리 받기(#694)', () => {
  beforeEach(() => {
    vi.mocked(listConversations).mockReset().mockResolvedValue([conv])
    takePrefetchedConversations() // 앞 케이스가 남긴 것을 비움
  })
  afterEach(() => {
    setToken(null)
    vi.useRealTimers()
  })

  it('토큰이 없으면 요청하지 않는다', () => {
    prefetchConversations()
    expect(listConversations).not.toHaveBeenCalled()
    expect(takePrefetchedConversations()).toBeNull()
  })

  it('토큰이 있으면 바로 요청하고, 받은 것은 한 번만 쓴다', async () => {
    setToken(jwtOf('user-a'))
    prefetchConversations()
    expect(listConversations).toHaveBeenCalledTimes(1)
    await expect(takePrefetchedConversations()).resolves.toEqual([conv])
    expect(takePrefetchedConversations()).toBeNull()
  })

  it('그 사이 계정이 바뀌면 쓰지 않는다 (#617)', () => {
    setToken(jwtOf('user-a'))
    prefetchConversations()
    setToken(jwtOf('user-b'))
    expect(takePrefetchedConversations()).toBeNull()
  })

  it('같은 계정의 토큰 재발급은 그대로 쓴다', async () => {
    setToken(jwtOf('user-a'))
    prefetchConversations()
    setToken(`${jwtOf('user-a')}2`)
    await expect(takePrefetchedConversations()).resolves.toEqual([conv])
  })

  it('오래된 것(설정 화면에 머물다 온 경우)은 쓰지 않는다', () => {
    vi.useFakeTimers()
    setToken(jwtOf('user-a'))
    prefetchConversations()
    vi.advanceTimersByTime(PREFETCH_MAX_AGE_MS + 1)
    expect(takePrefetchedConversations()).toBeNull()
  })

  it('쓰이지 않은 채 실패해도 처리되지 않은 rejection 을 남기지 않는다', async () => {
    vi.mocked(listConversations).mockRejectedValue(new Error('network'))
    setToken(jwtOf('user-a'))
    prefetchConversations()
    await new Promise((r) => setTimeout(r, 0))
    // 이 케이스가 끝나도 vitest 가 unhandled rejection 으로 실패하지 않으면 통과
    expect(listConversations).toHaveBeenCalledTimes(1)
  })
})
