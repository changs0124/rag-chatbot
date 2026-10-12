import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, api, getToken, setToken, setUnauthorizedHandler } from '../lib/api'
import type { AuthResponse, Me } from '../lib/types'

interface AuthContextValue {
  user: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  setUser: (user: Me) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * 새로고침 때 `/api/auth/me` 가 401 이 아닌 이유(네트워크 · 5xx)로 실패하면 다시 묻는 횟수와 간격(#250).
 * 배포 · 재기동 중에는 헬스까지 10초 남짓 걸려 서버가 잠깐 없다 - 그 사이 새로고침한 사람의 토큰을 지우면
 * 유효한 로그인이 풀린다. 합계 약 30초를 넘기면 포기하되 토큰은 남겨 다음 새로고침에서 회복한다.
 */
export const ME_RETRY_LIMIT = 10
export const ME_RETRY_DELAY_MS = 3000

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  // 토큰이 죽으면(만료·비밀번호 변경) 어떤 요청에서든 세션을 비움 - ProtectedRoute 가 로그인으로 보냄
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null)
      setUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = (attempt: number) => {
      api
        .get<Me>('/api/auth/me')
        .then((me) => {
          if (cancelled) return
          setUser(me)
          setLoading(false)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          // 401 은 위 핸들러가 이미 토큰을 지웠다. 그 밖의 실패는 토큰을 지우지 않는다(#250)
          if ((e instanceof ApiError && e.status === 401) || attempt >= ME_RETRY_LIMIT) {
            setLoading(false)
            return
          }
          timer = setTimeout(() => load(attempt + 1), ME_RETRY_DELAY_MS)
        })
    }
    load(1)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  async function login(email: string, password: string): Promise<void> {
    const res = await api.post<AuthResponse>('/api/auth/login', { email, password })
    setToken(res.token)
    setUser(res.user)
  }

  function logout(): void {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
