import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import AdminErrorBanners from '../components/AdminErrorBanners'
import BackLink from '../components/BackLink'
import ConfirmModal from '../components/ConfirmModal'
import PageShell from '../components/PageShell'
import { actionButtonClass } from '../components/actionButton'
import { IconAlert, IconCheck, IconClock } from '../components/icons'
import { errorMessage } from '../lib/api'
import { deleteDocument, listDocuments, syncDocuments, uploadDocument } from '../lib/endpoints'
import type { RagDocument } from '../lib/types'

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// 문서 관리(FEAT-ADMIN-002). 사용자 관리는 AdminUsersPage 로 나뉘었다(#513).
// 페이지에는 목록 · 오류 배너 · 관리자 가드만 두고, 업로드 · 동기화 · 삭제의 진행 · 확인 상태는 구역 안에 있다(#390)
export default function AdminDocumentsPage() {
  const { user } = useAuth()
  const [documents, setDocuments] = useState<RagDocument[]>([])
  const [error, setError] = useState<string | null>(null)
  // 목록 오류는 따로 둔다 - 폴링 성공이 걷어야 하는데, 공유 error 를 지우면 업로드 · 삭제 오류까지 사라진다(#324)
  const [listError, setListError] = useState<string | null>(null)
  // 첫 로드가 **성공**했는지(#483 F4) - 실패를 「아직 문서가 없습니다」로 보이면 관리자는 다 지워졌다고 읽는다
  const [loaded, setLoaded] = useState(false)
  /**
   * 목록 요청 세대(#483 F13, useChat 의 generation 과 같은 패턴). refresh 가 올리고 폴링은 떠날 때 값을 적어 둔다.
   * 응답이 왔을 때 그사이 refresh 가 새로 나갔으면 버린다 - 삭제 직전에 떠난 폴링이 삭제 뒤 refresh 보다 늦게 오면
   * 지운 문서가 되살아나 보인다(완료 상태면 폴링도 멈춰 다음 변경까지 남는다)
   */
  const listGen = useRef(0)

  const isAdmin = user?.role === 'admin'

  const refresh = useCallback(async () => {
    const mine = ++listGen.current
    try {
      const docs = await listDocuments()
      if (listGen.current !== mine) return
      setDocuments(docs)
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

  // 폴링은 인덱싱 상태를 지켜본다. refresh 와 달리 세대를 올리지 않고 loaded 도 건드리지 않는다
  const pollDocuments = useCallback(async () => {
    const mine = listGen.current
    try {
      const docs = await listDocuments()
      if (listGen.current !== mine) return
      setDocuments(docs)
      setListError(null)
    } catch (e) {
      if (listGen.current !== mine) return
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

      <AdminErrorBanners listError={listError} error={error} loaded={loaded} onRetry={() => void refresh()} />

      <DocumentsSection documents={documents} loaded={loaded} refresh={refresh} setError={setError} />
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
            className={actionButtonClass + ' hover:text-ink'}
          >
            {syncing ? '맞추는 중…' : '스토어와 동기화'}
          </button>
        </div>
        <div role="status">
          {syncNotice && <p className="mt-2 text-xs text-ink-muted">{syncNotice}</p>}
        </div>

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
                  className={actionButtonClass + ' hover:text-danger'}
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

function StatusLabel({ status }: { status: RagDocument['status'] }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={'inline-flex items-center gap-1 align-[-2px] ' + STATUS_CLASS[status]}>
      <Icon className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
    </span>
  )
}
