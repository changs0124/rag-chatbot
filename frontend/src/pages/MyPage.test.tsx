import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { getToken, setToken } from '../lib/api'
import MyPage from './MyPage'

vi.mock('../lib/endpoints', () => ({
  updateName: vi.fn(),
  updateTheme: vi.fn(),
  updatePassword: vi.fn(),
}))

// AuthProvider가 기동 시 /api/auth/me 를 부름 - 서버가 없으면 실패해 토큰을 지워 버리므로
// 토큰 저장소(getToken/setToken)는 실물을 쓰고 그 호출만 성공으로 세움
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn().mockResolvedValue({ id: 'u1', email: 'a@b.com', name: '사용자', theme: 'system' }),
    },
  }
})

const { updatePassword } = await import('../lib/endpoints')

/** 두 칸을 채우고 변경 버튼을 누름(버튼은 두 값이 다 차야 활성화됨) */
function submitPasswordChange() {
  fireEvent.change(screen.getByPlaceholderText('현재 비밀번호'), {
    target: { value: 'password123' },
  })
  fireEvent.change(screen.getByPlaceholderText('새 비밀번호 (8자 이상)'), {
    target: { value: 'newpassword1' },
  })
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))
}

function renderMyPage() {
  render(
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <MyPage />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>,
  )
}

describe('MyPage 비밀번호 변경', () => {
  beforeEach(() => setToken('old-token'))
  afterEach(() => {
    cleanup()
    setToken(null)
    vi.clearAllMocks()
  })

  /**
   * 서버가 변경 시각 이전 토큰을 전부 무효화하므로, 응답의 새 토큰으로 갈아 끼우지 않으면
   * "변경했습니다"를 띄운 직후부터 본인의 모든 요청이 401 이 됨(재리뷰 지적 1).
   */
  it('변경에 성공하면 응답의 새 토큰으로 교체함', async () => {
    vi.mocked(updatePassword).mockResolvedValue({
      token: 'new-token',
      user: { id: 'u1', email: 'a@b.com', name: '사용자', theme: 'system' },
    })
    renderMyPage()
    submitPasswordChange()

    await waitFor(() => expect(screen.getByText('비밀번호를 변경했습니다')).toBeInTheDocument())
    expect(getToken()).toBe('new-token')
  })

  it('변경에 실패하면 토큰을 건드리지 않음', async () => {
    vi.mocked(updatePassword).mockRejectedValue(new Error('boom'))
    renderMyPage()
    submitPasswordChange()

    await waitFor(() => expect(screen.getByText(/오류가 발생했습니다/)).toBeInTheDocument())
    expect(getToken()).toBe('old-token')
  })
})
