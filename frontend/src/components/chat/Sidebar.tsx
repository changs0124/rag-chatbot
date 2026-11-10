import { memo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { Conversation } from '../../lib/types'
import { IconChevronRight, IconClose, IconLogout, IconPlus, IconSettings } from '../icons'
import Logo from '../Logo'
import ConfirmModal from '../ConfirmModal'

/**
 * 대화 목록을 시간 묶음으로 나눔(ChatGPT · Claude 공통). 제목만 길게 늘어놓으면
 * "어제 그 대화"를 눈으로 찾지 못한다. 기준은 마지막 갱신 시각이다.
 * 경계는 로컬 자정이다 - 24시간 창이면 어제 밤 대화가 아침에 「오늘」로 보인다(#324).
 */
function groupByRecency(conversations: Conversation[]) {
  const startOfToday = new Date().setHours(0, 0, 0, 0)
  const day = 24 * 60 * 60 * 1000
  const groups: { label: string; items: Conversation[] }[] = [
    { label: '오늘', items: [] },
    { label: '지난 7일', items: [] },
    { label: '이전', items: [] },
  ]
  for (const c of conversations) {
    const t = new Date(c.updatedAt).getTime()
    const bucket = t >= startOfToday ? 0 : t >= startOfToday - 6 * day ? 1 : 2
    groups[bucket].items.push(c)
  }
  return groups.filter((g) => g.items.length > 0)
}

// memo(#405) - 대화 상태가 ChatPage 의 useChat 에 모여 있어 스트리밍 토큰마다 페이지가 다시 그려진다.
// 넘겨받는 값이 그대로면 대화 목록 전체를 다시 그릴 이유가 없다. 핸들러는 ChatPage 가 useCallback 으로 고정한다
export default memo(function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  userName,
  onLogout,
  loading = false,
}: {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  userName: string
  onLogout: () => void
  /** 첫 목록이 아직 안 왔다(#663) - 이때 빈 목록은 「없음」이 아니다 */
  loading?: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  // 대화를 지우면 연 ✕ 버튼이 행째 사라진다(#656). 확인 창이 닫힐 때는 아직 ✕ 가 있어 포커스가 거기로 돌아갔다가,
  // 삭제가 끝나 행이 빠지는 순간 body 로 빠진다 - 그때 「새 대화」로 옮겨 드로어 안이면 Esc 도 계속 먹게 한다
  const newChatRef = useRef<HTMLButtonElement>(null)
  const deletedIdRef = useRef<string | null>(null)
  // 목록이 한 번 바뀌면 표시를 거둔다 - 삭제가 실패해 행이 남았는데 표시를 들고 있으면, 나중에 다른 경로(다른 기기에서
  // 지움 · 목록 갱신)로 그 행이 빠질 때 엉뚱하게 「새 대화」로 포커스가 튄다(#674)
  useEffect(() => {
    const id = deletedIdRef.current
    if (!id) return
    deletedIdRef.current = null
    if (conversations.some((c) => c.id === id)) return
    if (!document.activeElement || document.activeElement === document.body) newChatRef.current?.focus()
  }, [conversations])
  const initial = userName.trim().charAt(0) || '?'
  const groups = groupByRecency(conversations)
  // 첫 목록을 기다리는 동안에도 그 사이 만든 새 대화가 있으면 그것부터 보인다 - 스켈레톤은 빈 자리에만
  const listPending = loading && conversations.length === 0

  return (
    <aside className="flex h-full w-full flex-col border-r border-line bg-surface">
      {/* h-9 는 2줄째 글자가 읽히게 하려는 값이다(#233). 락업 149px 은 사이드바 최소 폭 200px 에서 px-6 을 뺀 152px 안에 들어가므로
          좁아질 때 마크로 줄이는 분기는 두지 않았다 */}
      {/* px-6 은 바로 아래 「새 대화」 버튼의 내용 시작(p-3 + px-3 = 24px)에 맞춘 값이다 */}
      <div className="px-6 pt-4 pb-1">
        <Logo className="h-9 w-auto text-ink" />
      </div>
      <div className="p-3">
        {/* 테두리 버튼(#646 버튼 체계) - 떠 있는 카드 + 커지는 hover 를 걷고 보조 버튼과 같은 모양으로 */}
        <button
          ref={newChatRef}
          onClick={onNew}
          className="flex h-11 w-full items-center gap-2 rounded-lg border border-line bg-raised px-3 text-sm font-medium text-ink shadow-[var(--shadow-card)] transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-canvas md:h-10"
        >
          <IconPlus className="h-4 w-4 text-accent" />새 대화
        </button>
      </div>

      {/* relative - 아래 낭독용 상태 줄(sr-only = absolute)이 스크롤 상자 밖으로 나가 높이를 늘리지 않게(#642 와 같은 이유) */}
      <nav className="scrollbar-none relative min-w-0 flex-1 overflow-y-auto px-2 pb-2">
        {/* 늘 있는 그릇에 글만 넣는다(#484 규칙 · #590) - 끼웠다 빼면 낭독기가 놓친다 */}
        <p role="status" className="sr-only">
          {listPending ? '대화 목록 불러오는 중' : ''}
        </p>
        {listPending && <ConversationListSkeleton />}
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            {/* 한글에는 자간 · 대문자 효과가 없어 걷었다(#646). 12px 이 읽히는 하한 */}
            <p className="px-3 pb-1 text-xs font-medium text-ink-muted">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((c) => (
                <div
                  key={c.id}
                  className={
                    'group relative flex items-center rounded-lg pr-1.5 text-sm transition-colors duration-150 ease-[var(--ease-out-quint)] ' +
                    (c.id === activeId
                      ? 'bg-raised font-medium text-ink shadow-[var(--shadow-card)]'
                      : 'text-ink-muted hover:bg-raised/70 hover:text-ink')
                  }
                >
                  {/* 지금 대화는 색 말고도 드러낸다(#646, WCAG 1.4.1) - 면 차이(1.13:1)만으로는 안 보여 굵기 + 왼쪽 막대(accent 4.85) */}
                  {c.id === activeId && (
                    <span aria-hidden="true" className="absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent" />
                  )}
                  <button
                    onClick={() => onSelect(c.id)}
                    // 색으로만 드러난 현재 대화를 낭독기에도 알린다(#590)
                    aria-current={c.id === activeId ? 'page' : undefined}
                    className="min-w-0 flex-1 truncate px-3 py-3 text-left md:py-2"
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => setPendingDelete(c)}
                    aria-label={`'${c.title}' 대화 삭제`}
                    className="shrink-0 rounded-md p-3.5 text-ink-muted opacity-100 md:p-1 transition duration-150 ease-[var(--ease-out-quint)] hover:text-danger md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100"
                  >
                    <IconClose className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {conversations.length === 0 && !loading && (
          <p className="px-3 py-6 text-center text-[13px] text-ink-muted">대화가 없습니다</p>
        )}
      </nav>

      {/* 사용자 프로필 - 클릭 시 설정/로그아웃 */}
      <div className="relative border-t border-line p-2">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-raised"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-ink">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{userName}</span>
          <IconChevronRight
            className={'h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150 ease-[var(--ease-out-quint)] ' + (menuOpen ? '-rotate-90' : '')}
          />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            {/* 항목은 모바일 44px · 데스크톱 36px(#646 터치 하한). 이름은 화면 제목 「설정」과 맞춘다 */}
            <div className="absolute right-2 bottom-full left-2 z-20 mb-1 overflow-hidden rounded-xl border border-line bg-raised p-1 shadow-[var(--shadow-lifted)]">
              <Link
                to="/me"
                onClick={() => setMenuOpen(false)}
                className="flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface md:h-9"
              >
                <IconSettings className="h-4 w-4 text-ink-muted" />
                설정
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="flex h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface md:h-9"
              >
                <IconLogout className="h-4 w-4 text-ink-muted" />
                로그아웃
              </button>
            </div>
          </>
        )}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="대화를 삭제할까요?"
          message={`'${pendingDelete.title}' 대화가 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
          confirmLabel="삭제"
          onConfirm={() => {
            deletedIdRef.current = pendingDelete.id
            onDelete(pendingDelete.id)
            setPendingDelete(null)
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </aside>
  )
})

/**
 * 첫 목록이 오기 전의 대화 목록 자리(#663). 「대화가 없습니다」를 먼저 보이면 대화가 있는 사용자에게 잠깐 「없다」고 말한다 -
 * 관리 목록(AdminListSkeleton, #646)과 같은 결로 묶음 라벨 하나와 대화 행 모양을 깐다. 낭독기에는 숨기고 위 상태 줄이 알린다.
 * 움직임 줄이기면 깜빡임을 끈다
 */
function ConversationListSkeleton() {
  return (
    <div aria-hidden="true" data-testid="conversation-list-skeleton" className="mb-3 animate-pulse motion-reduce:animate-none">
      <div className="mx-3 mb-2 mt-1 h-3 w-12 rounded-full bg-highlight" />
      <div className="space-y-0.5">
        {[78, 62, 70, 55, 66].map((w) => (
          <div key={w} className="flex h-11 items-center px-3 md:h-9">
            <div className="h-3.5 rounded-full bg-highlight" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}
