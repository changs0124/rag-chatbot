import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createConversation,
  deleteConversation as apiDelete,
  deleteConversationIfEmpty as apiDeleteIfEmpty,
  getMessages,
  listConversations,
  renameConversation as apiRename,
  streamChat,
} from '../lib/endpoints'
import { ApiError, errorMessage, tokenSubject } from '../lib/api'
import { takePrefetchedConversations } from '../lib/conversationPrefetch'
import type { Attachment, ChatMessage, Conversation } from '../lib/types'
import { useStageQueue } from './useStageQueue'

/**
 * 서버에 질문이 남았는지 모르는 턴(200 전, 또는 200 뒤 토큰 0개에서 중단 · 실패, #489)의 판정 결과(#440 · #447 · #480). 훅은 이것을 화면에 적용만 한다.
 * - `stored` : 질문이 저장된 것이 확실하다 - 이력(`saved`)을 못 받았어도 되돌리지 않는다
 * - `deleted` : 새 대화가 비어 있어 지웠다(또는 이미 없다) - 저장된 것이 없다
 * - `unknown` : 저장을 확인하지 못했다 - 글만 되돌리고 대화는 둔다
 */
type EarlyAbortOutcome =
  | { kind: 'stored'; saved: ChatMessage[] | null }
  | { kind: 'deleted' }
  | { kind: 'unknown' }

/**
 * 「저장됨」인데 답이 없는 질문을 다시 확인하는 간격과 최대 구간(#489). 서버는 토큰을 하나도 못 보낸 턴의 질문을 걷지만,
 * 끊김을 **다음 이벤트(단계 · 토큰)를 쓸 때** 알아채므로(#487) 첫 확인이 철회보다 먼저 처리될 수 있다.
 * 창은 8초다(#501) - 운영 실측에서 철회까지 3.2~5.9초가 걸려 5초 창은 10회 중 2회를 놓쳤다
 */
export const RECHECK_INTERVAL_MS = 400
export const RECHECK_WINDOW_MS = 8000
/**
 * 재서명한 첨부를 다시 받지 않는 시간(#600) - 서버 서명 URL 의 TTL(`FILE_ACCESS_TOKEN_TTL_MINUTES`, 기본 15분)과 같다. 그 안에 다시 깨지면
 * 새 URL 마저 깨진 것이라 막고(무한 요청 방지, #558), 지나서 깨지면 받은 URL 이 만료된 것이라 한 번 더 받는다
 */
export const RESIGN_RETRY_MS = 15 * 60_000
/** 재확인 요청 하나의 시간 제한 - 매달린 요청이 판정을 붙들지 않게 한다 */
const RECHECK_REQUEST_TIMEOUT_MS = 3000
/** 목록을 못 불러온 오류 줄 - 「다시 시도」가 성공하면 이것만 걷는다(#684) */
const LIST_LOAD_ERROR = '대화 목록을 불러오지 못했습니다'

/** 이력의 마지막이 보낸 질문인지 - 답 행이 아직 없다 */
function endsWithQuestion(server: ChatMessage[], text: string) {
  const last = server.at(-1)
  return last?.role === 'user' && last.content === text.trim()
}

/** 보낸 질문 바로 뒤에 답 행(부분 답 · 서버 타임아웃의 error 행)이 붙어 끝나는지 */
function endsWithAnswer(server: ChatMessage[], text: string) {
  return server.at(-1)?.role === 'assistant' && endsWithQuestion(server.slice(0, -1), text)
}

/**
 * 답 없는 질문이 걷히는지(#489) 간격마다 이력을 다시 본다. 질문 뒤에 답 행이 붙으면 저장됨(끊기기 전에 보낸 토큰이 있었다),
 * 질문이 사라지면 서버가 걷은 것이다 - 새 대화는 조건부 삭제를 다시 한다. 구간이 끝나도 그대로면 저장됨으로 둔다.
 *
 * 구간은 시각 마감으로 끊는다 - 요청이 느려도 늘어나지 않는다(요청 하나는 `RECHECK_REQUEST_TIMEOUT_MS` 로 끊긴다).
 * 그사이 대화를 옮겼으면(`stillHere`) 기존 대화는 곧바로 「모름」으로 끝낸다 - 결과를 화면에 쓰지 않는다(#440).
 * 새 대화는 빈 대화를 치워야 하므로 이어 간다. 401 은 곧바로 끝낸다 - 같은 토큰으로 더 물어도 401 이다
 */
