export type Theme = 'light' | 'dark' | 'system'

export interface Me {
  id: string
  email: string
  name: string
  theme: Theme
  // 관리 메뉴를 **보여줄지 말지**만 정하는 값. 접근 제어가 아니다 —
  // URL 로 직접 들어오는 경로는 서버가 404 로 막는다(FEAT-ADMIN-001)
  role: 'user' | 'admin'
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
  // 사용자가 끊어 **출처 판정 전에** 끝난 답변임(2026-07-28). status 는 complete 그대로이고,
  // 이 플래그가 무자료 배너를 억제함 - 없으면 중단된 답변마다 "자료 없음"이 거짓으로 붙음
  stopped?: boolean
  createdAt: string
  citations: Citation[]
  // 재조회 응답에도 실림(2026-07-28) - URL 은 조회 시점에 새로 서명된 값임.
  // 전송 직후에는 로컬 낙관적 표시로 먼저 채워짐
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  // 문서 업로드는 2026-07-28부터 받지 않음(모델에 전달되지 않아 오해를 만들었음).
  // 과거에 올라간 첨부가 남아 있을 수 있어 타입은 유지함
  fileType: 'image' | 'document'
  url: string
}
