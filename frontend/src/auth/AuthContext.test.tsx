import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { AuthProvider, ME_RETRY_DELAY_MS, ME_RETRY_LIMIT, useAuth } from './AuthContext'
import { getToken, setToken } from '../lib/api'

function Probe() {
  const { user, loading } = useAuth()
  return <p>{loading ? 'loading' : user ? `user:${user.email}` : 'anonymous'}</p>
}

const ME = { id: 'u1', email: 'a@b.com', name: 'A', role: 'user' as const }
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** #250 : 새로고침 때 /me 가 401 이 아닌 이유로 실패해도 로그인을 지우지 않는다 */
describe('AuthProvider /me 실패 처리', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setToken('valid-token')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    setToken(null)
  })

  it('네트워크 실패면 토큰을 지키고 다시 물어 회복한다', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(503, { message: '재기동 중' }))
      .mockResolvedValue(json(200, ME))
    vi.stubGlobal('fetch', fetchMock)

    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => {})
    expect(screen.getByText('loading')).toBeInTheDocument()
    expect(getToken()).toBe('valid-token')

    await act(async () => { await vi.advanceTimersByTimeAsync(ME_RETRY_DELAY_MS * 2) })
    expect(screen.getByText('user:a@b.com')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('끝내 실패해도 토큰은 남긴다(다음 새로고침에서 회복)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => { await vi.advanceTimersByTimeAsync(ME_RETRY_DELAY_MS * ME_RETRY_LIMIT) })
    expect(screen.getByText('anonymous')).toBeInTheDocument()
    expect(getToken()).toBe('valid-token')
  })

  it('401 이면 바로 토큰을 지운다(기존 동작)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, { message: '만료' }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AuthProvider><Probe /></AuthProvider>)
    await act(async () => { await vi.advanceTimersByTimeAsync(ME_RETRY_DELAY_MS * 3) })
    expect(screen.getByText('anonymous')).toBeInTheDocument()
    expect(getToken()).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
