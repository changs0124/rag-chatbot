const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// 배포 빌드인데 베이스 URL 을 안 준 경우 - 번들이 localhost 를 호출해 전부 실패하는데
// 화면에는 그냥 "요청 실패"로만 보임. 원인을 콘솔에 남겨 둠(Vercel 환경변수 누락이 흔함)
if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  console.error('VITE_API_BASE_URL 이 설정되지 않아 localhost 로 요청합니다 - 배포 환경변수를 확인하세요')
}

const TOKEN_KEY = 'rag_chatbot_token'
let token: string | null = localStorage.getItem(TOKEN_KEY)

export function setToken(next: string | null): void {
  token = next
  if (next) {
    localStorage.setItem(TOKEN_KEY, next)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export function getToken(): string | null {
  return token
}

/**
 * 인증 만료 처리. 토큰이 죽으면(만료·비밀번호 변경으로 무효화) 화면이 스스로 로그인으로 돌아가야 함 -
 * 없으면 사용자는 "요청 실패 (401)"만 보고 재로그인 경로를 찾지 못함.
 * 모듈 변수인 이유 : 401은 컴포넌트 밖(fetch 래퍼)에서 드러나므로 훅으로 잡을 수 없음.
 */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

/**
 * 401이 "세션이 죽었다"가 아니라 **"방금 넣은 자격 증명이 틀렸다"** 는 뜻인 경로들.
 * 여기서 로그아웃시키면 안 됨 - 특히 비밀번호 변경은 현재 비밀번호 불일치가 401이라,
 * 오타 한 번에 멀쩡한 세션이 날아감.
 */
const CREDENTIAL_PATHS = ['/api/auth/login', '/api/profile/password']

export function handleUnauthorized(path: string): void {
  if (CREDENTIAL_PATHS.some((p) => path.startsWith(p))) return
  onUnauthorized?.()
}

/**
 * 슬라이딩 재발급(FEAT-OPS-003). 만료가 가까우면 서버가 이 헤더로 새 토큰을 실어 보낸다.
 *
 * 두 곳에서 읽어야 한다 - 이 래퍼와 `endpoints.ts` 의 채팅 스트림. 스트림은 래퍼를 안 거치므로
 * 여기만 하면 **채팅만 쓰는 사용자는 갱신을 못 받아** 두 시간마다 튕긴다.
 *
 * 서버가 CORS 노출 헤더에 등록하지 않으면 브라우저가 이 값을 숨겨 `null` 이 온다 - 그 경우
 * 조용히 아무 일도 일어나지 않으므로, 서버 쪽 등록을 케이스로 잠가 두었다.
 */
export function adoptRefreshedToken(res: Response): void {
  const next = res.headers.get('X-Refresh-Token')
  if (next) setToken(next)
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface RequestOptions {
  method?: string
  body?: unknown
  formData?: FormData
  // 첨부 업로드 취소용. 카드를 지우면 돌던 업로드를 끊어야 함(끊지 않으면 지운 파일이 서버에 남음)
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const res = await fetch(BASE + path, {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  })
  adoptRefreshedToken(res)
  if (!res.ok) {
    if (res.status === 401) handleUnauthorized(path)
    let message = `요청 실패 (${res.status})`
    try {
      const data = await res.json()
      if (data?.message) message = data.message
    } catch {
      // 본문 없음
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') ?? ''
  return (contentType.includes('application/json') ? await res.json() : await res.text()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', formData, signal }),
}

export { BASE as API_BASE }
