import { useEffect, useRef, useState } from 'react'

// 모바일 카메라 촬영(getUserMedia, HTTPS 필요). D-3 주 사용 흐름
export default function CameraCapture({
  onCapture,
  onClose,
}: {
  onCapture: (file: File) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * 카메라를 열고, 떠날 때 트랙을 멈춘다.
   *
   * **cancelled 표시가 필요하다**(#75). 정리 함수가 `.then` 보다 먼저 돌면 `stream` 이 아직 null 이라
   * 아무것도 멈추지 않고, 그 뒤 resolve 된 실사용 스트림은 **아무도 정지시키지 않는다** —
   * 카메라 표시등이 탭을 닫을 때까지 켜져 있다. 권한 다이얼로그가 떠 있거나 초기화 중(모바일에서
   * 1~2초)에 취소하면 그 창에 들어간다. React 19 StrictMode 는 개발 모드에서 effect 를
   * mount→cleanup→mount 로 두 번 돌리므로 **개발 환경에서는 열 때마다 매번** 샜다.
   */
  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        // 이미 떠난 뒤라면 그 자리에서 멈춘다 - 정리 함수는 이 스트림을 본 적이 없다
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => {
        if (cancelled) return
        setError('카메라에 접근할 수 없습니다 (HTTPS·권한을 확인하세요)')
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function capture() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (blob) {
          onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }))
          onClose()
        }
      },
      'image/jpeg',
      0.92,
    )
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true">
      {/* 영상이 주인공이라 안쪽은 어둡게 두되, 껍데기·버튼은 토큰을 쓴다 */}
      <div className="w-full max-w-md rounded-[1.75rem] bg-raised p-1.5 shadow-[var(--shadow-lifted)]">
        <div className="rounded-[1.375rem] bg-black/90 p-4">
          {error ? (
            <p className="py-8 text-center text-sm text-danger">{error}</p>
          ) : (
            <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl bg-black" />
          )}
          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={onClose}
              className="rounded-full px-4 py-2.5 text-sm text-white/80 transition duration-150 ease-[var(--ease-out-quint)] hover:bg-white/10 hover:text-white active:scale-[0.98]"
            >
              취소
            </button>
            {!error && (
              <button
                onClick={capture}
                className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink transition duration-150 ease-[var(--ease-out-quint)] hover:scale-[1.02] active:scale-[0.98]"
              >
                촬영
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
