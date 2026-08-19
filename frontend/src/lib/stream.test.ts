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
})
