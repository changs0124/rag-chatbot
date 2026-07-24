import { useEffect } from 'react'

export default function ConfirmModal({
  message,
  confirmLabel = '삭제',
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <p className="mb-5 text-sm text-zinc-700 dark:text-zinc-200">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            취소
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
