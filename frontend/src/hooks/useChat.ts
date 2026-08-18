import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createConversation,
  deleteConversation as apiDelete,
  getMessages,
  listConversations,
  renameConversation as apiRename,
  streamChat,
} from '../lib/endpoints'
import { ApiError } from '../lib/api'
import type { Attachment, ChatMessage, Conversation } from '../lib/types'

/**
 * 한 단계를 화면에 유지하는 최소 시간(ms). 목업은 단계가 같은 순간에 도착해 표시 시간이 0이 되므로,
 * 실제로 도달한 단계를 읽을 수 있을 만큼만 붙잡아 둠. 없는 단계를 만들거나 순서를 바꾸지는 않음(P-10).
 */
const STAGE_MIN_MS = 350

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  // 진행 단계(R-11) - 휘발성 표시라 저장하지 않음. 중단·오류에서는 즉시 비움
  const [stage, setStage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
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

  useEffect(() => () => clearStages(), [clearStages])

  const refreshConversations = useCallback(() => {
    listConversations().then(setConversations).catch(() => {})
  }, [])

  useEffect(() => {
    refreshConversations()
  }, [refreshConversations])

  /**
   * 대화를 떠날 때 돌고 있던 스트림을 끊음.
   *
   * 안 끊으면 이전 대화의 스트림이 계속 돌면서 단계 줄이 새 화면에 잔류함. 중단 후 처리는
   * 정해진 정책을 그대로 탐(부분 저장 + `complete`) - `send` 의 catch 가 수행하며, 그 시점엔
   * `messages` 가 이미 새 대화 것으로 바뀌어 있어 이전 턴의 patch 는 대상을 못 찾고 흘러감.
   */
  const abortActiveStream = useCallback(() => {
    abortRef.current?.abort()
    clearStages()
  }, [clearStages])

  const selectConversation = useCallback(
    async (id: string) => {
      abortActiveStream()
      setActiveId(id)
      setError(null)
      try {
        setMessages(await getMessages(id))
      } catch {
        setMessages([])
      }
    },
    [abortActiveStream],
  )

  const newConversation = useCallback(() => {
    abortActiveStream()
    setActiveId(null)
    setMessages([])
    setError(null)
  }, [abortActiveStream])

  const deleteConversation = useCallback(
    async (id: string) => {
      await apiDelete(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        // 지운 대화를 떠나는 것도 전환임 - 안 끊으면 사라진 대화에 대고 스트림이 계속 돎
        abortActiveStream()
        setActiveId(null)
        setMessages([])
      }
    },
    [activeId, abortActiveStream],
  )

  const renameConversation = useCallback(async (id: string, title: string) => {
    const trimmed = title.trim()
    if (!trimmed) return
    const updated = await apiRename(id, trimmed)
    setConversations((prev) => prev.map((c) => (c.id === id ? updated : c)))
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const send = useCallback(
    // 첨부는 입력창이 **고르는 즉시** 올려 두므로 여기서는 이미 올라간 것만 받음(업로드 책임이 컴포저에 있음)
    async (text: string, attachments: Attachment[]) => {
      if (streaming) return
      setError(null)

      let convId = activeId
      const isNew = !convId
      if (!convId) {
        try {
          const conv = await createConversation(text.slice(0, 30) || '새 대화')
          setConversations((prev) => [conv, ...prev])
          setActiveId(conv.id)
          convId = conv.id
        } catch (e) {
          setError(e instanceof ApiError ? e.message : '대화를 만들 수 없습니다')
          return
        }
      }

      // 턴마다 고유 id - 오류/중단으로 끝난 이전 버블과 충돌하지 않게 함
      const assistantId = crypto.randomUUID()
      const now = new Date().toISOString()
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        status: 'complete',
        createdAt: now,
        citations: [],
        attachments,
      }
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: now,
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
              clearStages() // 오류 경로는 즉시 비움(잔류 0, AC-23)
              setError(msg)
              patch((m) => ({ ...m, status: 'error' }))
            },
          },
          controller.signal,
        )
      } catch {
        // 사용자가 중단한 경우는 오류가 아님(부분 답변 유지). 중단·절단 모두 단계는 즉시 비움(AC-23)
        clearStages()
        if (controller.signal.aborted) {
          // 받은 것이 없으면 빈 버블을 남기지 않음 - 서버도 부분 텍스트가 비면 저장하지 않으므로,
          // 남겨 두면 새로고침에 사라져 화면과 재조회가 어긋남(2026-07-28 중단 상태 정책 결정)
          // 단 onDone 이 이미 확정한 메시지는 서버가 정상 경로로 저장했으므로 지우지 않음(재리뷰 라운드 3 ③)
          setMessages((prev) =>
            prev.filter((m) => !(m.id === assistantId && !m.content && m.status !== 'complete')),
          )
        }
        patch((m) =>
          // onDone 이 이미 확정한 메시지는 건드리지 않음 - 서버는 그 답변을 stopped=false 로 저장했으므로,
          // 여기서 stopped 를 세우면 화면(배너 없음)과 재조회(배너 있음)가 어긋남(재리뷰 라운드 2 N-4)
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
    [activeId, streaming, refreshConversations, clearStages, advanceStage],
  )

  return {
    conversations,
    activeId,
    messages,
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
