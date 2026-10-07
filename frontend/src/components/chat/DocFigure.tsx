import { useEffect, useState } from 'react'
import { loadFigure } from '../../lib/docFigures'

/**
 * 답변 안의 문서 그림 한 장(FEAT-CHAT-004). Bearer 로 받아 objectURL 로 그린다 -
 * `<img src>` 는 헤더를 못 실어 인증 경로를 직접 걸 수 없다.
 *
 * 없는 그림(모델이 지어낸 키 · 서버에 그림 미배치)과 실패는 **아무것도 그리지 않는다.**
 * 깨진 이미지 아이콘이 답변 한가운데 남으면 답 전체가 고장 난 것처럼 보인다.
 */
export default function DocFigure({
  figureKey,
  onLoad,
  onOpen,
}: {
  figureKey: string
  /** 그림이 준비되면 그 URL 을 알린다 - 말풍선이 확대 보기 묶음을 만든다 */
  onLoad: (key: string, src: string) => void
  onOpen: (key: string) => void
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    loadFigure(figureKey)
      .then((url) => {
        if (!alive || !url) return
        setSrc(url)
        onLoad(figureKey, url)
      })
      .catch(() => {
        // 실패는 그리지 않음으로 끝낸다(위 주석). 401 은 loadFigure 가 로그인 화면으로 돌린다
      })
    return () => {
      alive = false
    }
  }, [figureKey, onLoad])

  if (!src) return null
  return (
    <button
      type="button"
      onClick={() => onOpen(figureKey)}
      aria-label="문서 그림 확대"
      className="my-2 block max-w-full overflow-hidden rounded-lg border border-line bg-white"
    >
      <img src={src} alt="문서 그림" data-doc-figure={figureKey} className="block max-h-80 max-w-full object-contain" />
    </button>
  )
}
