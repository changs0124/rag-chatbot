import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent, ReactNode } from 'react'
import CameraCapture from './CameraCapture'
import ImageLightbox from './ImageLightbox'
import { ApiError } from '../../lib/api'
import { deleteAttachment, uploadFile } from '../../lib/endpoints'
import type { Attachment } from '../../lib/types'
import {
  IconAlert,
  IconArrowUp,
  IconCamera,
  IconClose,
  IconImage,
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

export default function Composer({
  onSend,
  streaming,
  onStop,
}: {
  onSend: (text: string, attachments: Attachment[]) => void
  streaming: boolean
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  // 받는 것은 이미지뿐임 - 문서 첨부는 받지 않는다(2026-07-28 범위 축소, 2026-08-18 경로 자체를 제거)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // 언마운트 정리용 - 정리 시점에 최신 목록을 봐야 해서 상태가 아니라 ref 로 들고 있음
  const draftsRef = useRef<Draft[]>([])
  draftsRef.current = drafts

  const startUpload = useCallback((draft: Draft) => {
    uploadFile(draft.file, draft.controller.signal)
      .then((attachment) => {
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
              ? { ...d, status: 'error', message: e instanceof ApiError ? e.message : '업로드 실패' }
              : d,
          ),
        )
      })
  }, [])

  const addFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return
      // 이미지가 아닌 것은 조용히 버림 - 서버도 받지 않으므로 카드를 만들면 실패만 보여 주게 됨
      const next = Array.from(list)
        .filter((file) => file.type.startsWith('image/'))
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
    if (!target) return
    target.controller.abort()
    // 이미 올라갔으면 서버에서도 지움. 실패해도 카드는 지움 - 남은 파일은 고아 회수가 가져감
    if (target.attachment) deleteAttachment(target.attachment.id).catch(() => {})
    URL.revokeObjectURL(target.previewUrl)
    setDrafts((prev) => prev.filter((d) => d.key !== key))
  }

  function retryDraft(key: string) {
    const target = draftsRef.current.find((d) => d.key === key)
    if (!target) return
    const retried: Draft = { ...target, status: 'uploading', message: undefined, controller: new AbortController() }
    setDrafts((prev) => prev.map((d) => (d.key === key ? retried : d)))
    startUpload(retried)
  }

  // 언마운트에서 남은 미리보기 URL 회수 - 안 하면 탭이 살아 있는 동안 원본이 메모리에 붙잡힘
  useEffect(
    () => () => {
      draftsRef.current.forEach((d) => URL.revokeObjectURL(d.previewUrl))
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

  function doSend() {
    if (streaming || pending) return
    if (!text.trim() && drafts.length === 0) return
    onSend(
      text.trim(),
      drafts.map((d) => d.attachment).filter((a): a is Attachment => !!a),
    )
    setText('')
    drafts.forEach((d) => URL.revokeObjectURL(d.previewUrl))
    setDrafts([])
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    doSend()
  }

  const lightboxItems = drafts.map((d) => ({ src: d.previewUrl, name: d.file.name }))

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
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

        <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
          {/* + 첨부 메뉴 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="첨부 추가"
              aria-expanded={menuOpen}
              className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <IconPlus />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute bottom-11 left-0 z-20 w-40 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
                  <MenuItem
                    icon={<IconImage className="h-4 w-4" />}
                    label="사진"
                    onClick={() => {
                      setMenuOpen(false)
                      fileInputRef.current?.click()
                    }}
                  />
                  <MenuItem
                    icon={<IconCamera className="h-4 w-4" />}
                    label="카메라"
                    onClick={() => {
                      setMenuOpen(false)
                      setShowCamera(true)
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
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
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                doSend()
              }
            }}
            rows={1}
            placeholder="메시지를 입력하세요"
            className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm text-zinc-900 outline-none dark:text-zinc-100"
          />

          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="중단"
              className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
            >
              <IconStop />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="보내기"
              className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              // 올라가지 않은(또는 실패한) 첨부를 둔 채 보내면 그 이미지가 빠진 줄 모르고 보내게 됨
              disabled={pending || (!text.trim() && drafts.length === 0)}
            >
              <IconArrowUp />
            </button>
          )}
        </div>
      </form>

      {dragging && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-8">
          <div className="grid h-full w-full place-items-center rounded-2xl border-2 border-dashed border-white/70 text-sm font-medium text-white">
            여기에 놓아 첨부
          </div>
        </div>
      )}

      {showCamera && (
        <CameraCapture onCapture={(file) => addFiles([file])} onClose={() => setShowCamera(false)} />
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
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${draft.file.name} 확대`}
        className="block h-16 w-16 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700"
      >
        <img src={draft.previewUrl} alt={draft.file.name} className="h-full w-full object-cover" />
      </button>

      {draft.status === 'uploading' && (
        <div className="absolute inset-0 grid place-items-center rounded-lg bg-black/40">
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
          className="absolute inset-0 grid place-items-center gap-0.5 rounded-lg bg-black/60 text-white"
        >
          <IconAlert className="h-4 w-4 text-amber-400" />
          <button type="button" onClick={onRetry} className="text-[10px] underline">
            재시도
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        aria-label="첨부 제거"
        className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-full border border-zinc-300 bg-white text-zinc-500 shadow-sm hover:text-red-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
      >
        <IconClose className="h-3 w-3" />
      </button>
    </div>
  )
}

function MenuItem({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700"
    >
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      {label}
    </button>
  )
}
