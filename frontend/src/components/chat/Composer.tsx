import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import CameraCapture from './CameraCapture'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
                className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {f.type.startsWith('image/') ? '🖼️' : '📄'} {f.name.slice(0, 20)}
                <button type="button" onClick={() => removeFile(i)} aria-label="첨부 제거" className="text-zinc-400 hover:text-red-500">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="파일 첨부"
            className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            📎
          </button>
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            aria-label="카메라 촬영"
            className="rounded-lg px-2 py-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            📷
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
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
              className="rounded-lg bg-zinc-200 px-3 py-1.5 text-sm text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
            >
              중단
            </button>
          ) : (
            <button
              type="submit"
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              disabled={!text.trim() && files.length === 0}
            >
              보내기
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
