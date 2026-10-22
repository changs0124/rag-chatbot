import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError, api, getToken, setToken, setUnauthorizedHandler, handleUnauthorized } from './api'

describe('api client', () => {
  beforeEach(() => setToken(null))

  it('stores and clears the token', () => {
    expect(getToken()).toBeNull()
    setToken('abc')
    expect(getToken()).toBe('abc')
    expect(localStorage.getItem('rag_chatbot_token')).toBe('abc')
    setToken(null)
    expect(getToken()).toBeNull()
    expect(localStorage.getItem('rag_chatbot_token')).toBeNull()
  })

  it('ApiError carries status and message', () => {
    const err = new ApiError(404, '없음')
    expect(err.status).toBe(404)
    expect(err.message).toBe('없음')
  })

  describe('인증 만료 처리', () => {
    it('일반 경로의 401은 세션을 비운다', () => {
      const onExpire = vi.fn()
      setUnauthorizedHandler(onExpire)
      handleUnauthorized('/api/conversations')
      expect(onExpire).toHaveBeenCalledOnce()
      setUnauthorizedHandler(null)
    })

    // 이게 깨지면 비밀번호 오타 한 번에 멀쩡한 세션이 날아감
    it('자격 증명 경로의 401은 세션을 유지한다', () => {
      const onExpire = vi.fn()
      setUnauthorizedHandler(onExpire)
      handleUnauthorized('/api/auth/login')
      handleUnauthorized('/api/profile/password')
      expect(onExpire).not.toHaveBeenCalled()
      setUnauthorizedHandler(null)
    })

    it('핸들러가 없어도 터지지 않는다', () => {
      setUnauthorizedHandler(null)
      expect(() => handleUnauthorized('/api/conversations')).not.toThrow()
    })
  })

  // 공용 PC 에서 탭 A 가 로그아웃해도 탭 B 의 모듈 토큰이 살아 있으면, 재발급 때 localStorage 에 다시 써 넣는다(#412)
  describe('다른 탭의 토큰 변경(storage 이벤트)', () => {
    const KEY = 'rag_chatbot_token'
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
      fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })))
      vi.stubGlobal('fetch', fetchMock)
    })
    afterEach(() => {
      setUnauthorizedHandler(null)
      vi.unstubAllGlobals()
    })

    const sentHeaders = () => (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>

    it('다른 탭이 지우면 로그아웃 콜백이 불리고 이후 요청에 토큰이 실리지 않는다', async () => {
      const onExpire = vi.fn()
      setUnauthorizedHandler(onExpire)
      setToken('mine')
      localStorage.removeItem(KEY)
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, oldValue: 'mine', newValue: null }))
      expect(onExpire).toHaveBeenCalledOnce()
      expect(getToken()).toBeNull()
      await api.get('/api/conversations')
      expect(sentHeaders().Authorization).toBeUndefined()
    })

    it('다른 탭이 바꾸면 이후 요청이 새 토큰을 싣는다', async () => {
      setToken('mine')
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, oldValue: 'mine', newValue: 'theirs' }))
      expect(getToken()).toBe('theirs')
      await api.get('/api/conversations')
      expect(sentHeaders().Authorization).toBe('Bearer theirs')
    })

    it('다른 키의 변경은 무시한다', () => {
      const onExpire = vi.fn()
      setUnauthorizedHandler(onExpire)
      setToken('mine')
      window.dispatchEvent(new StorageEvent('storage', { key: 'other', oldValue: 'x', newValue: null }))
      expect(onExpire).not.toHaveBeenCalled()
      expect(getToken()).toBe('mine')
    })
  })
})
