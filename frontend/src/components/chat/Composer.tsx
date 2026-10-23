import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent } from 'react'
import ImageLightbox from './ImageLightbox'
import { errorMessage } from '../../lib/api'
import { deleteAttachment, uploadFile } from '../../lib/endpoints'
import type { Attachment } from '../../lib/types'
import {
  IconAlert,
  IconArrowUp,
  IconClose,
  IconPlus,
  IconStop,
} from '../icons'

/**
 * 전송 전 첨부 한 건. **고르는 즉시 업로드**하므로(ChatGPT · Claude 와 같은 동작) 카드가
 * 업로드 진행 상태를 들고 있어야 함 - 전송 시점에는 이미 올라간 id 만 넘긴다.
 */
interface Draft {
  key: string
  file: File
  /** 서버 왕복을 기다리지 않으려고 로컬 objectURL 을 씀 */
  previewUrl: string
  status: 'uploading' | 'done' | 'error'
  attachment?: Attachment
  message?: string
  controller: AbortController
}

let draftSeq = 0

// 메시지 1건당 첨부 개수. 서버 상한(CHAT_MAX_ATTACHMENTS 기본값)과 같은 값. 정본은 서버라 넘긴 요청은 400 이다(#401)
const MAX_ATTACHMENTS = 5

// 입력줄의 둥근 버튼(첨부 · 중단 · 보내기). 크기 · 모양만 공유하고 색 · 움직임은 호출부가 덧붙인다(#390)
const roundBtn = 'grid h-11 w-11 place-items-center rounded-full md:h-10 md:w-10'

// 중단 버튼이 나타난 뒤 이 시간 안의 클릭은 무시한다(#435). 보내기와 같은 자리라, 빠른 두 번 탭의 두 번째가
// 중단으로 떨어져 첫 토큰 전에 질문이 끊겼다. OS 기본 더블클릭 간격(500ms)
const STOP_GUARD_MS = 500

