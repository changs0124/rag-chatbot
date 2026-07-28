import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createConversation,
  deleteConversation as apiDelete,
  getMessages,
  listConversations,
  renameConversation as apiRename,
  streamChat,
  uploadFile,
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

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id)
    setError(null)
    try {
      setMessages(await getMessages(id))
    } catch {
      setMessages([])
    }
  }, [])

  const newConversation = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
  }, [])

  const deleteConversation = useCallback(
    async (id: string) => {
      await apiDelete(id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (activeId === id) {
        setActiveId(null)
        setMessages([])
      }
    },
    [activeId],
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
    async (text: string, files: File[]) => {
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

      let uploaded: Attachment[] = []
      try {
        uploaded = await Promise.all(files.map(uploadFile))
      } catch (e) {
        setError(e instanceof ApiError ? e.message : '파일 업로드 실패')
        return
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
        attachments: uploaded,
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
          { conversationId: convId, message: text, attachmentIds: uploaded.map((a) => a.id) },
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
