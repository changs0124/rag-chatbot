import { useId, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import BackLink from '../components/BackLink'
import PageShell from '../components/PageShell'
import TextInput from '../components/TextInput'
import { IconChevronRight, IconFile, IconUser } from '../components/icons'
import { primaryButtonClass } from '../components/primaryButton'
import { errorMessage, setToken } from '../lib/api'
import { updateName, updatePassword } from '../lib/endpoints'
import { MAX_NAME_CHARS } from '../lib/limits'

export default function MyPage() {
  const { user, setUser } = useAuth()
  const newPasswordHintId = useId()
  const [name, setName] = useState(user?.name ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  // 변경 요청이 도는 동안 버튼을 막는다(#359) - 연타한 두 번째 요청은 바뀐 비밀번호로 401 이 되어,
  // 이미 성공한 변경 위에 오류 문구를 덮는다
  const [savingPassword, setSavingPassword] = useState(false)
  // 이름도 같은 이유로 막는다(#645) - 진행 표시 없이 두 번 누르면 같은 요청이 두 번 간다
  const [savingName, setSavingName] = useState(false)
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

  const canSaveName = !savingName && !!name.trim()
  const canSavePassword = !savingPassword && !!currentPassword && newPassword.length >= 8

  // 폼 제출이라 Enter 로도 온다(#645) - 버튼이 막힌 상태의 Enter 는 브라우저가 걸러 주지만 여기서도 한 번 더 막는다
  async function saveName(e: FormEvent) {
    e.preventDefault()
    if (!canSaveName) return
    setSavingName(true)
    try {
      const me = await updateName(name)
      setUser(me)
      flash('이름을 변경했습니다')
    } catch (e) {
      fail(e)
    } finally {
      setSavingName(false)
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault()
    if (!canSavePassword) return
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

      <h1 className="mt-4 mb-1 text-xl font-semibold tracking-tight text-ink md:text-2xl">설정</h1>
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
          <form onSubmit={saveName} className="flex gap-2">
            <TextInput
              aria-label="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME_CHARS}
            />
            <button type="submit" disabled={!canSaveName} className={primaryButtonClass}>
              {savingName ? '저장 중…' : '저장'}
            </button>
          </form>
        </Card>

        <Card title="비밀번호">
          {/* 라벨 · 규칙 안내를 입력칸 밖에 둔다(#645) - placeholder 뿐이면 입력하는 순간 무엇을 넣는 칸인지와 「8자 이상」이 사라진다 */}
          <form onSubmit={savePassword} className="space-y-3">
            <Field label="현재 비밀번호">
              <TextInput
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
            <Field label="새 비밀번호">
              <TextInput
                type="password"
                aria-describedby={newPasswordHintId}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            <p id={newPasswordHintId} className="-mt-1.5 text-[13px] text-ink-muted">
              8자 이상
            </p>
            <button type="submit" disabled={!canSavePassword} className={primaryButtonClass}>
              비밀번호 변경
            </button>
          </form>
        </Card>

        {/* 관리자에게만 렌더한다 — 눌러서 404 를 만나는 것보다 없는 편이 낫다(접근 제어는 Me.role 주석) */}
        {user?.role === 'admin' && (
          <Card title="관리">
            <div className="space-y-2">
              <Link
                to="/admin/documents"
                className="flex min-h-11 items-center justify-between rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface"
              >
                <span className="inline-flex items-center gap-2">
                  <IconFile className="h-4 w-4 text-ink-muted" />
                  문서 관리
                </span>
                <IconChevronRight className="h-4 w-4 text-ink-muted" />
              </Link>
              <Link
                to="/admin/users"
                className="flex min-h-11 items-center justify-between rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface"
              >
                <span className="inline-flex items-center gap-2">
                  <IconUser className="h-4 w-4 text-ink-muted" />
                  사용자 관리
                </span>
                <IconChevronRight className="h-4 w-4 text-ink-muted" />
              </Link>
            </div>
          </Card>
        )}
      </div>
    </PageShell>
  )
}

/** LoginPage 의 Field 와 같은 모양 - 보이는 라벨이 입력칸의 접근 가능한 이름이 된다 */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    // 카드는 1px 경계 + 한 겹 그림자(#646) - 관리 화면 목록과 같은 모양
    <section className="rounded-xl border border-line bg-raised p-5 shadow-[var(--shadow-card)]">
      <h2 className="mb-3 text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  )
}
