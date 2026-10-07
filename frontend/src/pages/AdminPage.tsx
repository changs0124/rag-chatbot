import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import ConfirmModal from '../components/ConfirmModal'
import TextInput from '../components/TextInput'
import { IconAlert, IconCheck, IconChevronLeft, IconClock } from '../components/icons'
import { ApiError } from '../lib/api'
import {
  createAdminUser,
  deleteDocument,
  listAdminUsers,
  listDocuments,
  resetUserPassword,
  syncDocuments,
  uploadDocument,
} from '../lib/endpoints'
import type { AdminUser, RagDocument } from '../lib/types'

/** 인덱싱 중인 문서가 있을 때만 도는 폴링 간격. 완료를 알려줄 푸시 경로가 없어 폴링으로 한다 */
const POLL_MS = 5000

// 기호(● ◐ ⚠)는 글꼴·OS 마다 모양이 달라 ⚠ 는 컬러 이모지로도 뜬다 - 무채색 라인 아이콘으로 바꿨다(#192).
// 뜻은 글자가 전하고 아이콘은 보조다(aria-hidden). 색은 아래 STATUS_CLASS 를 그대로 따른다
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function AdminPage() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [uploading, setUploading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncNotice, setSyncNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RagDocument | null>(null)
  // kind 로 갈리는 것은 안내 문구뿐이다 — 발급은 "새 계정"이고 초기화는 "기존 세션이 끊긴다"
  const [issued, setIssued] = useState<{
    kind: 'created' | 'reset'
    name: string
    password: string
  } | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const isAdmin = user?.role === 'admin'

  const refresh = useCallback(async () => {
    try {
      const [docs, people] = await Promise.all([listDocuments(), listAdminUsers()])
      setDocuments(docs)
      setUsers(people)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (isAdmin) void refresh()
  }, [isAdmin, refresh])

  // 인덱싱 중인 문서가 하나라도 있을 때만 다시 읽는다. 전부 종료 상태면 멈춘다 —
  // 안 멈추면 화면을 열어둔 내내 배경에서 계속 돈다
  useEffect(() => {
    if (!isAdmin) return
    if (!documents.some((d) => d.status === 'in_progress')) return
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [isAdmin, documents, refresh])

  // 프론트 가드는 편의다. 유일한 방어선은 서버의 404 이며, 여기서는 없는 화면을 보여주지 않을 뿐이다
  if (user && !isAdmin) return <Navigate to="/" replace />

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
      setError(err instanceof ApiError ? err.message : '업로드하지 못했습니다')
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
      setError(e instanceof ApiError ? e.message : '스토어와 동기화하지 못했습니다')
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
      setError(e instanceof ApiError ? e.message : '삭제하지 못했습니다')
    }
  }

  async function onReset(target: AdminUser) {
    setError(null)
    try {
      const res = await resetUserPassword(target.id)
      setIssued({ kind: 'reset', name: target.name, password: res.temporaryPassword })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '초기화하지 못했습니다')
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
      setError(e instanceof ApiError ? e.message : '계정을 만들지 못했습니다')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-[100dvh] overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-3xl px-4 pt-2 pb-8 md:px-6 md:pt-8">
        <Link
          to="/me"
          className="-ml-2 inline-flex h-11 items-center gap-1 rounded-xl px-2 text-sm text-ink-muted transition-colors duration-150 ease-[var(--ease-out-quint)] hover:text-ink md:ml-0 md:h-auto md:rounded-none md:px-0"
        >
          <IconChevronLeft className="h-4 w-4" />
          마이페이지
        </Link>

        <h1 className="mt-6 text-xl font-semibold text-ink">문서 관리</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-muted">
          답변 근거로 쓰이는 사내 문서입니다. 여기 없는 내용은 답변에 출처로 붙지 않습니다.
        </p>

        {error && (
          <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>
        )}

        <section className="mt-6">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-6 py-8 text-center transition duration-150 ease-[var(--ease-out-quint)] hover:border-accent">
            <span className="text-sm text-ink">
              {uploading ? '올리는 중…' : '파일을 선택해 올립니다'}
            </span>
            <span className="text-xs text-ink-muted">PDF · TXT · MD · DOCX · 최대 25MB</span>
            <input
              ref={fileInput}
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
              className="min-h-11 shrink-0 rounded-full px-3 py-1.5 text-xs text-ink-muted transition duration-150 ease-[var(--ease-out-quint)] hover:bg-raised hover:text-ink disabled:opacity-60 md:min-h-0"
            >
              {syncing ? '맞추는 중…' : '스토어와 동기화'}
            </button>
          </div>
          {syncNotice && <p className="mt-2 text-xs text-ink-muted">{syncNotice}</p>}

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
                    className="min-h-11 shrink-0 rounded-full px-3 py-1.5 text-xs text-ink-muted transition duration-150 ease-[var(--ease-out-quint)] hover:bg-raised hover:text-danger md:min-h-0"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

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
                required
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              disabled={creating}
              className="mt-3 h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-medium text-accent-ink transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.02] active:scale-[0.98] disabled:scale-100 disabled:opacity-50 md:mt-0"
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
                {person.id !== user?.id && (
                  <button
                    onClick={() => void onReset(person)}
                    className="min-h-11 shrink-0 rounded-full px-3 py-1.5 text-xs text-ink-muted transition duration-150 ease-[var(--ease-out-quint)] hover:bg-raised hover:text-ink md:min-h-0"
                  >
                    비밀번호 초기화
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

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

      {issued && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0" onClick={() => setIssued(null)} aria-hidden="true" />
          <div className="relative w-full max-w-sm rounded-[1.75rem] bg-surface p-1.5 shadow-[var(--shadow-lifted)]">
            <div className="rounded-[1.375rem] bg-raised p-6">
              <h2 className="text-base font-semibold text-ink">
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
                  className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
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
