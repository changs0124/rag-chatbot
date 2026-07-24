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

const ASSISTANT_PLACEHOLDER = 'streaming-assistant'

export function useChat() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    listConversations().then(setConversations).catch(() => {})
  }, [])

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

  const updateAssistant = useCallback((updater: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === ASSISTANT_PLACEHOLDER ? updater(m) : m)))
  }, [])

  const send = useCallback(
    async (text: string, files: File[]) => {
      if (streaming) return
      setError(null)

      let convId = activeId
      if (!convId) {
        try {
          const conv = await createConversation(text.slice(0, 30) || '새 대화')
          setConversations((prev) => [conv, ...prev])
          setActiveId(conv.id)
          convId = conv.id
        } catch {
          setError('대화를 만들 수 없습니다')
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

      const now = new Date().toISOString()
      const userMsg: ChatMessage = {
        id: `user-${now}`,
        role: 'user',
        content: text,
        status: 'complete',
        createdAt: now,
        citations: [],
        attachments: uploaded,
      }
      const assistantMsg: ChatMessage = {
        id: ASSISTANT_PLACEHOLDER,
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

      try {
        await streamChat(
          { conversationId: convId, message: text, attachmentIds: uploaded.map((a) => a.id) },
          {
            onToken: (delta) => updateAssistant((m) => ({ ...m, content: m.content + delta })),
            onCitations: (items) => updateAssistant((m) => ({ ...m, citations: items })),
            onDone: () => {
              updateAssistant((m) => ({ ...m, id: `asst-${now}`, status: 'complete' }))
              listConversations().then(setConversations).catch(() => {})
            },
            onError: (msg) => {
              setError(msg)
              updateAssistant((m) => ({ ...m, status: 'error' }))
            },
          },
          controller.signal,
        )
      } catch {
        updateAssistant((m) => ({ ...m, status: 'error' }))
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [activeId, streaming, updateAssistant],
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
