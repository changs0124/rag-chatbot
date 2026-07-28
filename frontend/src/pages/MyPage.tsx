import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useTheme } from '../theme/ThemeContext'
import { ApiError, setToken } from '../lib/api'
import { updateName, updatePassword, updateTheme } from '../lib/endpoints'
import type { Theme } from '../lib/types'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
  { value: 'system', label: '시스템' },
]

export default function MyPage() {
  const { user, setUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const [name, setName] = useState(user?.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function flash(msg: string) {
    setError(null)
    setNotice(msg)
  }
  function fail(e: unknown) {
    setNotice(null)
    setError(e instanceof ApiError ? e.message : '요청 중 오류가 발생했습니다')
  }

  async function saveName() {
    try {
      const me = await updateName(name)
      setUser(me)
      flash('이름을 변경했습니다')
    } catch (e) {
      fail(e)
    }
  }

  async function savePassword() {
    try {
      // 서버가 변경 시각 이전 토큰을 전부 무효화함 - 새 토큰으로 갈아 끼우지 않으면
      // "변경했습니다"를 띄운 직후부터 모든 요청이 401 이 됨
      const res = await updatePassword(currentPassword, newPassword)
      setToken(res.token)
      setUser(res.user)
      setCurrentPassword('')
      setNewPassword('')
      flash('비밀번호를 변경했습니다')
    } catch (e) {
      fail(e)
    }
  }

  async function chooseTheme(next: Theme) {
    setTheme(next)
    try {
      const me = await updateTheme(next)
      setUser(me)
      flash('테마를 변경했습니다')
    } catch (e) {
      fail(e)
    }
  }

  return (
    <div className="mx-auto h-full max-w-lg overflow-y-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">마이페이지</h1>
        <Link to="/" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          ← 채팅으로
        </Link>
      </div>

      {notice && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">{notice}</p>}
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">{error}</p>}

      <Section title="계정">
        <p className="text-sm text-zinc-500">{user?.email}</p>
      </Section>

      <Section title="이름 변경">
        <div className="flex gap-2">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          <button onClick={saveName} disabled={!name.trim()} className={btnClass}>
            저장
          </button>
        </div>
      </Section>

      <Section title="비밀번호 변경">
        <div className="space-y-2">
          <input
            type="password"
            className={inputClass}
            placeholder="현재 비밀번호"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <input
            type="password"
            className={inputClass}
            placeholder="새 비밀번호 (8자 이상)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
          />
          <button
            onClick={savePassword}
            disabled={!currentPassword || newPassword.length < 8}
            className={btnClass}
          >
            비밀번호 변경
          </button>
        </div>
      </Section>

      <Section title="테마">
        <div className="flex gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              onClick={() => chooseTheme(t.value)}
              className={
                'flex-1 rounded-lg border px-3 py-2 text-sm ' +
                (theme === t.value
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900'
                  : 'border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
const btnClass =
  'shrink-0 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">{title}</h2>
      {children}
    </section>
  )
}
