import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import { getToken, setToken } from '../lib/api'
import MyPage from './MyPage'

vi.mock('../lib/endpoints', () => ({
  updateName: vi.fn(),
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
        Promise.resolve({ id: 'u1', email: 'a@b.com', name: '사용자', role: currentRole }),
      ),
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
      <AuthProvider>
        <MyPage />
      </AuthProvider>
    </BrowserRouter>,
  )
}

describe('MyPage 비밀번호 변경', () => {
  beforeEach(() => {
    setToken('old-token')
    currentRole = 'user'
  })
  afterEach(() => {
    setToken(null)
    vi.clearAllMocks()
  })

  /**
   * 서버가 변경 시각 이전 토큰을 전부 무효화하므로, 응답의 새 토큰으로 갈아 끼우지 않으면
   * "변경했습니다"를 띄운 직후부터 본인의 모든 요청이 401 이 됨.
   */
  it('변경에 성공하면 응답의 새 토큰으로 교체함', async () => {
    vi.mocked(updatePassword).mockResolvedValue({
      token: 'new-token',
      user: { id: 'u1', email: 'a@b.com', name: '사용자', role: 'user' },
    })
    renderMyPage()
    submitPasswordChange()

    await waitFor(() => expect(screen.getByText('비밀번호를 변경했습니다')).toBeInTheDocument())
    expect(getToken()).toBe('new-token')
  })

  // 연타한 두 번째 요청은 바뀐 비밀번호로 401 이 되어 성공한 변경 위에 오류 문구를 덮는다(#359)
  it('변경 요청이 도는 동안 다시 누를 수 없다', async () => {
    let finish!: (v: Awaited<ReturnType<typeof updatePassword>>) => void
    vi.mocked(updatePassword).mockReturnValue(new Promise((r) => (finish = r)))
    renderMyPage()
    submitPasswordChange()
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(updatePassword).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeDisabled()
    finish({ token: 'new-token', user: { id: 'u1', email: 'a@b.com', name: '사용자', role: 'user' } })
    await waitFor(() => expect(screen.getByText('비밀번호를 변경했습니다')).toBeInTheDocument())
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
    expect(screen.queryByText('사용자 관리')).not.toBeInTheDocument()
  })

  // #513 : 관리 화면이 둘로 나뉘었다 - 링크도 둘이고 각자 제 경로로 간다
  it('관리자에게는 문서 관리 · 사용자 관리 두 링크가 보인다', async () => {
    currentRole = 'admin'
    renderMyPage()

    expect(await screen.findByRole('link', { name: '문서 관리' })).toHaveAttribute('href', '/admin/documents')
    expect(screen.getByRole('link', { name: '사용자 관리' })).toHaveAttribute('href', '/admin/users')
  })

  /**
   * #191 - 테마 전환을 걷었다. 화면은 라이트 하나라 고를 것이 없다.
   * 선택기가 되살아나면 저장할 API 도 없이 버튼만 생긴다.
   */
  it('테마 선택 UI 가 없다', async () => {
    renderMyPage()
    await screen.findByText('비밀번호')
    expect(screen.queryByText('테마')).not.toBeInTheDocument()
    for (const label of ['라이트', '다크', '시스템']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
  })
})

describe('MyPage 이름 (#413)', () => {
  beforeEach(() => {
    setToken('old-token')
    currentRole = 'user'
  })
  afterEach(() => {
    setToken(null)
    vi.clearAllMocks()
  })

  // 서버 상한(app.user.max-name-chars 기본값)과 같은 값 - 넘기면 서버가 400 으로 거절한다
  it('이름 입력은 50자까지만 받는다', () => {
    renderMyPage()

    // 비밀번호 칸은 password 타입이라 textbox 는 이름 칸 하나다
    expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '50')
  })

  // #484 F7 : placeholder 는 이름이 아니다 - 입력하면 사라지고 낭독기는 「편집 가능 텍스트」로만 읽는다
  it('이름 · 비밀번호 입력에 접근 가능한 이름이 있다', () => {
    renderMyPage()

    expect(screen.getByLabelText('이름')).toHaveAttribute('maxLength', '50')
    expect(screen.getByLabelText('현재 비밀번호')).toBeInTheDocument()
    expect(screen.getByLabelText(/^새 비밀번호/)).toBeInTheDocument()
  })

  // #484 F6 : 성공은 status, 오류는 alert
  it('성공 알림은 status, 오류는 alert 로 낭독된다', async () => {
    vi.mocked(updatePassword).mockRejectedValueOnce(new Error('boom'))
    renderMyPage()
    submitPasswordChange()
    expect(await screen.findByRole('alert')).toHaveTextContent(/오류가 발생했습니다/)

    vi.mocked(updatePassword).mockResolvedValueOnce({
      token: 'new-token',
      user: { id: 'u1', email: 'a@b.com', name: '사용자', role: 'user' },
    })
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }))
    expect(await screen.findByRole('status')).toHaveTextContent('비밀번호를 변경했습니다')
  })
})
