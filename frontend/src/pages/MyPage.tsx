import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import TextInput from '../components/TextInput'
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

  /**
   * 테마는 낙관적으로 먼저 적용한다 - 왕복을 기다리면 클릭이 굼떠 보인다.
   *
   * **실패하면 되돌린다**(#78). 종전에는 되돌리지 않아 화면은 새 테마인데 서버는 옛 값이었고,
   * `ThemeContext` 가 localStorage 에도 이미 저장해 둔 상태였다. 다시 로그인하면 `applyUser` 가
   * 서버 값을 적용해 되돌아가므로, **어느 쪽이 진짜인지 알 수 없는** 상태가 그때까지 이어졌다.
   */
  async function chooseTheme(next: Theme) {
    const previous = theme
    setTheme(next)
    try {
      const me = await updateTheme(next)
      setUser(me)
      flash('테마를 변경했습니다')
    } catch (e) {
      setTheme(previous)
      fail(e)
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <Link
          to="/"
          className="text-sm text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink"
        >
          ← 채팅으로
        </Link>

        <h1 className="mt-4 mb-1 text-2xl font-semibold text-ink">설정</h1>
        <p className="mb-6 text-sm text-ink-muted">{user?.email}</p>

        {notice && (
          <p className="mb-4 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent">{notice}</p>
        )}
        {error && (
          <p className="mb-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
        )}

        <div className="space-y-4">
          <Card title="이름">
            <div className="flex gap-2">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
              <button onClick={saveName} disabled={!name.trim()} className={btnClass}>
                저장
              </button>
            </div>
          </Card>

          <Card title="비밀번호">
            <div className="space-y-2.5">
              <TextInput
                type="password"
                placeholder="현재 비밀번호"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
              <TextInput
                type="password"
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
          </Card>

          <Card title="테마">
            {/* 세그먼트 컨트롤 - 선택된 칸만 떠 보이게 함 */}
            <div className="flex gap-1 rounded-xl bg-surface p-1">
              {THEMES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => chooseTheme(t.value)}
                  className={
                    'flex-1 rounded-lg px-3 py-2 text-sm transition duration-150 ease-[var(--ease-out-quint)] ' +
                    (theme === t.value
                      ? 'bg-raised font-medium text-ink shadow-[var(--shadow-ambient)]'
                      : 'text-ink-muted hover:text-ink')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </Card>

          {/* 관리자에게만 렌더한다 — 눌러서 404 를 만나는 것보다 없는 편이 낫다.
              이 판단은 노출용이고, 실제 차단은 서버가 404 로 한다 */}
          {user?.role === 'admin' && (
            <Card title="관리">
              <Link
                to="/admin"
                className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-3 text-sm text-ink transition duration-150 ease-[var(--ease-out-quint)] hover:bg-canvas"
              >
                <span>📄 문서 관리</span>
                <span className="text-ink-muted">→</span>
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

const btnClass =
  'h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-medium text-accent-ink transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:opacity-40'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-raised p-5 shadow-[var(--shadow-ambient)]">
      <h2 className="mb-3 text-sm font-medium text-ink">{title}</h2>
      {children}
    </section>
  )
}
