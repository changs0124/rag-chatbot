import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { adoptRefreshedToken, getToken, setToken } from './api'
import { streamChat } from './endpoints'

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
    adoptRefreshedToken(res)
    expect(getToken()).toBe('new-token')
  })

  // 서버가 CORS 노출 헤더에 등록하지 않으면 브라우저가 값을 숨겨 null 이 온다.
  // 그 경우 기존 토큰을 지워버리면 멀쩡한 세션이 날아가므로 그대로 두어야 한다
  it('헤더가 없으면 기존 토큰을 건드리지 않는다', () => {
    adoptRefreshedToken(new Response(null))
    expect(getToken()).toBe('old-token')
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
