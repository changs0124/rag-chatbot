/*
 * 관리 화면(문서 · 사용자) 공용 오류 배너. 목록 로드 실패(listError)와 작업 실패(error)를 따로 띄운다.
 * 첫 로드 실패는 문서 쪽 폴링도 돌지 않아 스스로 회복하지 않는다 - 새로고침 대신 다시 부를 길을 둔다(#483)
 */
export default function AdminErrorBanners({
  listError,
  error,
  loaded,
  onRetry,
}: {
  listError: string | null
  error: string | null
  loaded: boolean
  onRetry: () => void
}) {
  return [listError, error].map(
    (m, i) =>
      m && (
        <p key={i} role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {m}
          {i === 0 && !loaded && (
            <button type="button" onClick={onRetry} className="ml-2 font-medium underline">
              다시 시도
            </button>
          )}
        </p>
      ),
  )
}
