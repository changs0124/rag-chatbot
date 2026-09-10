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
/** 관리 메뉴 노출이 역할로 갈리므로 케이스마다 정한다 */
let currentRole: 'user' | 'admin' = 'user'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(() =>
        Promise.resolve({ id: 'u1', email: 'a@b.com', name: '사용자', theme: 'system', role: currentRole }),
      ),
    },
  }
})

const { updatePassword, updateTheme } = await import('../lib/endpoints')

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
  beforeEach(() => {
    setToken('old-token')
    currentRole = 'user'
  })
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
      user: { id: 'u1', email: 'a@b.com', name: '사용자', theme: 'system', role: 'user' },
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

  /**
   * TC-ADMIN-040 : 관리 메뉴는 관리자에게만 보인다.
   *
   * 노출 판단일 뿐 접근 제어가 아니다 — 눌러서 404 를 만나는 것보다 없는 편이 낫다는 것이지,
   * 막는 것은 서버다. 두 역할을 모두 확인해야 "항상 보임" 구현이 걸러진다.
   */
  it('일반 사용자에게는 관리 메뉴가 보이지 않는다', async () => {
    currentRole = 'user'
    renderMyPage()

    await screen.findByText('a@b.com')
    expect(screen.queryByText('문서 관리')).not.toBeInTheDocument()
  })

  it('관리자에게는 관리 메뉴가 보인다', async () => {
    currentRole = 'admin'
    renderMyPage()

    expect(await screen.findByText(/문서 관리/)).toBeInTheDocument()
  })

  /**
   * #78 - 테마 변경이 실패하면 화면을 되돌린다.
   *
   * 낙관적으로 먼저 적용하는 것은 의도다(왕복을 기다리면 클릭이 굼떠 보인다). 문제는 실패해도
   * 되돌리지 않아 **화면은 새 테마인데 서버는 옛 값**이었다는 것이다. `ThemeContext` 가
   * localStorage 에도 이미 저장해 둔 상태라, 다시 로그인해 서버 값이 적용될 때까지
   * **어느 쪽이 진짜인지 알 수 없었다.**
   *
   * 적용 결과는 `document.documentElement.dataset.theme` 에 드러나므로 그것으로 잰다.
   */
  it('테마 변경이 실패하면 이전 테마로 되돌아감', async () => {
    vi.mocked(updateTheme).mockRejectedValue(new Error('network'))
    renderMyPage()
    await screen.findByRole('button', { name: '다크' })
    const before = document.documentElement.dataset.theme

    fireEvent.click(screen.getByRole('button', { name: '다크' }))

    await waitFor(() => expect(screen.getByText(/오류|실패/)).toBeInTheDocument())
    expect(document.documentElement.dataset.theme).toBe(before)
  })

  /** 반대편 - 성공하면 새 테마가 그대로 남는다 */
  it('테마 변경이 성공하면 적용된 채로 남음', async () => {
    vi.mocked(updateTheme).mockResolvedValue({
      id: 'u1', email: 'a@b.com', name: '사용자', theme: 'dark', role: 'user',
    })
    renderMyPage()
    await screen.findByRole('button', { name: '다크' })

    fireEvent.click(screen.getByRole('button', { name: '다크' }))

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
  })
})
