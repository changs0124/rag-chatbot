import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api'
import { useTheme } from '../theme/ThemeContext'
import type { AuthResponse, Me } from '../lib/types'

interface AuthContextValue {
  user: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  setUser: (user: Me) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const { setTheme } = useTheme()

  function applyUser(next: Me): void {
    setUser(next)
    setTheme(next.theme) // 계정에 저장된 테마 적용
  }

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
    api
      .get<Me>('/api/auth/me')
      .then(applyUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(email: string, password: string): Promise<void> {
    const res = await api.post<AuthResponse>('/api/auth/login', { email, password })
    setToken(res.token)
    applyUser(res.user)
  }

  async function signup(email: string, password: string, name: string): Promise<void> {
    const res = await api.post<AuthResponse>('/api/auth/signup', { email, password, name })
    setToken(res.token)
    applyUser(res.user)
  }

  function logout(): void {
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, setUser }}>
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
