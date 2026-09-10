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

/** 계정 발급. 임시 비밀번호는 이 응답에만 실려 오고 다시 조회할 수 없다 */
export const createAdminUser = (email: string, name: string) =>
  api.post<{ temporaryPassword: string }>('/api/admin/users', { email, name })
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
  // 종단 이벤트(done|error)를 실제로 받았는지. **받지 못한 채 끝나는 경로가 있다** -
  // 서버 SSE 타임아웃은 emitter 를 닫을 뿐 done 도 error 도 싣지 못하고(닫힌 뒤의 send 는
  // IllegalStateException 이라 그렇다), 프록시 idle timeout · 네트워크 절단도 같은 모양으로 온다.
  // 그때 reader 는 예외 없이 done:true 를 주므로, 이 표시가 없으면 streamChat 이 **정상 반환**해
  // 호출부의 catch 도 onDone 도 돌지 않는다 - 말풍선이 streaming 인 채 영구히 남는다
  let terminated = false

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const rawEvent = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      if (dispatchEvent(rawEvent, handlers)) terminated = true
    }
  }

  if (!terminated) {
    // 사용자가 중단한 경우는 여기 오지 않는다 - abort 는 reader.read() 를 거부시켜 위에서 던진다.
    // 위쪽 !res.ok 경로와 같은 모양으로 처리한다(onError 를 부르고 던짐)
    const message = '응답이 끝나기 전에 연결이 끊겼습니다. 다시 시도해 주세요.'
    handlers.onError?.(message)
    throw new Error(message)
  }
}

/** 종단 이벤트(done|error)를 전달했으면 true. 스트림이 계약대로 끝났는지 판정하는 데 쓴다 */
function dispatchEvent(raw: string, handlers: ChatStreamHandlers): boolean {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return false
  let data: unknown
  try {
    data = JSON.parse(dataLines.join('\n'))
  } catch {
    return false
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
      return true
    case 'error':
      handlers.onError?.((data as { message: string }).message)
      return true
  }
  return false
}
