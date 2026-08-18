import type { Citation } from '../../lib/types'

// 답변 하단 출처 목록(각주 번호 + 출처명 + 스니펫). R-4
export default function Citations({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null
  return (
    <div className="mt-4 space-y-1.5 border-t border-line pt-3">
      <p className="text-[11px] font-medium tracking-[0.08em] text-ink-muted uppercase">출처</p>
      <ol className="space-y-1">
        {citations.map((c) => (
          <li key={c.seq} className="text-[13px] leading-relaxed text-ink-muted">
            <span className="mr-1 font-semibold text-accent">[{c.seq}]</span>
            <span className="text-ink">{c.sourceName}</span>
            {c.snippet && <span> — {c.snippet}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
