import { describe, it, expect, beforeEach } from 'vitest'
import { ApiError, getToken, setToken } from './api'

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
})
