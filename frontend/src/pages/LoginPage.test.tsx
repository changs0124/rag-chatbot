import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
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
  it('renders the login form with a submit button and signup toggle', () => {
    renderLogin()
    expect(screen.getByText('로그인하여 계속하세요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument()
    expect(screen.getByText('계정이 없으신가요? 회원가입')).toBeInTheDocument()
  })
})
