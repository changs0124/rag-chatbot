import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ApiError, api, getToken, setToken, setUnauthorizedHandler, handleUnauthorized, page } from './api'

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
    // sub 만 의미가 있다 - 서명은 서버가 본다
    const jwt = (sub: string, n = 0) => `h.${btoa(JSON.stringify({ sub, n })).replace(/=+$/, '')}.s`
    let fetchMock: ReturnType<typeof vi.fn>
    let reload: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { headers: { 'content-type': 'application/json' } })))
      vi.stubGlobal('fetch', fetchMock)
      reload = vi.spyOn(page, 'reload').mockImplementation(() => {})
    })
    afterEach(() => {
      setUnauthorizedHandler(null)
      vi.unstubAllGlobals()
      reload.mockRestore()
    })

    const fire = (key: string | null, newValue: string | null) =>
      window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
    const sentHeaders = () => (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>

    it('다른 탭이 지우면 저장소를 건드리지 않고 다시 읽으며, 이후 요청에 토큰이 실리지 않는다', async () => {
      const onExpire = vi.fn()
      setUnauthorizedHandler(onExpire)
      setToken(jwt('u1'))
      // 다른 탭이 지운 뒤 곧바로 새로 로그인한 상태 - 늦게 처리된 삭제가 이 값을 지우면 안 된다
      localStorage.setItem(KEY, jwt('u2'))
      fire(KEY, null)
      expect(reload).toHaveBeenCalledOnce()
      expect(onExpire).not.toHaveBeenCalled()
      expect(localStorage.getItem(KEY)).toBe(jwt('u2'))
      await api.get('/api/conversations')
      expect(sentHeaders().Authorization).toBeUndefined()
    })

    it('같은 계정의 재발급이면 다시 읽지 않고 이후 요청이 새 토큰을 싣는다', async () => {
      setToken(jwt('u1', 1))
      fire(KEY, jwt('u1', 2))
      expect(reload).not.toHaveBeenCalled()
      await api.get('/api/conversations')
      expect(sentHeaders().Authorization).toBe(`Bearer ${jwt('u1', 2)}`)
    })

    it('다른 계정으로 바뀌면 다시 읽는다 - 화면은 이전 사용자인데 요청만 새 계정으로 나가지 않게', () => {
      setToken(jwt('u1'))
      fire(KEY, jwt('u2'))
      expect(reload).toHaveBeenCalledOnce()
    })

    it('다른 탭의 localStorage.clear() 는 로그아웃으로 본다', () => {
      setToken(jwt('u1'))
      fire(null, null)
      expect(reload).toHaveBeenCalledOnce()
      expect(getToken()).toBeNull()
    })

    it('다른 키의 변경은 무시한다', () => {
      setToken(jwt('u1'))
      fire('other', null)
      expect(reload).not.toHaveBeenCalled()
      expect(getToken()).toBe(jwt('u1'))
    })
  })
})
