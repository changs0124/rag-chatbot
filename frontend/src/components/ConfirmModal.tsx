import { useEffect, useId } from 'react'

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
  const titleId = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0" onClick={onCancel} aria-hidden="true" />
      {/* 한 겹 카드(#646) - 이중 테두리(트레이)를 걷었다. 경계는 1px line + 떠 있는 그림자 */}
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-raised shadow-[var(--shadow-lifted)]">
        <div className="p-6">
          <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
          {message && <p className="mt-2 text-sm leading-relaxed text-ink-muted">{message}</p>}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {/* 첫 포커스는 취소 - 열리자마자 Enter 한 번이 삭제가 되지 않게 한다(#484) */}
            <button
              autoFocus
              onClick={onCancel}
              className="h-11 rounded-lg border border-line bg-raised px-4 text-sm font-medium text-ink transition-colors duration-150 ease-[var(--ease-out-quint)] hover:bg-surface md:h-10"
            >
              취소
            </button>
            <button
              onClick={onConfirm}
              className="h-11 rounded-lg bg-danger px-4 text-sm font-medium text-danger-ink transition-[filter] duration-150 ease-[var(--ease-out-quint)] hover:brightness-95 md:h-10"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
