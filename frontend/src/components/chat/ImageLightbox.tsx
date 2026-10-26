import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { IconChevronLeft, IconChevronRight, IconClose, IconDownload } from '../icons'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function pointerDistance(points: Map<number, { x: number; y: number }>) {
  const [a, b] = Array.from(points.values())
  return Math.hypot(a.x - b.x, a.y - b.y)
}

interface LightboxItem {
  src: string
  name?: string
}

/**
 * 이미지 확대 보기. 전송 전 카드와 전송 후 말풍선이 같은 모달을 쓴다
 * (src 가 로컬 objectURL 이냐 서명 URL 이냐만 다름). 답변 속 문서 그림(`MessageList`)도 이 모달로 연다.
 *
 * 키 처리·배경 클릭·role 은 ConfirmModal 과 같은 규칙을 따른다(틀은 복제 — #105 §4).
 */
export default function ImageLightbox({
  items,
  startIndex,
  onClose,
}: {
  items: LightboxItem[]
  startIndex: number
  onClose: () => void
}) {
  const [index, setIndex] = useState(startIndex)
  const current = items[index]

  // 핀치 줌 - 모바일에서 확대는 화면 맞춤만으로 부족함(글자가 든 캡처가 대부분 안 읽힘)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinchStart = useRef({ dist: 0, scale: 1 })

  const resetZoom = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [])

  // 이미지를 넘기면 확대 상태를 들고 가지 않음 - 다음 장이 엉뚱한 위치에서 잘려 보임
  useEffect(resetZoom, [index, resetZoom])

  function onPointerDown(e: React.PointerEvent) {
    // 포인터가 이미지 밖으로 나가도 이동이 이어지게 함 - 확대한 상태에서는 손가락이 쉽게 벗어남
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      pinchStart.current = { dist: pointerDistance(pointers.current), scale }
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2) {
      const dist = pointerDistance(pointers.current)
      if (pinchStart.current.dist > 0) {
        const next = clamp(pinchStart.current.scale * (dist / pinchStart.current.dist), 1, 4)
        setScale(next)
        if (next === 1) setOffset({ x: 0, y: 0 })
      }
      return
    }
    // 확대 상태에서만 끌어서 이동함 - 1배에서 움직이면 화면이 이유 없이 흔들림
    if (scale > 1) {
      setOffset((o) => ({ x: o.x + (e.clientX - prev.x), y: o.y + (e.clientY - prev.y) }))
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchStart.current = { dist: 0, scale }
  }

  // 양 끝에서 순환하지 않음 - 한 장짜리 첨부에서 같은 이미지가 되돌아와 "넘어갔다"고 오해하게 됨
  const move = useCallback(
    (delta: number) => {
      setIndex((prev) => Math.min(items.length - 1, Math.max(0, prev + delta)))
    },
    [items.length],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') move(-1)
      if (e.key === 'ArrowRight') move(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, move])

  if (!current) return null

  /**
   * 백엔드가 다른 오리진이라 `<a download>` 만으로는 저장되지 않음(브라우저가 속성을 무시하고 새 탭으로 엶).
   * blob 으로 받아 저장하고 만든 URL 은 바로 회수함.
   * blob:/data: 는 운영 CSP connect-src 가 막아 fetch 가 조용히 실패함(#481) - 부르지 않고 그 주소로 바로 저장함.
   * 그 주소는 소유자가 따로 있으므로 회수하지 않음.
   */
  async function download() {
    if (/^(blob|data):/.test(current.src)) {
      const a = document.createElement('a')
      a.href = current.src
      // 이름이 없으면 data: 의 MIME 에서 확장자를 얻고, 알 수 없으면 png (blob: 은 형식을 알 수 없음)
      const mime = /^data:image\/(png|jpeg|webp|gif)[;,]/.exec(current.src)?.[1]
      a.download = current.name ?? `image.${mime === 'jpeg' ? 'jpg' : (mime ?? 'png')}`
      // 일부 브라우저(Firefox)는 문서에 붙지 않은 a 의 click 을 무시함
      document.body.appendChild(a)
      a.click()
      a.remove()
      return
    }
    try {
      const res = await fetch(current.src)
      // 서명 URL 이 만료되면 404 JSON 이 온다. 상태를 안 보면 그 JSON 이 그림 파일로 저장됨(#324)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      // 첨부는 원래 파일명을 모른다. 확장자가 없으면 OS 가 열 프로그램을 못 고르므로 받은 형식에서 붙임
      const ext = blob.type.startsWith('image/') ? '.' + blob.type.slice(6).split('+')[0] : ''
      a.download = current.name ?? `image${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // 만료·네트워크 실패. 저장만 못 한 것이므로 모달은 그대로 둠
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div className="absolute top-3 right-3 z-10 flex gap-1">
        <button
          type="button"
          onClick={download}
          aria-label="내려받기"
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
        >
          <IconDownload />
        </button>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="닫기"
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
        >
          <IconClose />
        </button>
      </div>

      {items.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={index === 0}
            aria-label="이전 이미지"
            className="absolute left-2 z-10 grid h-10 w-10 place-items-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <IconChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={index === items.length - 1}
            aria-label="다음 이미지"
            className="absolute right-2 z-10 grid h-10 w-10 place-items-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-30"
          >
            <IconChevronRight />
          </button>
        </>
      )}

      <img
        src={current.src}
        alt={current.name ?? '첨부 이미지'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? resetZoom() : setScale(2))}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        // touch-none : 브라우저 기본 제스처(스크롤·확대)가 먼저 먹으면 핀치 이벤트가 오지 않음
        className="relative max-h-[85vh] max-w-full touch-none rounded-lg object-contain"
      />

      {items.length > 1 && (
        <span className="absolute bottom-4 text-xs text-white/70">
          {index + 1} / {items.length}
        </span>
      )}
    </div>
  )
}
