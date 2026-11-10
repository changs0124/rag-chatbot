/**
 * 관리 화면(문서 · 사용자) 첫 로드 동안의 목록 자리(#646). 빈 칸이나 「0건」 대신 올 행의 모양을 깐다 -
 * 실제 목록과 같은 카드 · 행 높이라 다 읽은 뒤 화면이 뛰지 않는다. 낭독기에는 숨긴다(목록 로드는 오류 배너만 알린다).
 * 움직임 줄이기면 깜빡임을 끈다
 */
export default function AdminListSkeleton({ rows }: { rows: number }) {
  return (
    <div
      aria-hidden="true"
      data-testid="admin-list-skeleton"
      className="mt-3 animate-pulse divide-y divide-line overflow-hidden rounded-xl border border-line bg-raised motion-reduce:animate-none"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 md:gap-4">
          <div className="h-10 w-10 shrink-0 rounded-lg bg-highlight" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/2 rounded-full bg-highlight" />
            <div className="h-3 w-1/3 rounded-full bg-highlight" />
          </div>
          <div className="h-8 w-14 shrink-0 rounded-lg bg-highlight" />
        </div>
      ))}
    </div>
  )
}
