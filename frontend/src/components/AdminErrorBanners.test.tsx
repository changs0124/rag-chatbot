import { describe, it, expect, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import AdminErrorBanners from './AdminErrorBanners'
import { deferred } from '../test/fixtures'

// #675 : 「다시 시도」를 누른 동안 아무 표시가 없어 눌렸는지 모른 채 연타했다
describe('AdminErrorBanners 다시 시도', () => {
  it('다시 읽는 동안 버튼을 막고 진행 문구를 보이며, 끝나면 되돌린다', async () => {
    const pending = deferred<void>()
    const onRetry = vi.fn(() => pending.promise)
    render(<AdminErrorBanners listError="목록을 불러오지 못했습니다" error={null} loaded={false} onRetry={onRetry} />)

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    const busy = screen.getByRole('button', { name: '다시 읽는 중…' })
    expect(busy).toBeDisabled()
    fireEvent.click(busy)
    expect(onRetry).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve())
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled()
  })

  it('다시 읽기가 실패해도 버튼이 풀린다', async () => {
    const pending = deferred<void>()
    render(<AdminErrorBanners listError="목록을 불러오지 못했습니다" error={null} loaded={false} onRetry={() => pending.promise} />)
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await act(async () => {
      pending.reject(new Error('down'))
      await pending.promise.catch(() => {})
    })
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled()
  })
})
