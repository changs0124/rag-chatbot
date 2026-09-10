import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamChat } from './endpoints'

/** SSE 본문을 한 덩어리로 흘려주는 fetch 스텁 */
function stubFetch(sse: string) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(sse))
      controller.close()
    },
  })
  // 실제 Response 를 씀 - `{ ok, body }` 만 담은 리터럴은 headers 가 없어, 응답 헤더를 읽는
  // 코드(슬라이딩 재발급)가 붙는 순간 스텁이 실물과 갈려 터진다
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
}

const REQUEST = { conversationId: 'c1', message: '환불 정책', attachmentIds: [] }

describe('chat SSE 수신 계약', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stage 이벤트를 순서대로 전달하고 token보다 먼저 받음', async () => {
    stubFetch(
      'event:meta\ndata:{"messageId":"m1","conversationId":"c1"}\n\n' +
        'event:stage\ndata:{"stage":"analyzing","label":"질문 분석 중(목업)"}\n\n' +
        'event:stage\ndata:{"stage":"searching","label":"목업 코퍼스 조회 중"}\n\n' +
        'event:token\ndata:{"delta":"안내"}\n\n' +
        'event:done\ndata:{"finishReason":"stop","noSource":false}\n\n',
    )

    const seen: string[] = []
    await streamChat(REQUEST, {
      onStage: ({ stage, label }) => seen.push(`stage:${stage}:${label}`),
      onToken: (d) => seen.push(`token:${d}`),
      onDone: () => seen.push('done'),
    })

    expect(seen).toEqual([
      'stage:analyzing:질문 분석 중(목업)',
      'stage:searching:목업 코퍼스 조회 중',
      'token:안내',
      'done',
    ])
  })

  it('모르는 이벤트는 조용히 무시함(리스크 R-14)', async () => {
    stubFetch(
      'event:future_event\ndata:{"whatever":1}\n\n' +
        'event:token\ndata:{"delta":"본문"}\n\n' +
        'event:done\ndata:{"finishReason":"stop","noSource":true}\n\n',
    )

    const seen: string[] = []
    await expect(
      streamChat(REQUEST, {
        onToken: (d) => seen.push(d),
        onError: () => seen.push('error'),
      }),
    ).resolves.toBeUndefined()
    expect(seen).toEqual(['본문'])
  })

  /**
   * #85 - 종단 이벤트 없이 스트림이 끝나는 경로.
   *
   * 서버 SSE 타임아웃은 emitter 를 닫을 뿐 done 도 error 도 싣지 못한다(닫힌 뒤의 send 는
   * IllegalStateException 이다). 프록시 idle timeout · 모바일 네트워크 전환도 같은 모양으로 온다 -
   * 이 프로젝트는 Cloudflare Tunnel 뒤로 배포되므로 프록시가 한 겹 더 낀다.
   */
  it('done 없이 끊기면 오류로 귀결됨 - 영구 streaming 을 막음', async () => {
    stubFetch(
      'event:meta\ndata:{"messageId":"m1","conversationId":"c1"}\n\n' +
        'event:token\ndata:{"delta":"중간까지"}\n\n',
    )

    const seen: string[] = []
    await expect(
      streamChat(REQUEST, {
        onToken: (d) => seen.push(`token:${d}`),
        onDone: () => seen.push('done'),
        onError: (m) => seen.push(`error:${m}`),
      }),
    ).rejects.toThrow()

    // 받은 토큰은 그대로 두고 마지막에 오류가 붙어야 한다. 이것이 없으면 호출부의 catch 가
    // 돌지 않아 말풍선이 streaming 인 채 영원히 남는다(오류 배너도 정지 버튼도 없이)
    expect(seen[0]).toBe('token:중간까지')
    expect(seen[1]).toMatch(/^error:/)
    expect(seen).toHaveLength(2)
  })

  /** 토큰 하나 없이 끊긴 경우도 같다 - 화면에 「…」만 남아 있던 자리다 */
  it('토큰 하나 없이 끊겨도 오류로 귀결됨', async () => {
    stubFetch('event:meta\ndata:{"messageId":"m1","conversationId":"c1"}\n\n')

    const seen: string[] = []
    await expect(streamChat(REQUEST, { onError: (m) => seen.push(m) })).rejects.toThrow()
    expect(seen).toHaveLength(1)
  })

  /** 반대편 - error 이벤트로 끝난 것은 계약대로의 종단이므로 두 번 알리지 않는다 */
  it('error 이벤트로 끝나면 그것만 전달함', async () => {
    stubFetch(
      'event:meta\ndata:{"messageId":"m1","conversationId":"c1"}\n\n' +
        'event:error\ndata:{"code":"STREAM_ERROR","message":"응답 생성 중 오류"}\n\n',
    )

    const seen: string[] = []
    await expect(
      streamChat(REQUEST, { onError: (m) => seen.push(m) }),
    ).resolves.toBeUndefined()
    expect(seen).toEqual(['응답 생성 중 오류'])
  })
})
