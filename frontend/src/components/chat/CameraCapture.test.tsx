import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import CameraCapture from './CameraCapture'

/** 해소 시점을 테스트가 쥐는 promise - 「권한 대기 중」을 관측하려면 필요함 */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** getTracks().stop() 호출을 셀 수 있는 최소 MediaStream 대역 */
function fakeStream() {
  const stop = vi.fn()
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop }
}

function stubGetUserMedia(promise: Promise<MediaStream>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(() => promise) },
  })
}

/**
 * 카메라 트랙 정리 (#75).
 *
 * 정리 함수가 `.then` 보다 먼저 돌면 `stream` 이 아직 null 이라 아무것도 멈추지 않고,
 * 그 뒤 resolve 된 실사용 스트림은 **아무도 정지시키지 않는다** — 카메라 표시등이 탭을 닫을
 * 때까지 켜져 있다. 화면에 드러나지 않는 규칙이라 `stop()` 호출이 유일한 게이트다.
 */
describe('CameraCapture 트랙 정리', () => {
  afterEach(cleanup)

  /** 이 이슈의 핵심 - 권한 승인 전에 닫으면 뒤늦게 온 스트림도 멈춘다 */
  it('스트림이 도착하기 전에 닫아도 뒤늦게 온 트랙을 멈춤', async () => {
    const d = deferred<MediaStream>()
    stubGetUserMedia(d.promise)
    const { stream, stop } = fakeStream()
    const { unmount } = render(<CameraCapture onCapture={() => {}} onClose={() => {}} />)

    unmount() // 권한 다이얼로그가 떠 있는 동안 취소
    d.resolve(stream)

    await waitFor(() => expect(stop).toHaveBeenCalled())
  })

  /** 반대편 - 정상적으로 열린 뒤 닫으면 종전대로 멈춘다 */
  it('스트림이 도착한 뒤 닫으면 트랙을 멈춤', async () => {
    const { stream, stop } = fakeStream()
    stubGetUserMedia(Promise.resolve(stream))
    const { unmount } = render(<CameraCapture onCapture={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled())

    unmount()

    await waitFor(() => expect(stop).toHaveBeenCalled())
  })

  /** 떠난 뒤에는 오류 문구를 세우지 않는다 - 언마운트된 컴포넌트에 setState 하지 않기 위함 */
  it('닫은 뒤 도착한 실패는 화면을 건드리지 않음', async () => {
    const d = deferred<MediaStream>()
    stubGetUserMedia(d.promise)
    const { unmount, queryByText } = render(<CameraCapture onCapture={() => {}} onClose={() => {}} />)

    unmount()
    d.reject(new Error('denied'))
    await new Promise((r) => setTimeout(r, 0))

    expect(queryByText(/카메라에 접근할 수 없습니다/)).toBeNull()
  })
})
