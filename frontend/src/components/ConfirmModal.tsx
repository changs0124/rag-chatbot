import { useEffect } from 'react'

export default function ConfirmModal({
  title,
  message,
  confirmLabel = '삭제',
  onConfirm,
  onCancel,
}: {
  title: string
  message?: string
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
      {/* 이중 테두리 - 바깥 트레이 안에 본체가 앉은 모양 */}
      <div className="relative w-full max-w-sm rounded-[1.75rem] bg-surface p-1.5 shadow-[var(--shadow-lifted)]">
        <div className="rounded-[1.375rem] bg-raised p-6">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {message && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{message}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="rounded-full px-4 py-2.5 text-sm text-ink-muted transition duration-150 ease-[var(--ease-out-quint)] hover:bg-surface hover:text-ink active:scale-[0.98]"
            >
              취소
            </button>
            <button
              autoFocus
              onClick={onConfirm}
              className="rounded-full bg-danger px-5 py-2.5 text-sm font-medium text-white transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.02] active:scale-[0.98]"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
