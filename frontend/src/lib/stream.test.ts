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

/** 바이트 덩어리를 주어진 경계에서 잘라 따로 흘려주는 fetch 스텁 - 네트워크가 SSE 프레임 경계를 지켜 주지 않는 경우 */
function stubFetchChunks(chunks: Uint8Array[]) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })))
}

/** bytes 를 cuts(바이트 오프셋) 에서 자른 조각들 */
function splitAt(bytes: Uint8Array, cuts: number[]): Uint8Array[] {
  const edges = [0, ...cuts, bytes.length]
  return edges.slice(0, -1).map((from, i) => bytes.slice(from, edges[i + 1]))
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

  it('200 이면 이벤트보다 먼저 onOpen, 거절이면 부르지 않음 (#435)', async () => {
    // 서버는 질문을 저장한 뒤에 200 을 돌려준다 - useChat 이 이것으로 중단 때 질문 말풍선을 남길지 정한다
    stubFetch('event:token\ndata:{"delta":"본문"}\n\n' + 'event:done\ndata:{"finishReason":"stop","noSource":true}\n\n')
    const seen: string[] = []
    await streamChat(REQUEST, { onOpen: () => seen.push('open'), onToken: (d) => seen.push(d) })
    expect(seen).toEqual(['open', '본문'])

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"code":"RATE_LIMIT","message":"x"}', { status: 429 })))
    const opened = vi.fn()
    await expect(streamChat(REQUEST, { onOpen: opened })).rejects.toBeTruthy()
    expect(opened).not.toHaveBeenCalled()
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
   * 서버 SSE 타임아웃 · 프록시 idle timeout 은 done 도 error 도 없이 끝난다 - 이유는 endpoints.ts
   * streamChat 의 `terminated` 주석. 이 프로젝트는 Cloudflare Tunnel 뒤라 프록시가 한 겹 더 낀다.
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

  /**
   * #482 - 네트워크는 SSE 프레임 경계를 지켜 주지 않는다(endpoints.ts streamChat 의 buffer · TextDecoder stream:true).
   * 같은 본문을 어디서 자르든 한 덩어리로 받은 것과 같은 이벤트가 같은 순서로 나와야 한다.
   */
  describe('청크 경계', () => {
    const SSE =
      'event:token\ndata:{"delta":"안내"}\n\n' +
      'event:token\ndata:{"delta":"입니다 🙂"}\n\n' +
      'event:done\ndata:{"finishReason":"stop","noSource":false}\n\n'
    const BYTES = new TextEncoder().encode(SSE)
    const EXPECTED = ['token:안내', 'token:입니다 🙂', 'done']

    async function receive(chunks: Uint8Array[]) {
      stubFetchChunks(chunks)
      const seen: string[] = []
      await streamChat(REQUEST, {
        onToken: (d) => seen.push(`token:${d}`),
        onDone: () => seen.push('done'),
        onError: (m) => seen.push(`error:${m}`),
      })
      return seen
    }

    it('프레임 중간에서 잘려도 이어 붙여 한 이벤트로 전달함', async () => {
      const cut = SSE.indexOf('"delta"') + 3 // data 의 JSON 한가운데(앞이 ASCII 뿐이라 문자 위치 = 바이트 위치)
      expect(await receive(splitAt(BYTES, [cut]))).toEqual(EXPECTED)
    })

    it('프레임을 가르는 빈 줄 사이에서 잘려도 한 번만 전달함', async () => {
      const cut = SSE.indexOf('\n\n') + 1 // 첫 프레임의 두 줄바꿈 사이
      expect(await receive(splitAt(BYTES, [cut]))).toEqual(EXPECTED)
    })

    it('한글 UTF-8 바이트 중간에서 잘려도 글자가 깨지지 않음', async () => {
      // 「안」 은 3바이트, 이모지는 4바이트 - 글자 안쪽 경계마다 자른다
      const ahn = BYTES.indexOf(0xec) // 「안」 의 첫 바이트
      const emoji = BYTES.indexOf(0xf0)
      for (const cuts of [[ahn + 1], [ahn + 2], [emoji + 1], [emoji + 2], [emoji + 3], [ahn + 1, ahn + 2, emoji + 2]]) {
        expect(await receive(splitAt(BYTES, cuts))).toEqual(EXPECTED)
      }
    })

    it('한 바이트씩 흘려도 같은 결과', async () => {
      const every = Array.from({ length: BYTES.length - 1 }, (_, i) => i + 1)
      expect(await receive(splitAt(BYTES, every))).toEqual(EXPECTED)
    })
  })
})