export default function Composer({
  onSend,
  streaming,
  busy = false,
  onStop,
}: {
  /**
   * 받아들였으면 true - 거절된 전송은 입력과 첨부 초안을 그대로 둔다(#323). 새 대화는 생성 왕복 뒤에 정해진다(#349).
   * 받아들인 턴이 서버에 닿기 전에 끊기면 `giveBack` 을 부른다 - 보낸 글과 첨부를 입력창에 되돌린다(#440)
   */
  onSend: (text: string, attachments: Attachment[], giveBack: () => void) => Promise<boolean>
  streaming: boolean
  /** 이력 로딩 · 대화 생성 중 - 이때 보낸 것은 어차피 거절되므로 비우기 전에 막는다(#323) */
  busy?: boolean
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  // 상한을 넘겨 버린 파일이 있었는지 - 카드를 지우거나 보내면 걷는다
  // 'returned' 는 되돌린 카드와 합쳐 넘쳐 이미 붙어 있던 카드를 걷은 경우(#440) - 안내 문구가 다르다
  const [overLimit, setOverLimit] = useState<false | 'added' | 'returned'>(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 언마운트 정리용 - 정리 시점에 최신 목록을 봐야 해서 상태가 아니라 ref 로 들고 있음
  const draftsRef = useRef<Draft[]>([])
  draftsRef.current = drafts
  // 받아들임을 기다리는 동안 보낸 카드의 key(#349) - 곧 메시지에 실릴 첨부라 서버에서 지우면 안 된다
  const sendingRef = useRef<string[]>([])
  // 중단 버튼이 나타난 시각(#435). 화면에 그리기 전에 적어야 첫 프레임의 클릭도 막는다
  const stopShownAt = useRef(0)
  useLayoutEffect(() => {
    if (streaming) stopShownAt.current = Date.now()
  }, [streaming])

  const startUpload = useCallback((draft: Draft) => {
    uploadFile(draft.file, draft.controller.signal)
      .then((attachment) => {
        // 지운 카드의 업로드가 뒤늦게 성공하는 경우 - abort 는 요청을 끊을 뿐 서버가 이미 받은 것을
        // 되돌리지 않는다. 여기서 지우지 않으면 회수 크론을 기다리는 고아가 됨
        if (!draftsRef.current.some((d) => d.key === draft.key)) {
          deleteAttachment(attachment.id).catch(() => {})
          return
        }
        setDrafts((prev) =>
          prev.map((d) => (d.key === draft.key ? { ...d, status: 'done', attachment } : d)),
        )
      })
      .catch((e) => {
        // 카드를 지워서 끊은 경우는 오류가 아님 - 이미 목록에서 빠졌다
        if (draft.controller.signal.aborted) return
        setDrafts((prev) =>
          prev.map((d) =>
            d.key === draft.key
              ? { ...d, status: 'error', message: errorMessage(e, '업로드 실패') }
              : d,
          ),
        )
      })
  }, [])

  const addFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return
      // 이미지가 아닌 것은 조용히 버림 - 서버도 받지 않으므로 카드를 만들면 실패만 보여 주게 됨
      const images = Array.from(list).filter((file) => file.type.startsWith('image/'))
      // 남은 자리만큼만 받는다. 넘친 것은 올리지 않는다 - 올리면 보낼 수 없는 첨부가 서버에 쌓인다(#401)
      const room = Math.max(0, MAX_ATTACHMENTS - draftsRef.current.length)
      if (images.length > room) setOverLimit('added')
      const next = images
        .slice(0, room)
        .map((file) => ({
          key: `d${draftSeq++}`,
          file,
          previewUrl: URL.createObjectURL(file),
          status: 'uploading' as const,
          controller: new AbortController(),
        }))
      if (next.length === 0) return
      setDrafts((prev) => [...prev, ...next])
      next.forEach(startUpload)
    },
    [startUpload],
  )

  function removeDraft(key: string) {
    const target = draftsRef.current.find((d) => d.key === key)
    if (!target || sendingRef.current.includes(key)) return
    target.controller.abort()
    // 이미 올라갔으면 서버에서도 지움. 실패해도 카드는 지움 - 남은 파일은 고아 회수가 가져감
    if (target.attachment) deleteAttachment(target.attachment.id).catch(() => {})
    URL.revokeObjectURL(target.previewUrl)
    setDrafts((prev) => prev.filter((d) => d.key !== key))
    setOverLimit(false)
  }

  function retryDraft(key: string) {
    const target = draftsRef.current.find((d) => d.key === key)
    if (!target) return
    const retried: Draft = { ...target, status: 'uploading', message: undefined, controller: new AbortController() }
    setDrafts((prev) => prev.map((d) => (d.key === key ? retried : d)))
    startUpload(retried)
  }

  // 언마운트 뒤에 오는 giveBack 을 무시하려고 든다(#440)
  const mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  /**
   * 언마운트 정리 - 미리보기 URL 회수 + **진행 중인 업로드 중단과 고아 회수**(#94).
   *
   * 순서가 중요하다 - draftsRef 를 마지막에 비워야, abort 보다 먼저 서버가 받아 버린 업로드가
   * 뒤늦게 resolve 했을 때 startUpload 의 `some(...)` 가 거짓이 되어 **기존 회수 경로를 그대로 탄다.**
   * 먼저 비우면 URL 회수 대상도 함께 사라진다.
   *
   * 로그아웃으로 언마운트될 때는 토큰이 먼저 지워져 여기서 보내는 삭제가 401 로 실패한다 - 그 고아는 회수 크론이 걷는다.
   */
  useEffect(
    () => () => {
      draftsRef.current.forEach((d) => {
        URL.revokeObjectURL(d.previewUrl)
        d.controller.abort()
        // 이미 올라간 것은 지금 지운다 - abort 는 서버가 이미 받은 것을 되돌리지 않는다. 보내는 중인 것은 빼고(#349)
        if (d.attachment && !sendingRef.current.includes(d.key)) deleteAttachment(d.attachment.id).catch(() => {})
      })
      draftsRef.current = []
    },
    [],
  )

  /**
   * 드래그앤드롭. dragleave 는 자식 요소를 지날 때마다 오므로 그것만 보고 걷으면 오버레이가 깜빡임 -
   * 진입/이탈을 세어 0이 될 때만 걷는다.
   */
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes('Files') ?? false

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth += 1
      setDragging(true)
    }
    const onOver = (e: DragEvent) => {
      // 막지 않으면 브라우저가 파일을 새 탭으로 열어 대화 화면을 덮어씀
      if (hasFiles(e)) e.preventDefault()
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      addFiles(e.dataTransfer?.files ?? null)
    }

    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [addFiles])

  // 붙여넣기 - 파일이 있으면 첨부하고, 텍스트는 기본 동작 그대로 입력되게 둠
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = e.clipboardData?.files
    if (files && files.length > 0) addFiles(files)
  }

  const pending = drafts.some((d) => d.status !== 'done')
  const failed = drafts.filter((d) => d.status === 'error')

  async function doSend() {
    if (streaming || pending || busy) return
    if (!text.trim() && drafts.length === 0) return
    const sent = drafts
    sendingRef.current = sent.map((d) => d.key)
    const accepted = await onSend(
      text.trim(),
      sent.map((d) => d.attachment).filter((a): a is Attachment => !!a),
      () => giveBack(text, sent),
    )
    sendingRef.current = []
    if (!accepted) return
    // 생성 왕복을 기다리는 사이 이어 쓴 글 · 더한 첨부는 남긴다 - 보낸 것만 걷는다
    setText((cur) => (cur === text ? '' : cur))
    sent.forEach((d) => URL.revokeObjectURL(d.previewUrl))
    setDrafts((prev) => prev.filter((d) => !sent.includes(d)))
    setOverLimit(false)
  }

  /**
   * 서버에 닿지 못한 턴의 글과 카드를 되돌린다(#440). 그사이 새로 쓴 글은 지우지 않고 뒤에 잇는다.
   * 카드는 보낼 때 미리보기 URL 을 회수했으므로 파일에서 다시 만든다 - 서버 첨부는 그대로라 다시 올리지 않는다
   */
  function giveBack(sentText: string, sent: Draft[]) {
    // 언마운트 뒤(로그아웃 등)에는 되돌릴 곳이 없다 - 만든 미리보기 URL 을 회수할 길도 없다
    if (!mountedRef.current) return
    setText((cur) => [sentText, cur].filter(Boolean).join('\n'))
    const back = sent.map((d) => ({ ...d, key: `d${draftSeq++}`, previewUrl: URL.createObjectURL(d.file) }))
    // 그사이 더한 카드와 합쳐 상한을 넘으면 뒤에 더한 것을 걷는다 - 보낼 수 없는 묶음이 남으면 서버가 400 으로 거절한다(#401)
    const room = Math.max(0, MAX_ATTACHMENTS - back.length)
    const dropped = draftsRef.current.slice(room)
    dropped.forEach((d) => {
      d.controller.abort()
      if (d.attachment) deleteAttachment(d.attachment.id).catch(() => {})
      URL.revokeObjectURL(d.previewUrl)
    })
    if (dropped.length > 0) setOverLimit('returned')
    // key 로 가른다 - 그사이 업로드 완료가 같은 카드를 새 객체로 바꿨을 수 있다
    const droppedKeys = new Set(dropped.map((d) => d.key))
    setDrafts((prev) => [...back, ...prev.filter((d) => !droppedKeys.has(d.key))])
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void doSend()
  }

  const lightboxItems = drafts.map((d) => ({ src: d.previewUrl, name: d.file.name }))

  return (
    <div className="bg-canvas px-4 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
        {drafts.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-3">
            {drafts.map((d, i) => (
              <DraftCard
                key={d.key}
                draft={d}
                onOpen={() => setLightboxIndex(i)}
                onRemove={() => removeDraft(d.key)}
                onRetry={() => retryDraft(d.key)}
              />
            ))}
          </div>
        )}

        {/* `title` 툴팁은 터치 기기에서 안 뜨므로 실패 사유를 텍스트로 낸다(#101) */}
        {failed.length > 0 && (
          <p role="alert" className="mb-2 px-1 text-[13px] text-danger">
            첨부 {failed.length}건이 실패해 보낼 수 없습니다 — {failed[0].message ?? '업로드 실패'}
            {failed.length > 1 && ` 외 ${failed.length - 1}건`}
          </p>
        )}

        {overLimit && (
          <p role="alert" className="mb-2 px-1 text-[13px] text-danger">
            첨부는 한 번에 {MAX_ATTACHMENTS}장까지 보낼 수 있습니다 —{' '}
            {overLimit === 'returned' ? '되돌린 사진과 합쳐 넘쳐, 나중에 추가한 사진을 뺐습니다' : '넘친 사진은 추가하지 않았습니다'}
          </p>
        )}

        <div className="flex items-end gap-2 rounded-3xl border border-line bg-raised px-2 py-1.5 shadow-[var(--shadow-ambient)] transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-quint)] focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--c-focus-ring)]">
          {/* + 는 OS 선택창을 바로 연다 - iOS · Android 선택창이 촬영 항목을 붙인다(#289) */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="첨부 추가"
            className={roundBtn + ' text-ink-muted transition duration-150 ease-[var(--ease-out-quint)] hover:bg-surface hover:text-ink active:scale-[0.95]'}
          >
            <IconPlus />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            // image/* 여야 OS 선택창이 촬영 항목을 붙인다(#289) - 서버 허용 목록으로 좁히면 Android 가 카메라 없이
            // 보관함으로 바로 들어갔다. 허용 밖 형식(HEIC 등)은 업로드에서 서버가 거절하고 카드에 오류로 남는다
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              // 한글 조합을 끝내려고 누른 Enter 는 전송이 아니다(#385)
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void doSend()
              }
            }}
            rows={1}
            placeholder="메시지를 입력하세요"
            // 서버 상한(CHAT_MAX_MESSAGE_CHARS 기본값)과 같은 값. 정본은 서버라 넘긴 요청은 400 이다(#371)
            maxLength={4000}
            // 한 줄 높이를 버튼과 정확히 맞춤 : 24 + 20 = 44(모바일 h-11), 24 + 16 = 40(md h-10).
            // leading-relaxed(24.375)면 md 에서 버튼이 2.2px 아래로 처진다(#218).
            // 모바일 글자는 16px - iOS 는 16px 미만 입력에 포커스하면 화면을 확대해 버린다(#221)
            className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2.5 text-base leading-6 text-ink md:py-2 md:text-[15px] outline-none placeholder:text-ink-muted"
          />

          {streaming ? (
            <button
              type="button"
              onClick={() => {
                if (Date.now() - stopShownAt.current < STOP_GUARD_MS) return
                onStop()
              }}
              aria-label="중단"
              className={roundBtn + ' bg-surface text-ink transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.03] active:scale-[0.97]'}
            >
              <IconStop />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="보내기"
              className={roundBtn + ' bg-accent text-accent-ink transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.03] active:scale-[0.97] disabled:scale-100 disabled:opacity-35'}
              // 올라가지 않은(또는 실패한) 첨부를 둔 채 보내면 그 이미지가 빠진 줄 모르고 보내게 됨
              disabled={busy || pending || (!text.trim() && drafts.length === 0)}
              // 비활성 버튼은 이유를 말하지 않으면 고장으로 읽힌다(#101)
              title={
                failed.length > 0
                  ? '실패한 첨부를 재시도하거나 지워야 보낼 수 있습니다'
                  : pending
                    ? '업로드가 끝나면 보낼 수 있습니다'
                    : busy
                      ? '대화를 준비하는 중에는 보낼 수 없습니다'
                      : undefined
              }
            >
              <IconArrowUp />
            </button>
          )}
        </div>
      </form>

      {/* 스크림은 검정이 아니라 canvas/85 - 글자 12.70 · 점선 4.95. 85~95 는 사실상 같은 값이라
          뒤가 비치는 85 를 쓴다 */}
      {dragging && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-canvas/85 p-6 backdrop-blur-sm">
          <div className="grid h-full w-full place-items-center rounded-[1.75rem] border-2 border-dashed border-accent text-[15px] font-medium text-ink">
            여기에 놓아 첨부
          </div>
        </div>
      )}

      {lightboxIndex !== null && lightboxItems[lightboxIndex] && (
        <ImageLightbox
          items={lightboxItems}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}

/**
 * 첨부 카드. **파일명 없이 썸네일만** 둔다 - 파일명은 alt·aria-label 로만 남기고,
 * 구분이 필요하면 눌러서 확대해 본다.
 */
function DraftCard({
  draft,
  onOpen,
  onRemove,
  onRetry,
}: {
  draft: Draft
  onOpen: () => void
  onRemove: () => void
  onRetry: () => void
}) {
  // 브라우저가 그리지 못하는 형식(데스크톱의 HEIC 등)은 깨진 아이콘과 alt 글자가 오류 막 밑으로 비친다(#317) -
  // 이미지를 빼고 카드 바탕만 남긴다
  const [unrenderable, setUnrenderable] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${draft.file.name} 확대`}
        className="block h-16 w-16 overflow-hidden rounded-xl border border-line bg-surface transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.03]"
      >
        {!unrenderable && (
          <img
            src={draft.previewUrl}
            alt={draft.file.name}
            onError={() => setUnrenderable(true)}
            className="h-full w-full object-cover"
          />
        )}
      </button>

      {draft.status === 'uploading' && (
        <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/40">
          <span
            role="status"
            aria-label="업로드 중"
            className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white"
          />
        </div>
      )}

      {draft.status === 'error' && (
        <div
          title={draft.message}
          className="absolute inset-0 grid place-items-center gap-0.5 rounded-xl bg-black/75 text-white"
        >
          {/* 바탕이 임의의 이미지라 최악(흰 이미지)을 기준으로 잰다 - 스크림 75% 에서 highlight 8.34
              (아이콘 기준 3.0). 화면 색과 무관한 고정 어두운 면이라 danger 를 쓰면 1.06 으로 무너진다 */}
          <IconAlert className="h-4 w-4 text-highlight" />
          <button type="button" onClick={onRetry} className="text-[10px] underline">
            재시도
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="첨부 제거"
        className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full border border-line bg-raised text-ink-muted shadow-[var(--shadow-ambient)] transition duration-150 ease-[var(--ease-out-quint)] hover:text-danger"
      >
        <IconClose className="h-3 w-3" />
      </button>
    </div>
  )
}
