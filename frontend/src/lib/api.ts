const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'

// 배포 빌드인데 베이스 URL 을 안 준 경우 - 번들이 localhost 를 호출해 전부 실패하는데
// 화면에는 그냥 "요청 실패"로만 보임. 원인을 콘솔에 남겨 둠(Vercel 환경변수 누락이 흔함)
if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  console.error('VITE_API_BASE_URL 이 설정되지 않아 localhost 로 요청합니다 - 배포 환경변수를 확인하세요')
}

const TOKEN_KEY = 'rag_chatbot_token'
// 사이트 데이터를 막은 브라우저는 저장소 접근에서 SecurityError 를 던진다(#483 F12). 이 모듈은 import 그래프 최상단이라
// 여기서 터지면 ErrorBoundary 도 못 잡는 백지가 된다 - 모듈 변수(메모리)만으로 물러선다. 세션은 새로고침 전까지다.
// 저장소가 막히면 storage 이벤트도 없어 다른 탭의 로그아웃이 이 탭에 전파되지 않는다
let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
})()

export function setToken(next: string | null): void {
  token = next
  try {
    if (next) {
      localStorage.setItem(TOKEN_KEY, next)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // 저장소가 막혔다 - 메모리 토큰만 쓴다(위 주석). setItem 만 던졌으면(용량 초과 등) 옛 계정 토큰이 남지 않게 지워 본다
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // 지우기도 막혔다 - 읽기도 막혔을 것이라 남은 값이 쓰이지 않는다
    }
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

/** 토큰의 주인(JWT `sub`). 서명은 서버가 보므로 여기서는 읽기만 한다. 못 읽으면 null */
function subjectOf(jwt: string | null): string | null {
  try {
    const part = jwt?.split('.')[1]
    return part ? (JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))).sub ?? null) : null
  } catch {
    return null
  }
}

/** 테스트가 바꿔 끼우는 자리 - jsdom 은 location.reload 를 구현하지 않는다 */
export const page = { reload: () => window.location.reload() }

/**
 * 다른 탭의 로그아웃 · 토큰 교체를 따라간다(#412). `storage` 이벤트는 **다른 탭의** 변경에만 온다(자기 탭은 안 옴).
 * 따르지 않으면 탭 B 의 모듈 토큰이 살아 있어, 로그아웃한 뒤에도 재발급 헤더(adoptRefreshedToken)가
 * localStorage 에 토큰을 다시 써 넣는다 - 공용 PC 에서 다음 사람이 그 계정으로 들어간다.
 *
 * - **같은 계정의 재발급**이면 토큰만 바꾼다 - 화면은 그대로 맞다
 * - **로그아웃 · 다른 계정**이면 페이지를 다시 읽는다. 토큰만 바꾸면 화면은 Y 인데 요청은 X 로 나가고,
 *   로그아웃 처리(onUnauthorized → setToken(null))를 부르면 **늦게 처리된 이벤트가 다른 탭의 새 로그인을 지운다**
 *   (멈춰 있던 탭이 깨어나 밀린 삭제를 처리할 때). 다시 읽으면 저장소를 건드리지 않고 지금 저장소의 상태로 맞춰진다
 * - `key === null` 은 다른 탭의 `localStorage.clear()` 다 - 로그아웃과 같게 본다
 */
window.addEventListener('storage', (e) => {
  if (e.key !== TOKEN_KEY && e.key !== null) return
  const next = e.key === null ? null : e.newValue
  if (next && token && subjectOf(next) !== null && subjectOf(next) === subjectOf(token)) {
    token = next
    return
  }
  token = next
  page.reload()
})

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
 * 부르는 곳은 `authFetch` 하나다(#390). `request` · `endpoints.ts` 의 채팅 스트림 · `docFigures.ts` 의 그림 로드가 모두 거친다 -
 * 우회하면 **그 경로만 쓰는 사용자(채팅만 쓰는 사용자)는 갱신을 못 받아** 두 시간마다 튕긴다.
 *
 * 서버가 CORS 노출 헤더에 등록하지 않으면 브라우저가 이 값을 숨겨 `null` 이 온다 - 그 경우
 * 조용히 아무 일도 일어나지 않으므로, 서버 쪽 등록을 케이스로 잠가 두었다.
 *
 * **로그아웃 뒤에 도착한 응답의 헤더는 버린다(#359).** 로그아웃 전에 떠난 요청이 늦게 돌아와 토큰을 다시 쓰면
 * localStorage 에 남아, 새로고침하면 로그아웃한 세션으로 다시 들어간다.
 *
 * **보낸 세션과 지금 세션이 다르면 버린다(#363).** `sentWith` 는 요청을 보낼 때의 토큰 - A 로 보낸 요청이
 * 로그아웃 → B 로그인 뒤에 돌아오면 A 의 새 토큰이 B 세션을 덮는다. 로그아웃(지금 `null`)도 같은 비교로 걸린다.
 */
export function adoptRefreshedToken(res: Response, sentWith: string | null): void {
  const next = res.headers.get('X-Refresh-Token')
  if (next && token !== null && token === sentWith) setToken(next)
}

/**
 * 실패 응답 → ApiError. 401 이면 만료 처리까지 건다.
 *
 * `request` 밖의 채팅 스트림 · 그림 로드도 쓴다 - 따로 두면 스트림과 나머지 API 의 에러 표시가
 * 조용히 갈린다(#219).
 */
export async function toApiError(res: Response, path: string): Promise<ApiError> {
  if (res.status === 401) handleUnauthorized(path)
  let message = `요청 실패 (${res.status})`
  try {
    const data = await res.json()
    if (data?.message) message = data.message
  } catch {
    // 본문 없음
  }
  return new ApiError(res.status, message)
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 응답이 온 실패는 서버 message, 그 밖은 화면 문구 (#254) */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof ApiError ? e.message : fallback
}

interface RequestOptions {
  method?: string
  body?: unknown
  formData?: FormData
  // 첨부 업로드 취소용. 카드를 지우면 돌던 업로드를 끊어야 함(끊지 않으면 지운 파일이 서버에 남음)
  signal?: AbortSignal
}

/** Bearer 헤더. `authFetch` 만 쓴다 (#300) */
function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * 인증 fetch(#390). 보낼 때의 토큰을 잡아 두고 Bearer 를 실어 보낸 뒤 재발급 헤더를 반영한다.
 * 에러 변환은 하지 않는다 - 호출부마다 다르다(404 를 null 로 보는 그림, onError 를 부르는 스트림).
 *
 * `request` · `streamChat` · `loadFigure` 가 전부 여기를 지나야 한다. 직접 fetch 하면 adoptRefreshedToken 이
 * 빠져 그 경로만 쓰는 사용자는 갱신을 못 받는다(위 주석). 직접 fetch 는 서명 URL 을 받는 ImageLightbox 다운로드뿐이다.
 */
export async function authFetch(
  path: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const sentWith = token
  const res = await fetch(BASE + path, { ...init, headers: { ...init.headers, ...authHeaders() } })
  adoptRefreshedToken(res, sentWith)
  return res
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}

  let body: BodyInit | undefined
  if (options.formData) {
    body = options.formData
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const res = await authFetch(path, {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  })
  if (!res.ok) throw await toApiError(res, path)
  if (res.status === 204) return undefined as T
  const contentType = res.headers.get('content-type') ?? ''
  return (contentType.includes('application/json') ? await res.json() : await res.text()) as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', formData, signal }),
}

export { BASE as API_BASE }
