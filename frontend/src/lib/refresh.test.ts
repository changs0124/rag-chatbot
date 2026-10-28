import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { adoptRefreshedToken, api, getToken, setToken } from './api'
import { loadFigure, resetFigureCache } from './docFigures'
import { streamChat } from './endpoints'
import { deferred } from '../test/fixtures'

/**
 * 세션 슬라이딩 재발급 수신 (FEAT-OPS-003 · TC-OPS-025).
 *
 * 교체가 **두 경로 모두**에서 일어나야 한다 — `api.ts` 의 fetch 래퍼와 `endpoints.ts` 의 채팅 스트림.
 * 스트림은 래퍼를 거치지 않으므로 한쪽만 하면 채팅만 쓰는 사용자는 갱신을 못 받고 만료 때 튕긴다.
 */
describe('슬라이딩 재발급 토큰 수신', () => {
  beforeEach(() => setToken('old-token'))
  afterEach(() => {
    setToken(null)
    vi.unstubAllGlobals()
  })

  it('헤더가 있으면 토큰을 교체한다', () => {
    const res = new Response(null, { headers: { 'X-Refresh-Token': 'new-token' } })
    adoptRefreshedToken(res, 'old-token')
    expect(getToken()).toBe('new-token')
  })

  // 서버가 CORS 노출 헤더에 등록하지 않으면 브라우저가 값을 숨겨 null 이 온다.
  // 그 경우 기존 토큰을 지워버리면 멀쩡한 세션이 날아가므로 그대로 두어야 한다
  it('헤더가 없으면 기존 토큰을 건드리지 않는다', () => {
    adoptRefreshedToken(new Response(null), 'old-token')
    expect(getToken()).toBe('old-token')
  })

  // 로그아웃 전에 떠난 요청이 늦게 돌아와 토큰을 되살리면 새로고침에 로그아웃한 세션으로 다시 들어간다(#359)
  it('로그아웃 뒤에 도착한 응답의 헤더는 버린다', () => {
    setToken(null)
    adoptRefreshedToken(new Response(null, { headers: { 'X-Refresh-Token': 'late-token' } }), 'old-token')
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('rag_chatbot_token')).toBeNull()
  })

  it('스트림 경로도 토큰을 교체한다', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('event: done\ndata: {"finishReason":"stop"}\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, { status: 200, headers: { 'X-Refresh-Token': 'stream-token' } }),
      ),
    )

    await streamChat({ conversationId: 'c1', message: '질문', attachmentIds: [] }, {})

    expect(getToken()).toBe('stream-token')
  })

  // 스트림이 오류로 끝나도 갱신은 이미 일어나야 한다 - 헤더는 본문보다 먼저 도착한다
  it('스트림이 오류로 끝나도 교체는 일어난다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ code: 'RATE_LIMIT', message: '너무 잦음' }), {
          status: 429,
          headers: { 'X-Refresh-Token': 'error-path-token', 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(
      streamChat({ conversationId: 'c1', message: '질문', attachmentIds: [] }, {}),
    ).rejects.toThrow()

    expect(getToken()).toBe('error-path-token')
  })
})

/**
 * 다른 세션에서 떠난 요청의 재발급 헤더 (#363).
 *
 * A 로 보낸 요청이 늦게 돌아오는 사이 로그아웃 → B 로그인이 끼면, 헤더의 A 새 토큰이 B 세션을 덮는다.
 * 송신 시점 토큰과 현재 토큰이 같을 때만 받아야 한다 - 세 경로 모두.
 */
describe('다른 세션에서 떠난 요청의 재발급', () => {
  let respond: (res: Response) => void

  beforeEach(() => {
    setToken('a-token')
    resetFigureCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        const res = deferred<Response>()
        respond = res.resolve
        return res.promise
      }),
    )
  })
  afterEach(() => {
    setToken(null)
    vi.unstubAllGlobals()
  })

  function switchAccountThenRespond(status = 200): void {
    setToken(null)
    setToken('b-token')
    respond(new Response(null, { status, headers: { 'X-Refresh-Token': 'a-refreshed' } }))
  }

  it('fetch 래퍼 - B 세션을 A 토큰으로 덮지 않는다', async () => {
    const pending = api.get('/api/conversations')
    switchAccountThenRespond()
    await pending
    expect(getToken()).toBe('b-token')
    expect(localStorage.getItem('rag_chatbot_token')).toBe('b-token')
  })

  it('채팅 스트림 - B 세션을 A 토큰으로 덮지 않는다', async () => {
    const pending = streamChat({ conversationId: 'c1', message: '질문', attachmentIds: [] }, {})
    switchAccountThenRespond(429)
    await expect(pending).rejects.toThrow()
    expect(getToken()).toBe('b-token')
  })

  it('그림 로드 - B 세션을 A 토큰으로 덮지 않는다', async () => {
    const pending = loadFigure('tm-p001-f1')
    switchAccountThenRespond(404)
    await pending
    expect(getToken()).toBe('b-token')
  })
})
