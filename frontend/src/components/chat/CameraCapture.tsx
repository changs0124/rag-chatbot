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

  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (videoRef.current) videoRef.current.srcObject = s
      })
      .catch(() => setError('카메라에 접근할 수 없습니다 (HTTPS·권한을 확인하세요)'))
    return () => stream?.getTracks().forEach((t) => t.stop())
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
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 p-4">
        {error ? (
          <p className="py-8 text-center text-sm text-red-400">{error}</p>
        ) : (
          <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg bg-black" />
        )}
        <div className="mt-3 flex justify-between">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-300 hover:bg-white/10">
            취소
          </button>
          {!error && (
            <button
              onClick={capture}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
            >
              촬영
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
