import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import BackLink from '../components/BackLink'
import ConfirmModal from '../components/ConfirmModal'
import PageShell from '../components/PageShell'
import TextInput from '../components/TextInput'
import { IconAlert, IconCheck, IconClock } from '../components/icons'
import { primaryButtonClass } from '../components/primaryButton'
import { errorMessage } from '../lib/api'
import {
  createAdminUser,
  deleteDocument,
  listAdminUsers,
  listDocuments,
  resetUserPassword,
  syncDocuments,
  uploadDocument,
} from '../lib/endpoints'
import { MAX_NAME_CHARS } from '../lib/limits'
import type { AdminUser, RagDocument } from '../lib/types'

/** 인덱싱 중인 문서가 있을 때만 도는 폴링 간격. 완료를 알려줄 푸시 경로가 없어 폴링으로 한다 */
const POLL_MS = 5000

// 상태 표시는 무채색 라인 아이콘(#192). 뜻은 글자가 전하고 아이콘은 보조다(aria-hidden). 색은 아래 STATUS_CLASS 를 그대로 따른다
const STATUS_LABEL: Record<RagDocument['status'], string> = {
  completed: '완료',
  in_progress: '처리중',
  failed: '실패',
}

const STATUS_ICON: Record<RagDocument['status'], typeof IconCheck> = {
  completed: IconCheck,
  in_progress: IconClock,
  failed: IconAlert,
}

const STATUS_CLASS: Record<RagDocument['status'], string> = {
  completed: 'text-accent',
  in_progress: 'text-ink-muted',
  failed: 'text-danger',
}

const ACCEPT = '.pdf,.txt,.md,.docx'

// 행 끝의 작은 동작 버튼(동기화 · 삭제 · 초기화). 모바일만 44px 로 키운다(design-system 「7. 모바일」). hover 글자색만 호출부가 덧붙인다
const actionBtn =
  'min-h-11 shrink-0 rounded-full px-3 py-1.5 text-xs text-ink-muted transition duration-150 ease-[var(--ease-out-quint)] hover:bg-raised disabled:opacity-60 md:min-h-0'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// 공유하는 것만 여기 둔다(#390) - 목록 두 개(한 번에 읽는다) · 오류 배너 · 관리자 가드. 각 구역의 입력 · 진행 · 확인 상태는 구역 안에 있다
