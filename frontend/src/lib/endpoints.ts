import { adoptRefreshedToken, api, API_BASE, ApiError, getToken, handleUnauthorized } from './api'
import type {
  AdminUser,
  Attachment,
  AuthResponse,
  ChatMessage,
  Citation,
  Conversation,
  Me,
  RagDocument,
  Theme,
} from './types'

// 프로필 (마이페이지)
export const updateName = (name: string) => api.patch<Me>('/api/profile/name', { name })
export const updateTheme = (theme: Theme) => api.patch<Me>('/api/profile/theme', { theme })
// 변경 이전 토큰은 서버가 전부 무효화하므로 응답의 새 토큰으로 반드시 교체해야 세션이 이어짐
export const updatePassword = (currentPassword: string, newPassword: string) =>
  api.patch<AuthResponse>('/api/profile/password', { currentPassword, newPassword })

// 대화
export const listConversations = () => api.get<Conversation[]>('/api/conversations')
export const createConversation = (title?: string) =>
  api.post<Conversation>('/api/conversations', { title })
export const renameConversation = (id: string, title: string) =>
  api.patch<Conversation>(`/api/conversations/${id}`, { title })
export const deleteConversation = (id: string) => api.del<void>(`/api/conversations/${id}`)
export const getMessages = (id: string) => api.get<ChatMessage[]>(`/api/conversations/${id}/messages`)

// 파일 업로드 - 고르는 즉시 올림(전송 시점이 아님). signal 은 카드를 지웠을 때 끊기 위한 것
export function uploadFile(file: File, signal?: AbortSignal): Promise<Attachment> {
  const form = new FormData()
  form.append('file', file)
  return api.postForm<Attachment>('/api/files', form, signal)
}

// 전송 전에 첨부를 뺀 경우. 안 지우면 message_id 가 비어 있는 고아로 남아 회수 크론을 기다리게 됨
export const deleteAttachment = (id: string) => api.del<void>(`/api/files/${id}`)

// 관리자 (FEAT-ADMIN-002 · 003). 관리자가 아니면 서버가 404 를 준다 - 403 이 아니다
export const listDocuments = () => api.get<RagDocument[]>('/api/admin/documents')
export const deleteDocument = (id: string) => api.del<void>(`/api/admin/documents/${id}`)
export const listAdminUsers = () => api.get<AdminUser[]>('/api/admin/users')
export const resetUserPassword = (id: string) =>
  api.post<{ temporaryPassword: string }>(`/api/admin/users/${id}/password-reset`)

export function uploadDocument(file: File): Promise<RagDocument> {
  const form = new FormData()
  form.append('file', file)
  return api.postForm<RagDocument>('/api/admin/documents', form)
}

export interface ChatStreamHandlers {
  onMeta?: (data: { messageId: string; conversationId: string }) => void
  /** 진행 단계(R-11) - 라벨 문자열은 서버가 소유함(모드별로 다름) */
  onStage?: (data: { stage: string; label: string }) => void
  onToken?: (delta: string) => void
  onCitations?: (items: Citation[]) => void
  onDone?: (data: { finishReason: string; noSource: boolean }) => void
  onError?: (message: string) => void
}

interface ChatStreamBody {
  conversationId: string
  message: string
  attachmentIds: string[]
}

/**
 * 채팅 SSE 수신. EventSource는 Authorization 헤더를 못 실으므로 fetch + ReadableStream 사용.
 * 이벤트: meta → stage* → token* → citations → done (또는 error).
 */
export async function streamChat(
  body: ChatStreamBody,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(API_BASE + '/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
  // 이 경로는 api 래퍼를 안 거치므로 토큰 갱신·만료 처리를 여기서 직접 물림
  adoptRefreshedToken(res)
  if (!res.ok || !res.body) {
    if (res.status === 401) handleUnauthorized('/api/chat')
    let message = `요청 실패 (${res.status})`
    try {
      const data = await res.json()
      if (data?.message) message = data.message
    } catch {
      // 본문 없음
    }
    handlers.onError?.(message)
    throw new ApiError(res.status, message)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const rawEvent = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      dispatchEvent(rawEvent, handlers)
    }
  }
}

function dispatchEvent(raw: string, handlers: ChatStreamHandlers): void {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return
  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    return
  }
  switch (event) {
    case 'meta':
      handlers.onMeta?.(data as { messageId: string; conversationId: string })
      break
    case 'stage':
      handlers.onStage?.(data as { stage: string; label: string })
      break
    case 'token':
      handlers.onToken?.((data as { delta: string }).delta)
      break
    case 'citations':
      handlers.onCitations?.((data as { items: Citation[] }).items)
      break
    case 'done':
      handlers.onDone?.(data as { finishReason: string; noSource: boolean })
      break
    case 'error':
      handlers.onError?.((data as { message: string }).message)
      break
  }
}
