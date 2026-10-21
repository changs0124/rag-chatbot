export interface Me {
  id: string
  email: string
  name: string
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
  updatedAt: string
}

export interface Citation {
  seq: number
  sourceName: string
  snippet: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status: 'streaming' | 'complete' | 'error'
  // 사용자가 끊어 **출처 판정 전에** 끝난 답변임. status 는 complete 그대로이고,
  // 이 플래그가 무자료 배너를 억제함 - 없으면 중단된 답변마다 "자료 없음"이 거짓으로 붙음
  stopped?: boolean
  citations: Citation[]
  // 재조회 응답에도 실림 - URL 은 조회 시점에 새로 서명된 값임.
  // 전송 직후에는 로컬 낙관적 표시로 먼저 채워짐
  attachments?: Attachment[]
}

/** 관리 화면의 RAG 문서(FEAT-ADMIN-002) */
export interface RagDocument {
  id: string
  filename: string
  byteSize: number
  // in_progress 는 **업로드가 아니라 인덱싱** 중이라는 뜻. 완료돼야 검색에 잡힌다
  status: 'in_progress' | 'completed' | 'failed'
  uploadedByName: string
  createdAt: string
}

/** 관리 화면의 사용자 목록. 초기화 대상을 고르는 용도라 여기서는 이메일이 필요하다 */
export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'user' | 'admin'
}

export interface Attachment {
  id: string
  // 문서 업로드는 받지 않음(모델에 전달되지 않아 오해를 만듦). DB check 도 'image' 만 허용(#391)
  fileType: 'image'
  url: string
}