async function recheckUnanswered(
  id: string,
  isNew: boolean,
  text: string,
  saved: ChatMessage[],
  stillHere: () => boolean,
  alive: () => boolean,
): Promise<EarlyAbortOutcome> {
  const deadline = Date.now() + RECHECK_WINDOW_MS
  while (Date.now() + RECHECK_INTERVAL_MS <= deadline) {
    if (!alive() || (!isNew && !stillHere())) return { kind: 'unknown' }
    await new Promise((resolve) => setTimeout(resolve, RECHECK_INTERVAL_MS))
    if (!alive() || (!isNew && !stillHere())) return { kind: 'unknown' }
    let server: ChatMessage[]
    try {
      server = await getMessages(id, AbortSignal.timeout(RECHECK_REQUEST_TIMEOUT_MS))
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return { kind: 'unknown' }
      // 한 번 못 받은 것은 모르는 것이다 - 다음 간격에 다시 본다
      continue
    }
    if (endsWithQuestion(server, text)) {
      saved = server
      continue
    }
    if (endsWithAnswer(server, text)) return { kind: 'stored', saved: server }
    if (!isNew) return { kind: 'unknown' }
    try {
      await apiDeleteIfEmpty(id)
      return { kind: 'deleted' }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { kind: 'deleted' }
      return { kind: 'unknown' }
    }
  }
  return { kind: 'stored', saved }
}

/**
 * 200 을 받기 전에, 또는 200 뒤 토큰 0개에서(#489) 끊긴 턴의 질문이 서버에 있는지 서버에 물어 가른다(#440). 화면 상태는 건드리지 않는다.
 *
 * **200 이 없었다고 서버에 없는 것은 아니다**(#440 리뷰) - 서버는 질문 저장 · 첨부 연결을 커밋한 뒤에
 * 200 을 돌려주므로, 그 사이에 끊으면 질문은 저장돼 있고 첨부는 이미 쓰였다.
 * 계약 : 409 = 저장됨, 404 = 이미 지움, 그 밖 = 모름. 저장됨인데 답이 없으면 걷히는지 다시 본다(#489, `recheckUnanswered`).
 * `opened` 면 질문은 저장됐던 것이 확실하다 - 기존 대화에서 질문 뒤에 답 행(서버 타임아웃의 error 행 등)이 붙어 있으면 저장됨이다.
 *
 * `alive` 가 거짓이면(계정이 바뀜 = 로그아웃 · 다른 계정) 다음 요청을 보내지 않고 모름으로 끝낸다(#617) - 대화 · 화면을 옮긴 것과 달리
 * 곧바로 다른 계정으로 들어오면 남은 요청이 새 계정 토큰으로 나가, 남의 대화에 404 를 받고 「지워짐」으로 읽는다
 */
