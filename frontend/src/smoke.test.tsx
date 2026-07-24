import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

// Phase 0 스모크 테스트 - React + jsdom + Testing Library 하네스가 도는지 검증
function Ping() {
  return <span>pong</span>
}

describe('frontend smoke', () => {
  it('renders a component', () => {
    render(<Ping />)
    expect(screen.getByText('pong')).toBeInTheDocument()
  })
})
