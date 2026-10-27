import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import BackLink from '../components/BackLink'
import ConfirmModal from '../components/ConfirmModal'
import PageShell from '../components/PageShell'
import TextInput from '../components/TextInput'
import { actionButtonClass } from '../components/actionButton'
import { primaryButtonClass } from '../components/primaryButton'
import { errorMessage } from '../lib/api'
import { createAdminUser, deleteAdminUser, listAdminUsers, resetUserPassword } from '../lib/endpoints'
import { MAX_NAME_CHARS } from '../lib/limits'
import type { AdminUser } from '../lib/types'

// 사용자 관리(FEAT-AUTH-001 발급 · FEAT-ADMIN-003 초기화 · FEAT-ADMIN-004 삭제). 문서 관리에서 나뉘었다(#513).
// 폴링이 없다 - 사용자 목록은 첫 로드와 변경(발급 · 삭제) 뒤에만 다시 읽는다(#330)
export default function AdminUsersPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  // 목록 오류는 따로 둔다 - 다시 읽기 성공이 걷어야 하는데, 공유 error 를 지우면 발급 · 초기화 · 삭제 오류까지 사라진다(#324)
  const [listError, setListError] = useState<string | null>(null)
  // 첫 로드가 **성공**했는지(#483) - 못 불러온 것을 「0명」으로 보이지 않는다
  const [loaded, setLoaded] = useState(false)
  // 목록 요청 세대(문서 화면의 listGen 과 같은 패턴). 첫 로드가 늦게 와 발급 · 삭제 뒤 재조회 결과를 덮으면
  // 방금 만든 계정이 안 보이거나 지운 사람이 되살아나 보인다 - 나중에 나간 요청의 응답만 쓴다
  const listGen = useRef(0)

  const isAdmin = user?.role === 'admin'

  const refresh = useCallback(async () => {
    const mine = ++listGen.current
    try {
      const people = await listAdminUsers()
      if (listGen.current !== mine) return
      setUsers(people)
      setListError(null)
      setLoaded(true)
    } catch (e) {
      if (listGen.current !== mine) return
      setListError(errorMessage(e, '목록을 불러오지 못했습니다'))
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void refresh()
  }, [isAdmin, refresh])

  // 프론트 가드는 편의다. 유일한 방어선은 서버의 404 이며, 여기서는 없는 화면을 보여주지 않을 뿐이다
  if (user && !isAdmin) return <Navigate to="/" replace />

  return (
    <PageShell maxWidth="max-w-3xl">
      <BackLink to="/me">마이페이지</BackLink>

      <h1 className="mt-6 text-xl font-semibold text-ink">사용자 관리</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        스스로 가입하는 경로가 없어 계정은 여기서만 만들어집니다.
      </p>

      {[listError, error].map(
        (m, i) =>
          m && (
            <p key={i} role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {m}
              {/* 첫 로드 실패는 스스로 회복하지 않는다 - 새로고침 대신 다시 부를 길을 둔다(#483) */}
              {i === 0 && !loaded && (
                <button type="button" onClick={() => void refresh()} className="ml-2 font-medium underline">
                  다시 시도
                </button>
              )}
            </p>
          ),
      )}

      <UsersSection users={users} loaded={loaded} currentUserId={user?.id} refresh={refresh} setError={setError} />
    </PageShell>
  )
}

