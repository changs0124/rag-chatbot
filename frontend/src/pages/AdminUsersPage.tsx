import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useModalFocus } from '../hooks/useModalFocus'
import AdminErrorBanners from '../components/AdminErrorBanners'
import BackLink from '../components/BackLink'
import AdminListSkeleton from '../components/AdminListSkeleton'
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
      <BackLink to="/me">설정</BackLink>

      <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink md:text-2xl">사용자 관리</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        스스로 가입하는 경로가 없어 계정은 여기서만 만들어집니다.
      </p>

      <AdminErrorBanners listError={listError} error={error} loaded={loaded} onRetry={() => void refresh()} />

      <UsersSection users={users} loaded={loaded} loading={!loaded && !listError} currentUserId={user?.id} refresh={refresh} setError={setError} />
    </PageShell>
  )
}

function UsersSection({
  users,
  loaded,
  loading,
  currentUserId,
  refresh,
  setError,
}: {
  users: AdminUser[]
  loaded: boolean
  loading: boolean
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
  const [issued, setIssued] = useState<{
    kind: 'created' | 'reset'
    name: string
    password: string
  } | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // 발급 창을 닫으면 포커스를 돌려줄 버튼(#644) - 요청 중에는 막혀 있어 연 요소로 돌아갈 수 없다
  const issuedReturnRef = useRef<HTMLElement | null>(null)
  // 확인 창이 닫힐 때 연 버튼이 막혔거나(요청 중) 행째 사라지면(삭제) 포커스가 body 로 빠진다(#656) - 목록 머리로 돌려준다
  const listHeadingRef = useRef<HTMLHeadingElement>(null)
  // 초기화가 실패하면 발급 창이 뜨지 않아 포커스를 받아 줄 곳이 없다 - 요청이 끝나 버튼이 다시 풀린 뒤 그 버튼으로 돌린다(#656)
  const refocusResetRef = useRef(false)
  useEffect(() => {
    if (resettingId !== null || !refocusResetRef.current) return
    refocusResetRef.current = false
    issuedReturnRef.current?.focus()
  }, [resettingId])

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
      refocusResetRef.current = true
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

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    issuedReturnRef.current = e.currentTarget.querySelector('button[type="submit"]')
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
        <h2 ref={listHeadingRef} tabIndex={-1} className="text-base font-semibold text-ink">사용자{loaded && ` ${users.length}명`}</h2>
        {/* 스스로 가입하는 경로가 없으므로 계정은 여기서만 태어난다 */}
        {/* 흰 카드 위에 둔다(#646) - 입력칸 테두리 line-strong 은 surface 위에서 2.95:1 로 3:1 에 못 미친다 */}
        <form onSubmit={onCreate} className="mt-3 rounded-xl border border-line bg-raised p-4 shadow-[var(--shadow-card)] md:flex md:items-end md:gap-3">
          <label className="block flex-1">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">이메일</span>
            <TextInput
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label className="mt-3 block flex-1 md:mt-0">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-muted">이름</span>
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
            className={primaryButtonClass + ' mt-4 w-full md:mt-0 md:w-auto'}
          >
            {creating ? '발급 중…' : '계정 추가'}
          </button>
        </form>
        {loading ? (
          <AdminListSkeleton rows={3} />
        ) : loaded ? (
        // 한 장의 카드 + 행 구분선(#646). 행 머리에 이름 첫 글자 아바타, 역할은 배지.
        // 첫 로드가 실패하면(loaded 아님) 그리지 않는다 - 빈 목록에도 테두리 · 그림자가 붙어 배너 아래 빈 상자로 남았다(#657)
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised shadow-[var(--shadow-card)]">
          {users.map((person) => (
            <li
              key={person.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5 md:flex-nowrap md:gap-4"
            >
              <span
                aria-hidden="true"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-sm font-semibold text-ink-muted"
              >
                {person.name.trim().charAt(0) || '?'}
              </span>
              <div className="min-w-0 flex-1">
                {/* 이름만 잘리고 역할 배지는 남는다(#646) - 한 줄 truncate 안에 두면 긴 이름이 배지까지 밀어냈다 */}
                <p className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{person.name}</span>
                  <span
                    className={
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ' +
                      (person.role === 'admin' ? 'bg-accent-soft text-accent' : 'bg-highlight text-highlight-ink')
                    }
                  >
                    {person.role === 'admin' ? '관리자' : '사용자'}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-muted">{person.email}</p>
              </div>
              {/* 모바일은 동작 버튼을 아래 줄로 내린다 - 390px 한 줄에 이름 · 메일 · 버튼 둘이 들어가지 않는다 */}
              <div className="flex w-full shrink-0 justify-end gap-2 md:w-auto">
              {/* 자기 자신은 대상이 아니다 — 마이페이지에 변경 기능이 있고, 자기 세션을 스스로 끊을 이유가 없다 */}
              {person.id !== currentUserId && (
                <button
                  onClick={(e) => {
                    issuedReturnRef.current = e.currentTarget
                    setPendingReset(person)
                  }}
                  disabled={resettingId !== null}
                  aria-label={`${person.name} 비밀번호 초기화`}
                  className={actionButtonClass}
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
                  className={actionButtonClass + ' hover:border-danger/40 hover:text-danger'}
                >
                  {deletingId === person.id ? '삭제 중…' : '삭제'}
                </button>
              )}
              </div>
            </li>
          ))}
        </ul>
        ) : null}
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
          returnTo={() => listHeadingRef.current}
        />
      )}

      {issued && (
        <IssuedDialog issued={issued} onClose={() => setIssued(null)} returnTo={() => issuedReturnRef.current} />
      )}
    </>
  )
}

// 일회용 비밀번호 창. 뜰 때 · 닫힐 때의 포커스는 useModalFocus 가 맡는다(#644) - 요청 중 연 버튼이 막혀 포커스를 잃으므로
// 닫으면 발급을 시작한 버튼(초기화 · 계정 추가)으로 돌아간다
function IssuedDialog({
  issued,
  onClose,
  returnTo,
}: {
  issued: { kind: 'created' | 'reset'; name: string; password: string }
  onClose: () => void
  returnTo: () => HTMLElement | null
}) {
  const titleId = useId()
  const dialogRef = useModalFocus<HTMLDivElement>(returnTo)
  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      {/* ConfirmModal 과 같은 한 겹 카드(#646) */}
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-raised shadow-[var(--shadow-lifted)]">
        <div className="p-6">
          <h2 id={titleId} className="text-base font-semibold text-ink">
            {issued.kind === 'created' ? '계정이 발급되었습니다' : '임시 비밀번호가 발급되었습니다'}
          </h2>
          <p className="mt-4 rounded-lg border border-line bg-surface px-4 py-3 text-center font-mono text-base break-all text-ink">
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
              data-autofocus
              onClick={onClose}
              className={primaryButtonClass}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
