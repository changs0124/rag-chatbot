import type { Citation } from '../../lib/types'
import { stripFigureMarkers } from '../../lib/docFigures'

// 답변 하단 출처 목록(각주 번호 + 출처명 + 스니펫). REQ-RAG-001
export default function Citations({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null
  return (
    <div className="mt-4 space-y-1.5 border-t border-line pt-3">
      {/* 한글 라벨이라 자간 · 대문자를 걷었다(#646) */}
      <p className="text-xs font-semibold text-ink-muted">출처</p>
      <ol className="space-y-1">
        {citations.map((c) => (
          <li key={c.seq} className="text-[13px] leading-relaxed text-ink-muted">
            <span className="mr-1 font-semibold text-accent">[{c.seq}]</span>
            <span className="text-ink">{c.sourceName}</span>
            {c.snippet && <span> — {stripFigureMarkers(c.snippet)}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