function UsersSection({
  users,
  loaded,
  currentUserId,
  refresh,
  setError,
}: {
  users: AdminUser[]
  loaded: boolean
  currentUserId: string | undefined
  refresh: () => Promise<void>
  setError: (message: string | null) => void
}) {
  // 초기화는 기존 로그인을 전부 끊고 되돌릴 수 없어 삭제처럼 확인을 거친다(#325)
  const [pendingReset, setPendingReset] = useState<AdminUser | null>(null)
  // 요청 중에는 초기화 버튼을 모두 막는다 - 연타 · 동시 요청이면 늦게 온 응답이 발급 창을 덮어써
  // 이미 무효가 된 비밀번호나 다른 사람의 값만 남는다
  const [resettingId, setResettingId] = useState<string | null>(null)
  // 삭제도 같은 모양이다 - 대화 · 첨부까지 지워 되돌릴 수 없고, 연타면 두 번째가 404 로 오류 배너만 남긴다
  const [pendingDelete, setPendingDelete] = useState<AdminUser | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // kind 로 갈리는 것은 안내 문구뿐이다 — 발급은 "새 계정"이고 초기화는 "기존 세션이 끊긴다"
  const issuedTitleId = useId()
  const [issued, setIssued] = useState<{
    kind: 'created' | 'reset'
    name: string
    password: string
  } | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  // 일회용 비밀번호 창은 Esc 와 「닫기」로만 닫는다(#253). 배경 클릭으로 닫히면 「지금만 볼 수 있는」 값이
  // 한 번의 헛클릭에 사라져 비밀번호를 다시 초기화해야 한다 - 그래서 이 창만 배경 닫기를 두지 않는다
  useEffect(() => {
    if (!issued) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIssued(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [issued])

  async function confirmReset() {
    const target = pendingReset
    setPendingReset(null)
    if (!target || resettingId) return
    setError(null)
    setResettingId(target.id)
    try {
      const res = await resetUserPassword(target.id)
      setIssued({ kind: 'reset', name: target.name, password: res.temporaryPassword })
    } catch (e) {
      setError(errorMessage(e, '초기화하지 못했습니다'))
    } finally {
      setResettingId(null)
    }
  }

  // 409(문서를 올린 기록) · 400(관리자) 은 서버 메시지가 이유를 말하므로 그대로 배너에 보인다.
  // 실패해도 목록은 다시 읽는다 - 다른 관리자가 먼저 지운 404 면 화면에만 남은 행을 걷어야 한다(refresh 는 던지지 않는다)
  async function confirmDelete() {
    const target = pendingDelete
    setPendingDelete(null)
    if (!target || deletingId) return
    setError(null)
    setDeletingId(target.id)
    try {
      await deleteAdminUser(target.id)
    } catch (e) {
      setError(errorMessage(e, '삭제하지 못했습니다'))
    }
    await refresh()
    setDeletingId(null)
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const res = await createAdminUser(newEmail, newName)
      setIssued({ kind: 'created', name: newName, password: res.temporaryPassword })
      setNewEmail('')
      setNewName('')
      await refresh()
    } catch (e) {
      setError(errorMessage(e, '계정을 만들지 못했습니다'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <section className="mt-6">
        {/* 못 불러온 것을 「0명」으로 보이지 않는다(#483) */}
        <h2 className="text-sm font-medium text-ink-muted">사용자{loaded && ` ${users.length}명`}</h2>
        {/* 스스로 가입하는 경로가 없으므로 계정은 여기서만 태어난다 */}
        <form onSubmit={onCreate} className="mt-3 rounded-2xl bg-surface px-4 py-3 md:flex md:items-end md:gap-3">
          <label className="block flex-1">
            <span className="text-xs text-ink-muted">이메일</span>
            <TextInput
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="mt-3 block flex-1 md:mt-0">
            <span className="text-xs text-ink-muted">이름</span>
            <TextInput
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={MAX_NAME_CHARS}
              required
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            disabled={creating}
            className={primaryButtonClass + ' mt-3 md:mt-0'}
          >
            {creating ? '발급 중…' : '계정 추가'}
          </button>
        </form>
        <ul className="mt-3 space-y-2">
          {users.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 md:gap-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {person.name}
                  <span className="ml-2 text-xs text-ink-muted">
                    {person.role === 'admin' ? '관리자' : '사용자'}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{person.email}</p>
              </div>
              {/* 자기 자신은 대상이 아니다 — 마이페이지에 변경 기능이 있고, 자기 세션을 스스로 끊을 이유가 없다 */}
              {person.id !== currentUserId && (
                <button
                  onClick={() => setPendingReset(person)}
                  disabled={resettingId !== null}
                  aria-label={`${person.name} 비밀번호 초기화`}
                  className={actionButtonClass + ' hover:text-ink'}
                >
                  비밀번호 초기화
                </button>
              )}
              {/* 관리자(자기 자신 포함)는 지우지 않는다 — ADMIN_EMAILS 명단에 남으면 기동 동기화가 다시 만든다(서버도 400) */}
              {person.role !== 'admin' && (
                // 이름은 보이는 글자를 포함해야 한다(WCAG 2.5.3) - 진행 중 글자가 바뀌면 이름도 같이 바꾼다
                <button
                  onClick={() => setPendingDelete(person)}
                  disabled={deletingId !== null}
                  aria-label={`${person.name} ${deletingId === person.id ? '삭제 중' : '삭제'}`}
                  className={actionButtonClass + ' hover:text-danger'}
                >
                  {deletingId === person.id ? '삭제 중…' : '삭제'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {pendingReset && (
        <ConfirmModal
          title={`${pendingReset.name} 님의 비밀번호를 초기화할까요?`}
          message="새 임시 비밀번호를 발급합니다. 기존 로그인이 모두 해제됩니다."
          confirmLabel="초기화"
          onConfirm={() => void confirmReset()}
          onCancel={() => setPendingReset(null)}
        />
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`${pendingDelete.name} 님을 삭제할까요?`}
          message="이 사용자의 대화와 첨부가 함께 지워지며 되돌릴 수 없습니다."
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {issued && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby={issuedTitleId}>
          <div className="relative w-full max-w-sm rounded-[1.75rem] bg-surface p-1.5 shadow-[var(--shadow-lifted)]">
            <div className="rounded-[1.375rem] bg-raised p-6">
              <h2 id={issuedTitleId} className="text-base font-semibold text-ink">
                {issued.kind === 'created' ? '계정이 발급되었습니다' : '임시 비밀번호가 발급되었습니다'}
              </h2>
              <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-center font-mono text-base text-ink">
                {issued.password}
              </p>
              {/* 두 문장 모두 필요하다 : 다시 못 본다는 사실과, 이 발급이 상대에게 무엇을 뜻하는지 */}
              <p className="mt-4 text-sm leading-relaxed text-ink-muted">
                이 값은 지금만 볼 수 있습니다. 닫으면 다시 확인할 수 없습니다.
                <br />
                {issued.kind === 'created'
                  ? `${issued.name} 님에게 이메일과 함께 전달하세요.`
                  : `${issued.name} 님의 기존 로그인은 모두 해제되었습니다.`}
              </p>
              <div className="mt-6 flex justify-end">
                <button
                  autoFocus
                  onClick={() => setIssued(null)}
                  className={primaryButtonClass}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
