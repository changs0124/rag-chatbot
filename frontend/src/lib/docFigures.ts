import { API_BASE, adoptRefreshedToken, getToken, toApiError } from './api'

/**
 * 답변 본문의 문서 그림 표식 `[[그림:<key>]]`(FEAT-CHAT-004).
 *
 * 본문은 평문으로 그린다 - 마크다운 렌더러를 들이지 않고 표식만 잘라 그 자리에 그림을 끼운다.
 * 키 형식은 서버(`DocFigureService`)와 같다. 형식이 아니면 표식으로 보지 않고 글자 그대로 둔다.
 */
const MARKER = /\[\[그림:([a-z0-9-]{1,64})\]\]/g
const OPEN = '[[그림:'

export type Segment = { type: 'text'; text: string } | { type: 'figure'; key: string }

/**
 * 스트리밍 중 본문 끝에 덜 도착한 표식(`[[그림:tm-p0`)이 있으면 그 조각을 잘라 낸다.
 * 그리면 한 글자씩 자라는 표식이 보이다가 닫히는 순간 그림으로 바뀐다
 */
function dropPartialMarker(text: string): string {
  const at = text.lastIndexOf('[')
  if (at < 0) return text
  // 닫힌 `]]` 직전의 `[` 를 볼 수 있으므로, 표식이 시작될 수 있는 첫 `[` 까지 거슬러 본다
  const start = text[at - 1] === '[' ? at - 1 : at
  const tail = text.slice(start)
  const partial = OPEN.startsWith(tail) || (tail.startsWith(OPEN) && /^[a-z0-9-]{0,64}\]?$/.test(tail.slice(OPEN.length)))
  return partial ? text.slice(0, start) : text
}

export function splitFigures(content: string, streaming = false): Segment[] {
  const text = streaming ? dropPartialMarker(content) : content
  const segments: Segment[] = []
  let last = 0
  for (const m of text.matchAll(MARKER)) {
    // 표식은 한 줄을 통째로 차지하므로 양옆 줄바꿈 하나씩은 그림 블록이 대신한다 - 남기면 빈 줄이 두 겹 생긴다
    const before = text.slice(last, m.index).replace(/\n$/, '')
    if (before) segments.push({ type: 'text', text: before })
    segments.push({ type: 'figure', key: m[1] })
    last = m.index + m[0].length
    if (text[last] === '\n') last += 1
  }
  const rest = text.slice(last)
  if (rest) segments.push({ type: 'text', text: rest })
  return segments
}

/**
 * 키 → objectURL. 없는 그림(404)은 `null` 로 기억해 다시 묻지 않는다.
 * 네트워크 실패는 기억하지 않는다 - 일시적 실패가 그 세션 내내 그림을 지우면 안 된다.
 *
 * 회수하지 않는다. 같은 그림이 대화 여러 곳·재조회에서 다시 쓰이고, 수는 원본 그림 수로 유계다
 */
const cache = new Map<string, Promise<string | null>>()

export function loadFigure(key: string): Promise<string | null> {
  const hit = cache.get(key)
  if (hit) return hit
  const path = `/api/doc-figures/${key}`
  const token = getToken()
  const pending = fetch(API_BASE + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (res) => {
      adoptRefreshedToken(res)
      if (res.status === 404) return null
      if (!res.ok) throw await toApiError(res, path)
      return URL.createObjectURL(await res.blob())
    })
    .catch((e: unknown) => {
      cache.delete(key)
      throw e
    })
  cache.set(key, pending)
  return pending
}

/** 테스트 전용 - 케이스마다 캐시를 비운다 */
export function resetFigureCache(): void {
  cache.clear()
}

/**
 * 출처 스니펫용. 스니펫은 색인 본문 조각이라 표식이 글자 그대로 섞여 온다 - 거기서는 그림을 그리지 않고
 * 짧은 자리표시로 바꾼다. 출처 목록은 근거 문장을 읽는 자리라 그림까지 끼우면 목록이 길어진다
 */
export function stripFigureMarkers(text: string): string {
  return text.replace(MARKER, '[그림]')
}