async function judgeEarlyAbort(
  id: string,
  isNew: boolean,
  text: string,
  opened: boolean,
  stillHere: () => boolean,
  alive: () => boolean,
): Promise<EarlyAbortOutcome> {
  // 첫 요청 전에도 본다(#626) - 로그아웃 버튼은 토큰을 먼저 지우고 그 뒤 끊으므로, 안 보면 첫 요청이 토큰 없이 나가 401 을 받는다
  if (!alive()) return { kind: 'unknown' }
  if (isNew) {
    // 새 대화는 「비었을 때만 지우기」로 묻는다(#447) - 확인과 삭제를 따로 하면 그 사이에 커밋된 질문 · 첨부까지
    // 지웠다. 서버가 한 잠금 안에서 가른다 : 지워졌으면 저장 전이었고(뒤늦은 채팅은 404), 409 면 저장된 것이다
    try {
      await apiDeleteIfEmpty(id)
      return { kind: 'deleted' }
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        if (!alive()) return { kind: 'unknown' }
        const saved = await getMessages(id).catch(() => null)
        if (saved && endsWithQuestion(saved, text)) return recheckUnanswered(id, isNew, text, saved, stillHere, alive)
        return { kind: 'stored', saved }
      }
      if (e instanceof ApiError && e.status === 404) {
        // 이미 지워졌다(다른 탭 · 앞선 삭제) - 저장된 것이 없으니 지운 것과 같게 처리한다
        return { kind: 'deleted' }
      }
      // 그 밖의 실패는 모른다 - 지우지 못했으니 글만 되돌린다
      return { kind: 'unknown' }
    }
  }
  try {
    const server = await getMessages(id)
    if (endsWithQuestion(server, text)) return recheckUnanswered(id, isNew, text, server, stillHere, alive)
    if (opened && endsWithAnswer(server, text)) return { kind: 'stored', saved: server }
  } catch {
    // 모르면 되돌린다 - 기존 대화는 지우지 않으므로 잃는 것은 없다
  }
  return { kind: 'unknown' }
}

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  // 첫 목록이 아직 안 왔다(#663) - 빈 배열과 「아직 모름」을 가른다. 실패는 error 가 따로 알린다(#385) - 실패해도 내려서
  // 스켈레톤이 오류 배너와 함께 남지 않게 한다
  const [conversationsLoading, setConversationsLoading] = useState(true)
  // 목록을 한 번도 받지 못했다(#675) - error 배너는 대화 선택 · 새 대화 · 전송이 걷어 가므로, 그 뒤에도 사이드바가
  // 「대화가 없습니다」로 거짓말하지 않게 따로 든다. 목록을 한 번이라도 받으면 내린다
  const [conversationsFailed, setConversationsFailed] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // 고른 대화의 이력이 오는 중 - 그동안 본문은 직전 대화 대신 로딩 표시를 보인다(#291)
  const [loadingMessages, setLoadingMessages] = useState(false)
  // send 의 거절 판정용 사본(#323) - 고른 직후 같은 틱의 전송도 막으려고 상태와 함께 바로 쓴다
  const loadingRef = useRef(false)
  const [streaming, setStreaming] = useState(false)
  // 200 전(또는 200 뒤 토큰 0개, #489)에 끊긴 턴을 서버에 물어 가르는 중(#483 F17). streaming 도 참인 구간이다 - 입력창이 정지 버튼 대신 비활성 보내기를 보이게 한다
  const [settling, setSettling] = useState(false)
  // 진행 단계(REQ-CHAT-005) - 휘발성 표시라 저장하지 않음. 중단·오류에서는 즉시 비움
  const { stage, pushStage, clearStages } = useStageQueue()
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  /** 판정 중인 턴의 컨트롤러(#489 리뷰) - 대화를 옮기면 abortActiveStream 이 이 턴의 보내기 잠금을 푼다 */
  const judgingRef = useRef<AbortController | null>(null)
  /**
   * 대화 컨텍스트 세대. **대화를 바꾸는 모든 진입점에서 올린다.**
   *
   * `await` 뒤에 상태를 반영할 때 세대가 그대로인지 확인하지 않으면, 느린 응답이 그사이 바뀐
   * 대화 위에 얹힌다 - 새 대화 생성 왕복 중 기존 대화를 고르면 그 대화의 이력 위에 새 턴이
   * 쌓이고, 대화를 빠르게 두 번 고르면 응답이 역순으로 도착해 사이드바와 본문이 갈린다.
   * 어느 쪽이든 새로고침하면 화면이 사라지므로 사용자는 무엇이 저장됐는지 알 수 없다.
   */
  const generation = useRef(0)
  /** 새 대화 생성 왕복 중인지. streaming 이 아직 false 인 구간을 메운다 */
  const creatingRef = useRef(false)
  // 입력창이 전송 버튼을 막을 수 있게 같은 사실을 상태로도 드러낸다(#323)
  const [creating, setCreating] = useState(false)

  /**
   * 목록 응답의 세대(#557, 관리 화면 listGen 과 같은 방식 - #483 F13). 요청을 낼 때와 목록을 직접 고칠 때
   * (삭제 · 이름 변경 · 새 대화 추가) 올리고, 응답은 낼 때 잡은 세대가 그대로일 때만 반영한다.
   * 늦게 온 응답은 그 사이의 고침을 모르는 옛 목록이라, 반영하면 지운 대화가 되살아난다.
   * 고침도 올리는 이유: 고침 앞에 나간 요청이 고침 뒤에 돌아와도 막아야 하기 때문이다.
   * 막힌 응답이 담았을 다른 변화는 다음 갱신이 받는다.
   */
  const listGen = useRef(0)

  // 답변 뒤 갱신 실패는 목록이 그대로 남으니 조용히 넘긴다
  const refreshConversations = useCallback(() => {
    const mine = ++listGen.current
    listConversations()
      .then((list) => {
        if (listGen.current !== mine) return
        setConversations(list)
        setConversationsFailed(false)
      })
      .catch(() => {})
  }, [])

  // 첫 로드 실패를 삼키면 「대화가 없습니다」로 보인다 - 없는 것과 못 불러온 것을 가른다(#385, #77 · #359 와 같은 이유)
  // 첫 로드도 세대를 잡는다(#588) - 아주 느린 첫 응답이 그 사이 만든 새 대화를 옛 목록으로 덮지 않게
  // 로딩 표시는 마지막 첫 로드 요청이 끝날 때 내린다 - StrictMode(개발)는 효과를 두 번 돌려, 세대에 막힌 앞 요청이 먼저 끝나면
  // 목록이 오기 전에 「대화가 없습니다」가 잠깐 보인다. 목록 세대(listGen)와 따로 두는 건 새 대화 추가 같은 고침이 올린 세대에
  // 막혀도 로딩은 내려야 해서다
  const firstLoadGen = useRef(0)
  useEffect(() => {
    const mine = ++listGen.current
    const first = ++firstLoadGen.current
    // 새로고침 때 me 와 함께 시작해 둔 요청이 있으면 그것을 쓴다(#694) - 같은 계정 · 한 번만
    const firstList = takePrefetchedConversations() ?? listConversations()
    firstList
      .then((list) => {
        if (listGen.current === mine) setConversations(list)
      })
      .catch(() => {
        setError(LIST_LOAD_ERROR)
        if (firstLoadGen.current === first) setConversationsFailed(true)
      })
      .finally(() => {
        if (firstLoadGen.current === first) setConversationsLoading(false)
      })
  }, [])

  // 사이드바의 「다시 시도」(#675) - 다시 읽는 동안 사이드바는 버튼을 막아 두고(#684), 또 실패하면 그 자리에 남는다.
  // 성공하면 첫 로드 실패가 남긴 오류 줄도 걷는다 - 안 걷으면 목록이 왔는데 입력창 위에 「불러오지 못했습니다」가 남았다(#684).
  // 다른 오류는 덮지 않는다. 또 실패하면 오류 줄을 다시 건다 - 그새 걷혔으면 낭독기 사용자는 실패를 모른다.
  // 세대가 밀린 응답(그 사이 다른 목록 요청)은 실패 표시를 건드리지 않는다 - 뒤 요청이 정한다
  const retryConversations = useCallback(() => {
    const mine = ++listGen.current
    setConversationsLoading(true)
    listConversations()
      .then((list) => {
        if (listGen.current !== mine) return
        setConversations(list)
        setConversationsFailed(false)
        setError((e) => (e === LIST_LOAD_ERROR ? null : e))
      })
      .catch(() => {
        if (listGen.current === mine) setError(LIST_LOAD_ERROR)
      })
      .finally(() => setConversationsLoading(false))
  }, [])

  /**
   * 대화를 떠날 때 돌고 있던 스트림을 끊음.
   *
   * 안 끊으면 이전 대화의 스트림이 계속 돌면서 단계 줄이 새 화면에 잔류함. 중단 후 처리는
   * 정해진 정책을 그대로 탐(부분 저장 + `complete`) - `run` 의 catch 가 수행한다. 이전 턴의 patch 는 자기
   * assistantId 로만 메시지를 찾으므로 새 대화의 메시지를 건드리지 않고, 새 대화의 이력이 도착하면 목록째 교체된다.
   */
  const abortActiveStream = useCallback(() => {
    abortRef.current?.abort()
    clearStages()
    // 판정(재확인) 중에 떠나면 옮겨 간 화면의 보내기를 막지 않게 놓아 준다(#489 리뷰). 판정은 뒤에서 이어 가고,
    // 그 턴의 finally 는 자기 컨트롤러가 아니면 상태를 건드리지 않는다
    // 확인 중 문구(settling, #483)도 함께 내린다 - 옮겨 간 화면에 남지 않게.
    // 판정 전에 떠나 이 abort 가 판정을 일으킨 경우는 아직 놓아 줄 것이 없어, run 의 catch 가 놓아 준다(#505)
    if (judgingRef.current && judgingRef.current === abortRef.current) {
      abortRef.current = null
      setStreaming(false)
      setSettling(false)
    }
  }, [clearStages])

  /**
   * 언마운트 정리 - 단계 타이머와 **진행 중인 스트림**을 함께 끊는다(#94). 안 끊으면 로그아웃 뒤에도 SSE 가 살아 있다.
   */
  useEffect(() => abortActiveStream, [abortActiveStream])

  const selectConversation = useCallback(
    async (id: string) => {
      // 답을 받는 중인 지금 대화를 다시 누르면 아무것도 하지 않는다(#359) - 모바일에서 서랍을 열었다가
      // 지금 대화를 눌러 돌아오는 것이 자연스러운데, 그대로 두면 스트림이 끊겨 답이 중단으로 저장된다
      if (id === activeId && abortRef.current) return
      abortActiveStream()
      const mine = ++generation.current
      setActiveId(id)
      setError(null)
      loadingRef.current = true
      setLoadingMessages(true)
      let loaded: ChatMessage[] = []
      let failed = false
      try {
        loaded = await getMessages(id)
      } catch {
        // 실패하면 빈 이력으로 아래의 같은 길을 타되 실패를 드러낸다(#77 · #359) - 안 드러내면 이력이 있는
        // 대화가 새 대화처럼 빈 화면으로 보인다
        failed = true
      }
      // 그사이 다른 대화로 옮겼으면 버린다. 이 검사가 없으면 A→B 를 빠르게 눌렀을 때
      // 늦게 도착한 A 의 이력이 B 화면을 덮어써, 사이드바는 B 인데 본문은 A 가 된다
      if (generation.current !== mine) return
      setMessages(loaded)
      if (failed) setError('대화를 불러오지 못했습니다')
      loadingRef.current = false
      setLoadingMessages(false)
    },
    [activeId, abortActiveStream],
  )

  /**
   * 첨부 id 별로 새 URL 을 받아 바꾼 때(#558). {@link RESIGN_RETRY_MS} 안에 다시 깨지면 받지 않아 무한 요청을 막고,
   * 지나면 그 URL 이 만료된 것이라 다시 받는다(#600). 받지 못했으면(요청 실패 · 서버 이력에 아직 없음) 남기지 않는다(#587)
   */
  const refreshedAttachments = useRef(new Map<string, number>())
  /** 진행 중인 재서명 요청(#587) - 한 대화의 썸네일 여러 장이 한꺼번에 깨져도 이력은 한 번만 받는다 */
  const resigning = useRef<{ id: string; promise: Promise<ChatMessage[]> } | null>(null)

  /**
   * 보낸 말풍선의 첨부가 깨지면(#558) 이력을 다시 받아 새 서명 URL 로 바꾼다. 낙관적 말풍선은 업로드 응답의
   * 서명 URL(TTL 15분)을 그대로 써서, 첨부 후 오래 있다 보내면 깨진다. 이력 전체로 교체하지 않고 첨부 URL 만
   * id 로 맞바꾼다 - 스트리밍 중인 답변을 덮어쓰지 않으려고. 받는 사이 대화를 옮겼으면 버린다
   */
  const refreshAttachment = useCallback(
    async (attachmentId: string) => {
      const resignedAt = refreshedAttachments.current.get(attachmentId)
      if (!activeId || (resignedAt !== undefined && Date.now() - resignedAt < RESIGN_RETRY_MS)) return
      const mine = generation.current
      let shared = resigning.current
      if (!shared || shared.id !== activeId) {
        const started = { id: activeId, promise: getMessages(activeId) }
        resigning.current = started
        const clear = () => {
          if (resigning.current === started) resigning.current = null
        }
        started.promise.then(clear, clear)
        shared = started
      }
      let server: ChatMessage[]
      try {
        server = await shared.promise
      } catch {
        return
      }
      if (generation.current !== mine) return
      const fresh = new Map(server.flatMap((m) => m.attachments ?? []).map((a) => [a.id, a.url]))
      if (!fresh.has(attachmentId)) return
      refreshedAttachments.current.set(attachmentId, Date.now())
      setMessages((prev) =>
        prev.map((m) =>
          m.attachments?.some((a) => fresh.has(a.id))
            ? { ...m, attachments: m.attachments.map((a) => ({ ...a, url: fresh.get(a.id) ?? a.url })) }
            : m,
        ),
      )
    },
    [activeId],
  )

  const newConversation = useCallback(() => {
    abortActiveStream()
    generation.current++
    setActiveId(null)
    setMessages([])
    loadingRef.current = false
    setLoadingMessages(false)
    setError(null)
  }, [abortActiveStream])

  /**
   * 삭제 실패를 화면에 드러낸다(#77) - 확인 모달은 먼저 닫히므로 표시가 없으면 실패를 알 길이 없다.
   *
   * 실패하면 목록도 건드리지 않는다. 지운 것처럼 보였다가 새로고침에 되살아나는 쪽이 더 나쁘다.
   */
  const deleteConversation = useCallback(
    async (id: string) => {
      // 확인 창은 바로 닫히므로 DELETE 가 도는 사이 다른 대화로 옮길 수 있다(#251).
      // 그때 잡아 둔 activeId 는 낡은 값이라, 응답 뒤에 그것만 보면 옮겨 간 대화를 끊고 비운다
      const mine = generation.current
      try {
        await apiDelete(id)
      } catch (e) {
        setError(errorMessage(e, '대화를 삭제하지 못했습니다'))
        // 실패를 알린다 - 사이드바가 「곧 빠질 행」 표시를 거둔다(#684). 목록은 그대로라 목록 변화로는 알 수 없다
        return false
      }
      listGen.current++
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id && generation.current === mine) {
        // 지운 대화를 떠나는 것도 전환임 - 안 끊으면 사라진 대화에 대고 스트림이 계속 돎
        newConversation()
      }
      return true
    },
    [activeId, newConversation],
  )

  /**
   * 이름 변경 실패를 화면에 드러낸다(#77) - 입력창은 `commitTitle` 이 먼저 닫아, 표시가 없으면 헤더가 조용히 옛 제목으로 돌아간다.
   */
  const renameConversation = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    try {
      const updated = await apiRename(id, trimmed)
      listGen.current++
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch (e) {
      setError(errorMessage(e, '대화 이름을 바꾸지 못했습니다'))
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // 첨부는 입력창이 **고르는 즉시** 올려 두므로 여기서는 이미 올라간 것만 받음(업로드 책임이 컴포저에 있음).
  // settle 은 이 턴을 보냈는지를 생성 왕복이 끝나는 시점에 알린다(#349) - 스트림 완료는 기다리지 않는다.
  // 스트림 전에 끝나는 모든 경로가 settle 을 불러야 한다 - 빠뜨리면 입력창이 영영 기다린다.
  // giveBack 은 받아들인 턴이 서버에 닿기 전에 끊겨 입력창이 보낸 것을 되돌려야 할 때 부른다(#440).
  // textOnly 면 첨부 카드는 버리고 글만 되돌린다 - 카드가 거절 원인일 수 있는 4xx(#480)
  const run = useCallback(
    async (
      text: string,
      attachments: Attachment[],
      settle: (accepted: boolean) => void,
      giveBack?: (textOnly?: boolean) => void,
    ) => {
      setError(null)

      let convId = activeId
      const isNew = !convId
      const mine = generation.current
      if (!convId) {
        // **생성 왕복 중 두 번째 전송을 막는다.** streaming 은 스트림이 열려야 참이 되므로 이 구간에서는
        // 아직 false 다. 막지 않으면 대화가 둘 만들어지고, 두 번째 컨트롤러가 abortRef 를 덮어쓴 뒤
        // 첫 번째의 finally 가 그것을 null 로 지워 정지 버튼이 무력화된다
        creatingRef.current = true
        setCreating(true)
        try {
          // 코드 포인트로 자른다(#434) - slice 는 UTF-16 단위라 이모지를 반으로 가르고, 서버는 반쪽 문자를 400 으로 거절한다
          const conv = await createConversation(Array.from(text).slice(0, 30).join('') || '새 대화')
          // 생성을 기다리는 동안 사용자가 다른 대화를 골랐으면 이 턴을 버린다. 그냥 진행하면 방금
          // 고른 대화의 이력 위에 이 메시지가 얹히고, 사이드바는 새 대화를 가리키는데 본문은 남의
          // 것이 된다. 만들어진 대화는 목록에는 남긴다 - 서버에 실재하기 때문이다
          listGen.current++
          setConversations((prev) => [conv, ...prev])
          if (generation.current !== mine) {
            settle(false)
            return
          }
          setActiveId(conv.id)
          convId = conv.id
        } catch (e) {
          settle(false)
          if (generation.current !== mine) return
          setError(errorMessage(e, '대화를 만들 수 없습니다'))
          return
        } finally {
          creatingRef.current = false
          setCreating(false)
        }
      }
      settle(true)

      // 턴마다 고유 id - 오류/중단으로 끝난 이전 버블과 충돌하지 않게 함
      const assistantId = crypto.randomUUID()
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        status: 'complete',
        citations: [],
        attachments,
      }
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        citations: [],
      }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)
      clearStages() // 이전 턴의 단계가 남아 넘어오지 않게 함
      const controller = new AbortController()
      abortRef.current = controller
      // 이 턴의 계정(#617). 판정은 화면을 떠나도 이어 가지만(#489) 계정이 바뀌면 멈춘다 - 남은 요청이 새 계정 토큰으로 나간다.
      // 언마운트로 가르지 않는다 - 같은 계정이 설정 · 관리 화면으로 옮겨도 언마운트되고, 그때는 빈 대화를 치워야 한다
      const owner = tokenSubject()
      const sameAccount = () => tokenSubject() === owner

      const patch = (updater: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)))
      // delta 를 모아 프레임마다 한 번만 반영한다(#692). delta 마다 반영하면 진행 중 답의 마크다운을 매번 처음부터 다시 파싱한다.
      // 종단(완료 · 오류 · 중단 · 끊김)에서는 남은 것을 먼저 반영한다 - 빈 답 판정과 저장본 비교가 반영된 본문을 봐야 한다
      let pendingDelta = ''
      let frame: number | null = null
      const flushDelta = () => {
        if (frame !== null) {
          cancelAnimationFrame(frame)
          frame = null
        }
        if (!pendingDelta) return
        const delta = pendingDelta
        pendingDelta = ''
        patch((m) => ({ ...m, content: m.content + delta }))
      }
      // 200 을 받았는지(#435). 서버는 질문을 저장한 뒤에 200 을 돌려주므로, 그 전에 끊긴 요청은 질문이 없을 수 있다
      let opened = false
      // 토큰 · 완료를 받았는지(#489). 200 뒤라도 토큰 0개에서 멈추면 서버가 질문을 걷을 수 있어 200 전과 같이 판정한다
      let gotToken = false
      let done = false

      try {
        await streamChat(
          { conversationId: convId, message: text, attachmentIds: attachments.map((a) => a.id) },
          {
            onOpen: () => {
              opened = true
            },
            onStage: ({ label }) => pushStage(label),
            // 토큰이 와도 단계를 끊지 않음 - 남은 단계가 최소 표시 시간을 마치면 답변으로 교체됨
            onToken: (delta) => {
              gotToken = true
              pendingDelta += delta
              if (frame === null) {
                frame = requestAnimationFrame(() => {
                  frame = null
                  flushDelta()
                })
              }
            },
            // 출처도 모아 둔 delta 를 먼저 반영한다(#707) - 안 그러면 출처가 마지막 본문 조각보다 한 프레임 먼저 보였다
            onCitations: (items) => {
              flushDelta()
              patch((m) => ({ ...m, citations: items }))
            },
            onDone: () => {
              done = true
              flushDelta()
              patch((m) => ({ ...m, status: 'complete' }))
              refreshConversations()
            },
            onError: (msg) => {
              flushDelta()
              clearStages() // 오류 경로는 즉시 비움(잔류 0)
              setError(msg)
              patch((m) => ({ ...m, status: 'error' }))
            },
          },
          controller.signal,
        )
      } catch (e) {
        // 사용자가 중단한 경우는 오류가 아님(부분 답변 유지). 중단·절단 모두 단계는 즉시 비움
        flushDelta()
        clearStages()
        const aborted = controller.signal.aborted
        // 중단이 아닌 200 전 실패(#480)
        const failed = !opened && !aborted
        // 서버에 질문이 남았는지 모르는 턴 - 200 전 중단 · 실패, 또는 200 뒤 토큰 0개에서 멈춤 · 끊김(#489, 서버가 질문을 걷을 수 있다).
        // 끊김(네트워크 절단 · 프록시 타임아웃 · 종단 이벤트 없음)도 넣는다 - 서버 타임아웃(#359)은 error 답 행을 남겨 판정이 저장됨으로 가른다
        const unconfirmed = !opened || (!gotToken && !done)
        // 중단이 아닌 실패로 끝난 판정 대상 - 저장됨이면 실패한 답 말풍선으로 실패를 보인다(#480 · #489 리뷰)
        const brokeOff = unconfirmed && !aborted
        const status = e instanceof ApiError ? e.status : null
        // 200 전 4xx 는 서버가 저장 전에 거절한 것이 확실하다(api.md 「검증은 동기」, #480) - 묻지 않고 되돌린다.
        // 5xx 는 아니다 - 질문 저장을 커밋한 뒤에도 날 수 있고(스트림 작업 넘기기 실패), 앞단 프록시의 5xx 는 앱이 저장했는지 모른다
        const rejected = failed && status !== null && status >= 400 && status < 500
        // 401 은 로그아웃으로 가는 길이다 - 같은 토큰으로 더 물어도 401 이라 판정 · 빈 대화 삭제를 건너뛴다
        const unauthorized = rejected && status === 401
        // 429 밖의 4xx 는 첨부가 거절 원인일 수 있다(400 「이미 보낸 첨부」 · 404 「첨부 없음」 등) - 카드까지 돌리면 같은 거절이
        // 되풀이되므로 글만 되돌린다. 429 · 5xx · 네트워크는 때의 문제라 카드도 되돌린다
        const textOnly = rejected && status !== 429
        // fetch 자체의 실패(네트워크)는 onError 를 거치지 않아 여기서 배너를 띄운다(#480). ApiError 는 streamChat 이 이미 띄웠다
        if (failed && status === null) setError('서버에 연결하지 못했습니다. 다시 시도해 주세요.')
        // 중단이면 받은 것이 없는 빈 버블을 남기지 않음 - 서버도 부분 텍스트가 비면 저장하지 않으므로,
        // 남겨 두면 새로고침에 사라져 화면과 재조회가 어긋남
        // 단 onDone 이 이미 확정한 메시지는 서버가 정상 경로로 저장했으므로 지우지 않음
        const emptyAnswer = (m: ChatMessage) => m.id === assistantId && !m.content && m.status !== 'complete'
        // 200 을 받기 전에 끊겼으면 질문 말풍선도 걷는다(#435) - 서버에 닿지 않았을 수 있어, 남기면 새로고침에 사라진다.
        // 닿았는지는 아래에서 서버에 물어 저장됐으면 다시 보인다(#440). 중단이 아닌 200 전 실패도 같다(#480) - 오류는 배너로 보인다
        // 200 뒤 토큰 0개 중단도 같다(#489) - 서버가 걷었을 수 있다
        const unsentQuestion = (m: ChatMessage) => unconfirmed && m.id === userMsg.id
        const settled = (m: ChatMessage): ChatMessage =>
          // onDone 이 이미 확정한 메시지는 건드리지 않음 - 서버는 그 답변을 stopped=false 로 저장했으므로,
          // 여기서 stopped 를 세우면 화면(배너 없음)과 재조회(배너 있음)가 어긋남
          m.id !== assistantId || m.status === 'complete'
            ? m
            : {
                ...m,
                status: aborted ? 'complete' : 'error',
                // 서버 저장분과 같은 표시 - 중단은 출처 판정 전에 끝나므로 무자료 배너를 붙이면 안 됨
                stopped: aborted,
              }
        setMessages((prev) =>
          prev.filter((m) => !(((aborted || unconfirmed) && emptyAnswer(m)) || unsentQuestion(m))).map(settled),
        )
        if (unconfirmed) {
          // 200 전 중단 · 실패는 서버에 물어서 가른다(judgeEarlyAbort, #480 에서 실패까지, #489 에서 200 뒤 토큰 0개 중단 · 끊김까지 넓힘).
          // 이 확인이 끝날 때까지 streaming 이 참이라 그사이 다시 보내기는 거절된다. 그 구간을 settling 으로 드러낸다(#483)
          // 판정 구간 전체를 판정 턴으로 표시한다 - 그사이 대화를 옮기면 abortActiveStream 이 잠금 · settling 을 푼다(#489 리뷰)
          judgingRef.current = controller
          if (generation.current === mine) setSettling(true)
          else if (abortRef.current === controller) {
            // 대화를 옮긴 것이 이 중단을 일으켰으면(#505) abortActiveStream 이 돌 때는 아직 판정 전이라 놓아 줄 것이 없었다 -
            // 여기서 놓아 준다. 판정은 뒤에서 이어 간다
            abortRef.current = null
            setStreaming(false)
          }
          const id = convId
          // 4xx 거절은 저장되지 않은 것이 확실해 기존 대화는 묻지 않는다. 새 대화는 빈 대화를 지워야 하므로 조건부 삭제는 그대로 탄다.
          // 단 기존 대화의 404 는 대화가 지워졌을 수 있어(다른 탭) 이력으로 확인한다 - 「첨부 없음」도 404 라 코드만으로는 못 가른다
          let outcome: EarlyAbortOutcome = { kind: 'unknown' }
          if (rejected && !isNew) {
            if (status === 404 && sameAccount()) {
              const gone = await getMessages(id).then(
                () => false,
                (err) => err instanceof ApiError && err.status === 404,
              )
              if (gone) outcome = { kind: 'deleted' }
            }
          } else if (!unauthorized) {
            outcome = await judgeEarlyAbort(
              id,
              isNew,
              text,
              opened,
              () => generation.current === mine,
              sameAccount,
            )
          }
          // 세대는 판정을 기다린 **뒤에** 본다 - 그사이 대화를 옮겼으면 화면 · 입력창을 건드리지 않는다
          const here = generation.current === mine
          if (outcome.kind === 'stored') {
            // 저장된 질문은 남긴다. 답이 있으면 끊기 전에 서버가 보낸 부분 답이다. 답 없는 질문은 서버가 걷으므로(#489)
            // 재확인 구간이 끝나도 남은 경우만 답 없이 남는다(frontend.md 「남은 한계」). 비중단 실패는 실패한 답 말풍선을 붙여 보인다(#480)
            // 이력을 못 받았으면 걷었던 질문 말풍선을 되살린다 - 안 그러면 저장된 질문이 화면 어디에도 없다(#447 리뷰)
            if (here) {
              // 서버가 답 행(타임아웃의 error 행 등)을 이미 남겼으면 겹쳐 붙이지 않는다
              const answered = outcome.saved?.at(-1)?.role === 'assistant'
              const failedAnswer: ChatMessage[] = brokeOff && !answered ? [{ ...assistantMsg, status: 'error' }] : []
              if (outcome.saved) setMessages([...outcome.saved, ...failedAnswer])
              else setMessages((prev) => [...prev, userMsg, ...failedAnswer])
            }
          } else if (here) {
            // 입력창에 되돌린다(#440). 대화를 옮겨 끊긴 경우는 되돌리지 않는다 - 입력창은 대화마다
            // 따로가 아니라서, 옮겨 간 대화로 그 글이 잘못 나갈 수 있다
            giveBack?.(textOnly)
          }
          if (outcome.kind === 'deleted') {
            // 남은 화면은 새 대화와 같게 되돌려 다음 전송이 지운 대화로 나가지 않게 한다.
            // 기존 대화가 지워졌으면(다른 탭) 남은 이력도 비운다 - 다음 전송이 그 이력 뒤에 붙어 보인다
            if (here) {
              setActiveId(null)
              setMessages([])
            }
            listGen.current++
            setConversations((prev) => prev.filter((c) => c.id !== id))
          }
          // 지운 뒤에 목록을 받아야 되살아나 보이지 않는다. 401 은 목록도 401 이라 받지 않는다
          // 계정이 바뀌었으면 받지 않는다 - 다음 계정 토큰으로 나간다(#617)
          if (isNew && !unauthorized && sameAccount()) refreshConversations()
        } else if (isNew) refreshConversations()
      } finally {
        // 정상 종료는 남은 단계가 최소 표시 시간을 마치며 스스로 비워짐(useStageQueue).
        // 판정 중에 대화를 옮겨 이미 놓아 줬으면(#489 리뷰) 옮겨 간 화면의 새 스트림 · settling 상태를 덮지 않는다.
        // 판정 표시도 자기 것일 때만 지운다(#588) - 그사이 판정에 들어간 뒤 턴의 표시를 지우면 다시 옮겨도 그 잠금이 안 풀린다
        if (judgingRef.current === controller) judgingRef.current = null
        if (abortRef.current === controller) {
          setStreaming(false)
          setSettling(false)
          abortRef.current = null
        }
      }
    },
    [activeId, refreshConversations, clearStages, pushStage],
  )

  /**
   * 전송을 받아들였는지 돌려준다(#323). 입력창은 받아들였을 때만 입력과 첨부 초안을 비운다 -
   * 조용히 버리면 입력이 사라지고 이미 올린 첨부는 회수 크론을 기다리는 고아가 된다.
   *
   * 기존 대화는 곧바로, 새 대화는 **생성 왕복이 끝난 뒤에** 정해진다(#349) - 생성이 실패하면 보낸 것이 없다.
   * 받아들인 뒤 200 전(또는 200 뒤 토큰 0개, #489)에 중단 · 실패했고 서버에 질문이 없으면 `giveBack` 으로 알린다(#440 · #480) - 입력창은 이미 비웠으므로 되돌릴 몫이 거기 있다.
   * 거절 판정과 생성 중 표시는 같은 틱에 끝나므로 같은 틱의 두 번째 전송도 막힌다.
   *
   * 이력 로딩 중에도 거절한다. 받아 들이면 말풍선이 직전 대화의 목록에 붙고, 곧 도착한 이력이 목록을
   * 갈아 끼워 답 말풍선이 사라진다 - send 는 세대를 올리지 않으므로 그 이력은 버려지지 않는다.
   */
  const send = useCallback(
    (text: string, attachments: Attachment[], giveBack?: (textOnly?: boolean) => void): Promise<boolean> => {
      if (streaming || creatingRef.current || loadingRef.current) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        void run(text, attachments, resolve, giveBack)
      })
    },
    [streaming, run],
  )

  return {
    conversations,
    conversationsLoading,
    conversationsFailed,
    retryConversations,
    activeId,
    messages,
    loadingMessages,
    creating,
    streaming,
    settling,
    stage,
    error,
    send,
    stop,
    selectConversation,
    refreshAttachment,
    newConversation,
    deleteConversation,
    renameConversation,
  }
}
