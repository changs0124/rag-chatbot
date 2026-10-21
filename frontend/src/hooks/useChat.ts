import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createConversation,
  deleteConversation as apiDelete,
  getMessages,
  listConversations,
  renameConversation as apiRename,
  streamChat,
} from '../lib/endpoints'
import { errorMessage } from '../lib/api'
import type { Attachment, ChatMessage, Conversation } from '../lib/types'

/**
 * 한 단계를 화면에 유지하는 최소 시간(ms). 목업은 단계가 같은 순간에 도착해 표시 시간이 0이 되므로,
 * 실제로 도달한 단계를 읽을 수 있을 만큼만 붙잡아 둠. 없는 단계를 만들거나 순서를 바꾸지는 않음(REQ-RAG-004).
 */
const STAGE_MIN_MS = 350

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // 고른 대화의 이력이 오는 중 - 그동안 본문은 직전 대화 대신 로딩 표시를 보인다(#291)
  const [loadingMessages, setLoadingMessages] = useState(false)
  // send 의 거절 판정용 사본(#323) - 고른 직후 같은 틱의 전송도 막으려고 상태와 함께 바로 쓴다
  const loadingRef = useRef(false)
  const [streaming, setStreaming] = useState(false)
  // 진행 단계(REQ-CHAT-005) - 휘발성 표시라 저장하지 않음. 중단·오류에서는 즉시 비움
  const [stage, setStage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
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
  // 실제 도달한 단계를 순서대로 담아 최소 표시 시간만큼 유지함(단계를 만들지 않고 읽을 시간만 줌)
  const stageQueue = useRef<string[]>([])
  const stageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const advanceStage = useCallback(() => {
    const next = stageQueue.current.shift()
    if (next === undefined) {
      stageTimer.current = null
      setStage(null)
      return
    }
    setStage(next)
    stageTimer.current = setTimeout(advanceStage, STAGE_MIN_MS)
  }, [])

  const clearStages = useCallback(() => {
    if (stageTimer.current) clearTimeout(stageTimer.current)
    stageTimer.current = null
    stageQueue.current = []
    setStage(null)
  }, [])

  // 답변 뒤 갱신 실패는 목록이 그대로 남으니 조용히 넘긴다
  const refreshConversations = useCallback(() => {
    listConversations().then(setConversations).catch(() => {})
  }, [])

  // 첫 로드 실패를 삼키면 「대화가 없습니다」로 보인다 - 없는 것과 못 불러온 것을 가른다(#385, #77 · #359 와 같은 이유)
  useEffect(() => {
    listConversations()
      .then(setConversations)
      .catch(() => setError('대화 목록을 불러오지 못했습니다'))
  }, [])

  /**
   * 대화를 떠날 때 돌고 있던 스트림을 끊음.
   *
   * 안 끊으면 이전 대화의 스트림이 계속 돌면서 단계 줄이 새 화면에 잔류함. 중단 후 처리는
   * 정해진 정책을 그대로 탐(부분 저장 + `complete`) - `run` 의 catch 가 수행하며, 그 시점엔
   * `messages` 가 이미 새 대화 것으로 바뀌어 있어 이전 턴의 patch 는 대상을 못 찾고 흘러감.
   */
  const abortActiveStream = useCallback(() => {
    abortRef.current?.abort()
    clearStages()
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
        return
      }
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id && generation.current === mine) {
        // 지운 대화를 떠나는 것도 전환임 - 안 끊으면 사라진 대화에 대고 스트림이 계속 돎
        newConversation()
      }
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
      setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
    } catch (e) {
      setError(errorMessage(e, '대화 이름을 바꾸지 못했습니다'))
    }
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const run = useCallback(
    // 첨부는 입력창이 **고르는 즉시** 올려 두므로 여기서는 이미 올라간 것만 받음(업로드 책임이 컴포저에 있음).
    // settle 은 이 턴을 보냈는지를 생성 왕복이 끝나는 시점에 알린다(#349) - 스트림 완료는 기다리지 않는다.
    // 스트림 전에 끝나는 모든 경로가 settle 을 불러야 한다 - 빠뜨리면 입력창이 영영 기다린다
    async (text: string, attachments: Attachment[], settle: (accepted: boolean) => void) => {
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
          const conv = await createConversation(text.slice(0, 30) || '새 대화')
          // 생성을 기다리는 동안 사용자가 다른 대화를 골랐으면 이 턴을 버린다. 그냥 진행하면 방금
          // 고른 대화의 이력 위에 이 메시지가 얹히고, 사이드바는 새 대화를 가리키는데 본문은 남의
          // 것이 된다. 만들어진 대화는 목록에는 남긴다 - 서버에 실재하기 때문이다
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

      const patch = (updater: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)))

      try {
        await streamChat(
          { conversationId: convId, message: text, attachmentIds: attachments.map((a) => a.id) },
          {
            onStage: ({ label }) => {
              stageQueue.current.push(label)
              if (stageTimer.current === null) advanceStage()
            },
            // 토큰이 와도 단계를 끊지 않음 - 남은 단계가 최소 표시 시간을 마치면 답변으로 교체됨
            onToken: (delta) => patch((m) => ({ ...m, content: m.content + delta })),
            onCitations: (items) => patch((m) => ({ ...m, citations: items })),
            onDone: () => {
              patch((m) => ({ ...m, status: 'complete' }))
              refreshConversations()
            },
            onError: (msg) => {
              clearStages() // 오류 경로는 즉시 비움(잔류 0)
              setError(msg)
              patch((m) => ({ ...m, status: 'error' }))
            },
          },
          controller.signal,
        )
      } catch {
        // 사용자가 중단한 경우는 오류가 아님(부분 답변 유지). 중단·절단 모두 단계는 즉시 비움
        clearStages()
        if (controller.signal.aborted) {
          // 받은 것이 없으면 빈 버블을 남기지 않음 - 서버도 부분 텍스트가 비면 저장하지 않으므로,
          // 남겨 두면 새로고침에 사라져 화면과 재조회가 어긋남
          // 단 onDone 이 이미 확정한 메시지는 서버가 정상 경로로 저장했으므로 지우지 않음
          setMessages((prev) =>
            prev.filter((m) => !(m.id === assistantId && !m.content && m.status !== 'complete')),
          )
        }
        patch((m) =>
          // onDone 이 이미 확정한 메시지는 건드리지 않음 - 서버는 그 답변을 stopped=false 로 저장했으므로,
          // 여기서 stopped 를 세우면 화면(배너 없음)과 재조회(배너 있음)가 어긋남
          m.status === 'complete'
            ? m
            : {
                ...m,
                status: controller.signal.aborted ? 'complete' : 'error',
                // 서버 저장분과 같은 표시 - 중단은 출처 판정 전에 끝나므로 무자료 배너를 붙이면 안 됨
                stopped: controller.signal.aborted,
              },
        )
        if (isNew) refreshConversations()
      } finally {
        // 정상 종료는 남은 단계가 최소 표시 시간을 마치며 스스로 비워짐(advanceStage)
        setStreaming(false)
        abortRef.current = null
      }
    },
    [activeId, refreshConversations, clearStages, advanceStage],
  )

  /**
   * 전송을 받아들였는지 돌려준다(#323). 입력창은 받아들였을 때만 입력과 첨부 초안을 비운다 -
   * 조용히 버리면 입력이 사라지고 이미 올린 첨부는 회수 크론을 기다리는 고아가 된다.
   *
   * 기존 대화는 곧바로, 새 대화는 **생성 왕복이 끝난 뒤에** 정해진다(#349) - 생성이 실패하면 보낸 것이 없다.
   * 거절 판정과 생성 중 표시는 같은 틱에 끝나므로 같은 틱의 두 번째 전송도 막힌다.
   *
   * 이력 로딩 중에도 거절한다. 받아 들이면 말풍선이 직전 대화의 목록에 붙고, 곧 도착한 이력이 목록을
   * 갈아 끼워 답 말풍선이 사라진다 - send 는 세대를 올리지 않으므로 그 이력은 버려지지 않는다.
   */
  const send = useCallback(
    (text: string, attachments: Attachment[]): Promise<boolean> => {
      if (streaming || creatingRef.current || loadingRef.current) return Promise.resolve(false)
      return new Promise<boolean>((resolve) => {
        void run(text, attachments, resolve)
      })
    },
    [streaming, run],
  )

  return {
    conversations,
    activeId,
    messages,
    loadingMessages,
    creating,
    streaming,
    stage,
    error,
    send,
    stop,
    selectConversation,
    newConversation,
    deleteConversation,
    renameConversation,
  }
}
