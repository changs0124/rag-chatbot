import { listConversations } from './endpoints'
import { getToken, tokenSubject } from './api'
import type { Conversation } from './types'

/** 미리 받은 목록을 쓸 수 있는 시간 - 지나면 버리고 새로 받는다 */
export const PREFETCH_MAX_AGE_MS = 10_000

let early: { owner: string | null; at: number; promise: Promise<Conversation[]> } | null = null

/**
 * 새로고침 때 대화 목록을 `/api/auth/me` 와 같은 순간에 받기 시작한다(#694).
 * 기다리지 않으면 me 응답 → ChatPage 마운트 → 목록 요청으로 왕복이 하나 더 직렬로 붙는다.
 *
 * 받은 promise 는 첫 목록 로드가 **한 번만** 쓴다. 계정이 바뀌었거나(#617 - 다른 계정 목록이 섞이면 안 됨)
 * 오래됐으면(설정 화면에 머물다 채팅으로 온 경우 - 다른 탭의 변경을 놓친다) 버리고 새로 받게 한다.
 * 채팅이 아닌 화면(`/me` · `/admin/*`)으로 새로고침하면 받은 목록은 쓰이지 않고 끝난다(요청 하나 낭비).
 */
export function prefetchConversations(): void {
  if (!getToken()) return
  const promise = listConversations()
  // 쓰이지 않고 실패해도 처리되지 않은 rejection 으로 남지 않게 - 쓰는 쪽은 실패하면 새로 받는다(#701)
  promise.catch(() => {})
  early = { owner: tokenSubject(), at: Date.now(), promise }
}

export function takePrefetchedConversations(): Promise<Conversation[]> | null {
  const taken = early
  early = null
  if (!taken || taken.owner !== tokenSubject() || Date.now() - taken.at > PREFETCH_MAX_AGE_MS) return null
  // 미리 받기가 실패했으면 새로 받는다(#701) - 배포 재시작 순간의 5xx 는 me 가 재시도(#250)로 넘기는데, 그 실패를 그대로 쓰면
  // 목록만 「불러오지 못했습니다」로 남았다. 만료 토큰의 401 뒤 같은 계정으로 다시 로그인한 경우도 같다(만료 JWT 도 sub 가 같다)
  // 재시도 직전에 계정을 다시 본다(#707) - 진행 중이던 요청이 401 이면 onUnauthorized 가 먼저 토큰을 지워, 토큰 없이 한 번 더 나갔다
  return taken.promise.catch((e: unknown) => (tokenSubject() === taken.owner ? listConversations() : Promise.reject(e)))
}
