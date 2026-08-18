import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import TextInput from '../components/TextInput'
import { ApiError } from '../lib/api'

export default function LoginPage() {
  const { login, signup } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isSignup) {
        await signup(email, password, name)
      } else {
        await login(email, password)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청 중 오류가 발생했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid h-full place-items-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="mb-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">RAG 챗봇</h1>
        <p className="mb-6 text-sm text-zinc-500">{isSignup ? '계정을 만들어 시작하세요' : '로그인하여 계속하세요'}</p>

        <form onSubmit={onSubmit} className="space-y-3">
          {isSignup && (
            <Field label="이름">
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </Field>
          )}
          <Field label="이메일">
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </Field>
          <Field label="비밀번호">
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isSignup ? 8 : undefined}
              autoComplete={isSignup ? 'new-password' : 'current-password'}
            />
          </Field>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {busy ? '처리 중…' : isSignup ? '회원가입' : '로그인'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(isSignup ? 'login' : 'signup')
            setError(null)
          }}
          className="mt-4 w-full text-center text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          {isSignup ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  )
}
