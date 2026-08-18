import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return <div className="grid h-full place-items-center text-sm text-ink-muted">불러오는 중…</div>
  }
  if (!user) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
