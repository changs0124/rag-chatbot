import { useState } from 'react'

/*
 * 관리 화면(문서 · 사용자) 공용 오류 배너. 목록 로드 실패(listError)와 작업 실패(error)를 따로 띄운다.
 * 첫 로드 실패는 스스로 회복하지 않는다(문서 화면은 인덱싱 중에만 폴링하고, 사용자 화면은 폴링이 없다) -
 * 새로고침 대신 다시 부를 길을 둔다(#483)
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
  onRetry: () => Promise<unknown> | void
}) {
  // 다시 읽는 동안 버튼을 막고 진행 문구를 보인다(#675) - 느린 망에서 눌렸는지 모른 채 연타하지 않게
  const [retrying, setRetrying] = useState(false)
  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return [listError, error].map(
    (m, i) =>
      m && (
        <p key={i} role="alert" className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {m}
          {i === 0 && !loaded && (
            <button type="button" onClick={retry} disabled={retrying} className="ml-2 font-medium underline disabled:no-underline disabled:opacity-70">
              {retrying ? '다시 읽는 중…' : '다시 시도'}
            </button>
          )}
        </p>
      ),
  )
}
