import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError, getToken, setToken, setUnauthorizedHandler, handleUnauthorized } from './api'

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
      handleUnauthorized('/api/auth/signup')
      handleUnauthorized('/api/profile/password')
      expect(onExpire).not.toHaveBeenCalled()
      setUnauthorizedHandler(null)
    })

    it('핸들러가 없어도 터지지 않는다', () => {
      setUnauthorizedHandler(null)
      expect(() => handleUnauthorized('/api/conversations')).not.toThrow()
    })
  })
})
