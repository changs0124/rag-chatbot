import { useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import CameraCapture from './CameraCapture'
import {
  IconArrowUp,
  IconCamera,
  IconClose,
  IconFile,
  IconImage,
  IconPaperclip,
  IconPlus,
  IconStop,
} from '../icons'

export default function Composer({
  onSend,
  streaming,
  onStop,
}: {
  onSend: (text: string, files: File[]) => void
  streaming: boolean
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [showCamera, setShowCamera] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    setFiles((prev) => [...prev, ...Array.from(list)])
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function doSend() {
    if (streaming) return
    if (!text.trim() && files.length === 0) return
    onSend(text.trim(), files)
    setText('')
    setFiles([])
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    doSend()
  }

  return (
    <div className="border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {f.type.startsWith('image/') ? <IconImage className="h-3.5 w-3.5" /> : <IconFile className="h-3.5 w-3.5" />}
                <span className="max-w-[10rem] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  aria-label="첨부 제거"
                  className="text-zinc-400 hover:text-red-500"
                >
                  <IconClose className="h-3.5 w-3.5" />
                </button>
              </span>
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
                    icon={<IconPaperclip className="h-4 w-4" />}
                    label="파일"
                    onClick={() => {
                      setMenuOpen(false)
                      fileInputRef.current?.click()
                    }}
                  />
                  <MenuItem
                    icon={<IconImage className="h-4 w-4" />}
                    label="사진"
                    onClick={() => {
                      setMenuOpen(false)
                      photoInputRef.current?.click()
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
          <input
            ref={photoInputRef}
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
              disabled={!text.trim() && files.length === 0}
            >
              <IconArrowUp />
            </button>
          )}
        </div>
      </form>

      {showCamera && (
        <CameraCapture onCapture={(file) => setFiles((prev) => [...prev, file])} onClose={() => setShowCamera(false)} />
      )}
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
