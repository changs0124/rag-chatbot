import { listConversations } from './endpoints'
import { getToken, tokenSubject } from './api'
import type { Conversation } from './types'

/**
 * 새로고침 때 대화 목록을 `/api/auth/me` 와 같은 순간에 받기 시작한다(#694).
 * 기다리지 않으면 me 응답 → ChatPage 마운트 → 목록 요청으로 왕복이 하나 더 직렬로 붙는다.
 *
 * 받은 promise 는 첫 목록 로드가 **한 번만** 쓴다. 계정이 바뀌었거나(#617 - 다른 계정 목록이 섞이면 안 됨)
 * 오래됐으면(설정 화면에 머물다 채팅으로 온 경우 - 다른 탭의 변경을 놓친다) 버리고 새로 받게 한다.
 */
export const PREFETCH_MAX_AGE_MS = 10_000

let early: { owner: string | null; at: number; promise: Promise<Conversation[]> } | null = null

export function prefetchConversations(): void {
  if (!getToken()) return
  const promise = listConversations()
  // 쓰이지 않고 실패해도 처리되지 않은 rejection 으로 남지 않게 - 쓰는 쪽은 원래 promise 로 실패를 받는다
  promise.catch(() => {})
  early = { owner: tokenSubject(), at: Date.now(), promise }
}

export function takePrefetchedConversations(): Promise<Conversation[]> | null {
  const taken = early
  early = null
  if (!taken || taken.owner !== tokenSubject() || Date.now() - taken.at > PREFETCH_MAX_AGE_MS) return null
  return taken.promise
}
