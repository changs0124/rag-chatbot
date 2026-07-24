import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createConversation,
  deleteConversation as apiDelete,
  getMessages,
  listConversations,
  streamChat,
  uploadFile,
} from '../lib/endpoints'
import { ApiError } from '../lib/api'
import type { Attachment, ChatMessage, Conversation } from '../lib/types'

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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
      const controller = new AbortController()
      abortRef.current = controller

      const patch = (updater: (m: ChatMessage) => ChatMessage) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)))

      try {
        await streamChat(
          { conversationId: convId, message: text, attachmentIds: uploaded.map((a) => a.id) },
          {
            onToken: (delta) => patch((m) => ({ ...m, content: m.content + delta })),
            onCitations: (items) => patch((m) => ({ ...m, citations: items })),
            onDone: () => {
              patch((m) => ({ ...m, status: 'complete' }))
              refreshConversations()
            },
            onError: (msg) => {
              setError(msg)
              patch((m) => ({ ...m, status: 'error' }))
            },
          },
          controller.signal,
        )
      } catch {
        // 사용자가 중단한 경우는 오류가 아님(부분 답변 유지)
        patch((m) => ({ ...m, status: controller.signal.aborted ? 'complete' : 'error' }))
        if (isNew) refreshConversations()
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [activeId, streaming, refreshConversations],
  )

  return {
    conversations,
    activeId,
    messages,
    streaming,
    error,
    send,
    stop,
    selectConversation,
    newConversation,
    deleteConversation,
  }
}
