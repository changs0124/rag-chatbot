import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import BackLink from '../components/BackLink'
import PageShell from '../components/PageShell'
import TextInput from '../components/TextInput'
import { IconChevronRight, IconFile } from '../components/icons'
import { primaryButtonClass } from '../components/primaryButton'
import { errorMessage, setToken } from '../lib/api'
import { updateName, updatePassword } from '../lib/endpoints'
import { MAX_NAME_CHARS } from '../lib/limits'

export default function MyPage() {
  const { user, setUser } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  // 변경 요청이 도는 동안 버튼을 막는다(#359) - 연타한 두 번째 요청은 바뀐 비밀번호로 401 이 되어,
  // 이미 성공한 변경 위에 오류 문구를 덮는다
  const [savingPassword, setSavingPassword] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function flash(msg: string) {
    setError(null)
    setNotice(msg)
  }
  function fail(e: unknown) {
    setNotice(null)
    setError(errorMessage(e, '요청 중 오류가 발생했습니다'))
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
    setSavingPassword(true)
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
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <PageShell maxWidth="max-w-2xl">
      <BackLink to="/">채팅으로</BackLink>

      <h1 className="mt-4 mb-1 text-2xl font-semibold text-ink">설정</h1>
      <p className="mb-6 text-sm text-ink-muted">{user?.email}</p>

      {/* status 는 늘 있는 그릇에 글만 바꿔 넣어야 낭독된다(#484) */}
      <div role="status">
        {notice && (
          <p className="mb-4 rounded-xl bg-accent-soft px-3.5 py-2.5 text-sm text-accent">{notice}</p>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">{error}</p>
      )}

      <div className="space-y-4">
        <Card title="이름">
          <div className="flex gap-2">
            <TextInput
              aria-label="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_CHARS}
            />
            <button onClick={saveName} disabled={!name.trim()} className={primaryButtonClass}>
              저장
            </button>
          </div>
        </Card>

        <Card title="비밀번호">
          <div className="space-y-2.5">
            <TextInput
              type="password"
              aria-label="현재 비밀번호"
              placeholder="현재 비밀번호"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <TextInput
              type="password"
              aria-label="새 비밀번호 (8자 이상)"
              placeholder="새 비밀번호 (8자 이상)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              onClick={savePassword}
              disabled={savingPassword || !currentPassword || newPassword.length < 8}
              className={primaryButtonClass}
            >
              비밀번호 변경
            </button>
          </div>
        </Card>

        {/* 관리자에게만 렌더한다 — 눌러서 404 를 만나는 것보다 없는 편이 낫다(접근 제어는 Me.role 주석) */}
        {user?.role === 'admin' && (
          <Card title="관리">
            <Link
              to="/admin"
              className="flex items-center justify-between rounded-xl bg-surface px-3.5 py-3 text-sm text-ink transition duration-150 ease-[var(--ease-out-quint)] hover:bg-canvas"
            >
              <span className="inline-flex items-center gap-2">
                <IconFile className="h-4 w-4 text-ink-muted" />
                문서 관리
              </span>
              <IconChevronRight className="h-4 w-4 text-ink-muted" />
            </Link>
          </Card>
        )}
      </div>
    </PageShell>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-raised p-5 shadow-[var(--shadow-ambient)]">
      <h2 className="mb-3 text-sm font-medium text-ink">{title}</h2>
      {children}
    </section>
  )
}
