export type Theme = 'light' | 'dark' | 'system'

export interface Me {
  id: string
  email: string
  name: string
  theme: Theme
}

export interface AuthResponse {
  token: string
  user: Me
}

export interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface Citation {
  seq: number
  sourceName: string
  snippet: string
  uri: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: string
  createdAt: string
  citations: Citation[]
  // 로컬 낙관적 표시용(백엔드 메시지 조회는 텍스트+출처만 반환)
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  fileType: 'image' | 'document'
  url: string
}
