import type { Citation } from '../../lib/types'

// 답변 하단 출처 목록(각주 번호 + 출처명 + 스니펫). R-4
export default function Citations({ citations }: { citations: Citation[] }) {
  if (!citations || citations.length === 0) return null
  return (
    <div className="mt-3 space-y-1 border-t border-zinc-200 pt-2 dark:border-zinc-700">
      <p className="text-xs font-medium text-zinc-500">출처</p>
      <ol className="space-y-1">
        {citations.map((c) => (
          <li key={c.seq} className="text-xs text-zinc-500">
            <span className="mr-1 font-semibold text-zinc-700 dark:text-zinc-300">[{c.seq}]</span>
            <span className="text-zinc-700 dark:text-zinc-300">{c.sourceName}</span>
            {c.snippet && <span className="text-zinc-400"> — {c.snippet}</span>}
          </li>
        ))}
      </ol>
    </div>
  )
}
