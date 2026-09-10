import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export const SIDEBAR_DEFAULT_WIDTH = 260
export const SIDEBAR_MIN_WIDTH = 200
export const SIDEBAR_MAX_WIDTH = 420
const STORAGE_KEY = 'rag_chatbot_sidebar_width'
const KEY_STEP = 16

const clampWidth = (v: number) => Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, v))

function readStoredWidth(): number {
  const raw = Number(localStorage.getItem(STORAGE_KEY))
  // 범위 밖 값(수동 변조 · 규격 변경)은 무시함 - 화면 밖으로 나간 사이드바를 복원하지 않기 위함
  if (!Number.isFinite(raw) || raw < SIDEBAR_MIN_WIDTH || raw > SIDEBAR_MAX_WIDTH) {
    return SIDEBAR_DEFAULT_WIDTH
  }
  return raw
}

/**
 * 데스크톱 사이드바의 폭 조절. 모바일 드로어는 이 컴포넌트를 쓰지 않는다(폭 고정).
 *
 * 끄는 동안에는 트랜지션을 걸지 않는다 - 매 프레임 값이 바뀌는데 트랜지션이 있으면
 * 손가락보다 늦게 따라와 고무줄처럼 보인다.
 */
export default function ResizableSidebar({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(readStoredWidth)
  const dragging = useRef(false)
  // 저장 시점에 최신 폭을 읽으려고 ref 로도 들고 있음 - 상태만 쓰면 리스너를 매 프레임 다시 걸어야 함
  const widthRef = useRef(width)
  widthRef.current = width

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      setWidth(clampWidth(e.clientX))
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.userSelect = ''
      localStorage.setItem(STORAGE_KEY, String(widthRef.current))
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    // **pointercancel 도 받는다**(#102). 브라우저가 제스처를 가로채거나 포인터가 사라지면
    // pointerup 이 오지 않는데, 그러면 dragging 이 참으로 남아 버튼을 누르지 않았는데도 폭이 계속
    // 따라오고 userSelect 도 'none' 인 채 남아 **앱 전체에서 텍스트 선택이 막힌다**
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      // 드래그 도중 언마운트되면(로그아웃 등) 리스너만 떼는 것으로는 부족하다 -
      // body 의 userSelect 는 이 컴포넌트 밖에 남는다
      if (dragging.current) document.body.style.userSelect = ''
    }
  }, [])

  /**
   * 드래그 시작.
   *
   * **포인터를 잡는다**(`setPointerCapture`, #102). 잡지 않으면 창 밖에서 버튼을 뗐을 때
   * `pointerup` 이 도달하지 않아 `dragging` 이 참으로 남는다 - 창으로 돌아오면 버튼을 누르지
   * 않았는데도 폭이 계속 따라오고, `userSelect: none` 도 복원되지 않아 **앱 전체에서 텍스트
   * 선택이 막힌다.** 캡처하면 그 창 자체가 없어진다 - 이후 포인터 이벤트가 이 요소로 온다.
   */
  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    dragging.current = true
    e.currentTarget.setPointerCapture?.(e.pointerId)
    // 안 걸면 끄는 동안 화면 글자가 선택돼 파랗게 반전됨 - 고장난 것처럼 보인다
    document.body.style.userSelect = 'none'
  }

  function nudge(delta: number) {
    setWidth((prev) => {
      const next = clampWidth(prev + delta)
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <div className="flex h-full">
      <div style={{ width }} className="h-full shrink-0 overflow-hidden">
        {children}
      </div>

      {/* 마우스가 없어도 조절할 수 있어야 하므로 탭으로 닿고 화살표 키를 받는다 */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="사이드바 폭 조절"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        tabIndex={0}
        onPointerDown={startDrag}
        onDoubleClick={() => {
          setWidth(SIDEBAR_DEFAULT_WIDTH)
          localStorage.setItem(STORAGE_KEY, String(SIDEBAR_DEFAULT_WIDTH))
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') nudge(-KEY_STEP)
          if (e.key === 'ArrowRight') nudge(KEY_STEP)
        }}
        className="group relative w-1 shrink-0 cursor-col-resize outline-none"
      >
        <span className="absolute inset-y-0 left-0 w-px bg-transparent transition-colors duration-150 ease-[var(--ease-out-quint)] group-hover:bg-accent group-focus-visible:bg-accent" />
      </div>
    </div>
  )
}