export default function AdminPage() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  // 목록 오류는 따로 둔다 - 폴링 성공이 걷어야 하는데, 공유 error 를 지우면 업로드 · 삭제 오류까지 사라진다(#324)
  const [listError, setListError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const isAdmin = user?.role === 'admin'

  const refresh = useCallback(async () => {
    try {
      const [docs, people] = await Promise.all([listDocuments(), listAdminUsers()])
      setDocuments(docs)
      setUsers(people)
      setListError(null)
    } catch (e) {
      setListError(errorMessage(e, '목록을 불러오지 못했습니다'))
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void refresh()
  }, [isAdmin, refresh])

  // 폴링이 지켜보는 것은 인덱싱 상태뿐이다 - 사용자 목록은 첫 로드와 변경 뒤에만 다시 읽는다(#330).
  // 그래서 사용자 목록 로드가 실패한 뒤 문서 폴링이 성공하면 배너는 지워지고 사용자 목록은 옛 값으로 남는다 - 받아들인 대가
  const pollDocuments = useCallback(async () => {
    try {
      setDocuments(await listDocuments())
      setListError(null)
    } catch (e) {
      setListError(errorMessage(e, '목록을 불러오지 못했습니다'))
    }
  }, [])

  // 인덱싱 중인 문서가 하나라도 있을 때만 다시 읽는다. 전부 종료 상태면 멈춘다 —
  // 안 멈추면 화면을 열어둔 내내 배경에서 계속 돈다
  useEffect(() => {
    if (!isAdmin) return
    if (!documents.some((d) => d.status === 'in_progress')) return
    const timer = setInterval(() => void pollDocuments(), POLL_MS)
    return () => clearInterval(timer)
  }, [isAdmin, documents, pollDocuments])

  // 프론트 가드는 편의다. 유일한 방어선은 서버의 404 이며, 여기서는 없는 화면을 보여주지 않을 뿐이다
  if (user && !isAdmin) return <Navigate to="/" replace />

  return (
    <PageShell maxWidth="max-w-3xl">
      <BackLink to="/me">마이페이지</BackLink>

      <h1 className="mt-6 text-xl font-semibold text-ink">문서 관리</h1>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        답변 근거로 쓰이는 사내 문서입니다. 여기 없는 내용은 답변에 출처로 붙지 않습니다.
      </p>

      {[listError, error].map(
        (m, i) =>
          m && (
            <p key={i} role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {m}
            </p>
          ),
      )}

      <DocumentsSection documents={documents} loaded={loaded} refresh={refresh} setError={setError} />

      <UsersSection users={users} currentUserId={user?.id} refresh={refresh} setError={setError} />
    </PageShell>
  )
}

function DocumentsSection({
  documents,
  loaded,
  refresh,
  setError,
}: {
  documents: RagDocument[]
  loaded: boolean
  refresh: () => Promise<void>
  setError: (message: string | null) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RagDocument | null>(null)

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일을 연달아 고를 수 있게 비운다
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await uploadDocument(file)
      await refresh()
    } catch (err) {
      setError(errorMessage(err, '업로드하지 못했습니다'))
    } finally {
      setUploading(false)
    }
  }

  // 목록은 이 서버 DB 만 읽는다 — 다른 DB 를 거쳐 올린 문서는 검색에는 잡혀도 여기 안 보인다(#193)
  async function onSync() {
    setError(null)
    setSyncNotice(null)
    setSyncing(true)
    try {
      const res = await syncDocuments()
      setSyncNotice(
        res.added > 0
          ? `스토어에서 ${res.added}건을 가져왔습니다`
          : `이미 스토어와 맞습니다 (스토어 ${res.total}건)`,
      )
      await refresh()
    } catch (e) {
      setError(errorMessage(e, '스토어와 동기화하지 못했습니다'))
    } finally {
      setSyncing(false)
    }
  }

  async function confirmDelete() {
    const target = pendingDelete
    setPendingDelete(null)
    if (!target) return
    try {
      await deleteDocument(target.id)
      await refresh()
    } catch (e) {
      setError(errorMessage(e, '삭제하지 못했습니다'))
    }
  }

  return (
    <>
      <section className="mt-6">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center transition duration-150 ease-[var(--ease-out-quint)] hover:border-accent">
          <span className="text-sm text-ink">
            {uploading ? '올리는 중…' : '파일을 선택해 올립니다'}
          </span>
          <span className="text-xs text-ink-muted">PDF · TXT · MD · DOCX · 최대 25MB</span>
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            disabled={uploading}
            onChange={onPick}
          />
        </label>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-ink-muted">문서 {documents.length}건</h2>
          <button
            onClick={() => void onSync()}
            disabled={syncing}
            className={actionBtn + ' hover:text-ink'}
          >
            {syncing ? '맞추는 중…' : '스토어와 동기화'}
          </button>
        </div>
        {syncNotice && <p role="status" className="mt-2 text-xs text-ink-muted">{syncNotice}</p>}

        {loaded && documents.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-surface px-6 py-10 text-center">
            <p className="text-sm text-ink">아직 문서가 없습니다</p>
            {/* 0건은 "검색했는데 없다"가 아니라 **아직 시작하지 않은** 상태다. 그 차이를 밝힌다 */}
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              지금은 모든 답변이 &lsquo;자료 없음&rsquo; 으로 표시됩니다.
              <br />
              문서를 올리면 답변에 출처가 붙기 시작합니다.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3 md:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{doc.filename}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    <StatusLabel status={doc.status} />
                    {' · '}
                    {formatSize(doc.byteSize)} · {doc.uploadedByName} · {formatDate(doc.createdAt)}
                  </p>
                  {/* 아이콘만 두면 "올라갔으니 됐다"고 읽는다 — REQ-ADMIN-003 이 막으려는 오독 */}
                  {doc.status === 'failed' && (
                    <p className="mt-1 text-xs text-danger">
                      인덱싱에 실패해 답변 근거로 쓰이지 않습니다
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setPendingDelete(doc)}
                  className={actionBtn + ' hover:text-danger'}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 모달은 fixed 라 골격 안에 두어도 화면 기준으로 뜬다 */}
      {pendingDelete && (
        <ConfirmModal
          title={`'${pendingDelete.filename}' 를 삭제할까요?`}
          // 두 번째 문장이 중요하다 — citations 는 영속화돼 있어 문서를 지워도 옛 답변의 각주는 남는다.
          // 안 알리면 "지웠는데 왜 아직 보이지"라고 읽는다
          message="이 문서는 더 이상 답변 근거로 쓰이지 않습니다. 이미 나간 답변의 출처 표기는 그대로 남습니다."
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  )
}

function UsersSection({
  users,
  currentUserId,
  refresh,
  setError,
}: {
  users: AdminUser[]
  currentUserId: string | undefined
  refresh: () => Promise<void>
  setError: (message: string | null) => void
}) {
  // 초기화는 기존 로그인을 전부 끊고 되돌릴 수 없어 삭제처럼 확인을 거친다(#325)
  const [pendingReset, setPendingReset] = useState<AdminUser | null>(null)
  // 요청 중에는 초기화 버튼을 모두 막는다 - 연타 · 동시 요청이면 늦게 온 응답이 발급 창을 덮어써
  // 이미 무효가 된 비밀번호나 다른 사람의 값만 남는다
  const [resettingId, setResettingId] = useState<string | null>(null)
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
      <section className="mt-10">
        <h2 className="text-sm font-medium text-ink-muted">사용자 {users.length}명</h2>
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
                  className={actionBtn + ' hover:text-ink'}
                >
                  비밀번호 초기화
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

function StatusLabel({ status }: { status: RagDocument['status'] }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={'inline-flex items-center gap-1 align-[-2px] ' + STATUS_CLASS[status]}>
      <Icon className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
    </span>
  )
}
