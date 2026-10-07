import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import LoginPage from './LoginPage'

function renderLogin() {
  render(
    <BrowserRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </BrowserRouter>,
  )
}

describe('LoginPage', () => {
  it('renders the login form with a submit button', () => {
    renderLogin()
    expect(screen.getByText('계속하려면 로그인하세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
  })

  /**
   * 스스로 계정을 만드는 길이 화면에서 사라졌는지 본다(FEAT-AUTH-001).
   *
   * 「없음」만 단언하면 문구를 바꿔도 통과하므로, 대신 무엇이 있어야 하는지를 함께 고정한다 —
   * 진입점이 사라진 자리에 안내가 없으면 사용자는 어디로 가야 할지 모른 채 멈춘다.
   */
  it('가입 진입점 대신 관리자 발급 안내를 보여준다', () => {
    renderLogin()
    expect(screen.queryByText(/회원가입/)).not.toBeInTheDocument()
    expect(screen.getByText(/계정은 관리자가 발급합니다/)).toBeInTheDocument()
  })
})
