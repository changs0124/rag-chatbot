import type { ChatMessage, Conversation } from '../lib/types'

/** 손으로 끝낼 수 있는 프라미스 - 「응답이 도착하는 순간」을 테스트가 정함 */
export function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export const msg = (id: string): ChatMessage => ({
  id,
  role: 'user',
  content: id,
  status: 'complete',
  citations: [],
})

export const conv = (id: string): Conversation => ({ id, title: id, updatedAt: '' })
