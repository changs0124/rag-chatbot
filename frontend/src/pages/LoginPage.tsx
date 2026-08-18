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
    <div className="min-h-[100dvh] bg-canvas">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-2 md:gap-16 md:px-8">
        {/* 왼쪽은 정체성, 오른쪽은 폼. 모바일에서는 위아래로 쌓임 */}
        <div className="md:pr-4">
          <p className="inline-block rounded-full bg-accent-soft px-3 py-1 text-[11px] font-medium tracking-[0.12em] text-accent uppercase">
            RAG Chatbot
          </p>
          <h1 className="mt-4 text-3xl leading-snug font-semibold text-ink md:text-4xl">
            출처를 밝히는
            <br />
            문서 기반 답변
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-muted">
            답변마다 근거가 된 자료를 함께 보여줍니다. 찾은 자료가 없으면 없다고 먼저 밝힌 뒤
            추론으로 답합니다.
          </p>
        </div>

        <div className="rounded-[1.75rem] bg-surface p-1.5 shadow-[var(--shadow-ambient)]">
          <div className="rounded-[1.375rem] bg-raised p-6 md:p-8">
            <h2 className="text-lg font-semibold text-ink">{isSignup ? '회원가입' : '로그인'}</h2>
            <p className="mt-1 mb-6 text-sm text-ink-muted">
              {isSignup ? '계정을 만들어 시작하세요' : '계속하려면 로그인하세요'}
            </p>

            <form onSubmit={onSubmit} className="space-y-3.5">
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

              {/* 자리를 미리 비워 둠 - 오류가 뜰 때 폼 전체가 밀려 내려가면 눌린 버튼 위치가 어긋남 */}
              <p className="min-h-5 text-[13px] leading-5 text-danger">{error}</p>

              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-full bg-accent text-[15px] font-medium text-accent-ink transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.01] active:scale-[0.99] disabled:scale-100 disabled:opacity-50"
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
              className="mt-4 w-full text-center text-sm text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink"
            >
              {isSignup ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  )
}
