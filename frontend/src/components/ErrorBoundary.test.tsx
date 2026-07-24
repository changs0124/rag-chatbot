import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

function Boom() {
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
