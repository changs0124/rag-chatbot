import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

// 반환 타입을 never 로 명시함 - 추론에 맡기면 () => void 가 되어 JSX 컴포넌트로 쓸 수 없음(TS2786).
// 이 함수는 실제로 절대 반환하지 않으므로 never 가 사실에 맞는 표기임
function Boom(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  it('renders a recovery UI instead of a blank screen when a child throws (AC-17)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/문제가 발생했습니다/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
    spy.mockRestore()
  })
})
