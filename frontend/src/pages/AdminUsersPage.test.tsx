import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import { ApiError, setToken } from '../lib/api'
import AdminUsersPage from './AdminUsersPage'
import { primaryButtonClass } from '../components/primaryButton'
import { deferred } from '../test/fixtures'

vi.mock('../lib/endpoints', () => ({
  listDocuments: vi.fn(),
  listAdminUsers: vi.fn(),
  resetUserPassword: vi.fn(),
  createAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
}))

/** AuthProvider 가 기동 시 /api/auth/me 를 부른다. 역할에 따라 화면이 갈리므로 여기서 정한다 */
let currentRole: 'user' | 'admin' = 'admin'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(() =>
        Promise.resolve({ id: 'u1', email: 'a@b.com', name: '관리자', role: currentRole }),
      ),
    },
  }
})

const { listDocuments, listAdminUsers, resetUserPassword, createAdminUser, deleteAdminUser } = await import(
  '../lib/endpoints'
)

const SELF = { id: 'u1', email: 'a@b.com', name: '관리자', role: 'admin' as const }
const PARK = { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' as const }

function renderPage() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <AdminUsersPage />
      </AuthProvider>
    </BrowserRouter>,
  )
}

/** 행의 「비밀번호 초기화」 → 확인 창의 「초기화」 (#325) */
async function confirmReset() {
  fireEvent.click(await screen.findByRole('button', { name: /비밀번호 초기화/ }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '초기화' }))
}

/** 행의 「삭제」 → 확인 창의 「삭제」. 같은 이름의 버튼이 행과 창에 둘 있어 창 안에서 찾는다 */
async function confirmDelete() {
  fireEvent.click(await screen.findByRole('button', { name: '박사원 삭제' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '삭제' }))
}

describe('사용자 관리 화면', () => {
  beforeEach(() => {
    currentRole = 'admin'
    setToken('t')
    vi.mocked(listAdminUsers).mockResolvedValue([])
    vi.mocked(createAdminUser).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
  })

  afterEach(() => {
    setToken(null)
    vi.clearAllMocks()
  })

  // #483 : 못 불러온 사용자 목록을 「사용자 0명」으로 보이지 않는다
  it('첫 로드가 실패하면 사용자 수를 적지 않는다', async () => {
    vi.mocked(listAdminUsers).mockRejectedValueOnce(new Error('503'))
    renderPage()
    await screen.findByText('목록을 불러오지 못했습니다')

    expect(screen.getByRole('heading', { name: '사용자' })).toBeInTheDocument()
    expect(screen.queryByText(/사용자 0명/)).not.toBeInTheDocument()
  })

  /** 임시 비밀번호는 "다시 못 본다"와 "대상이 로그아웃된다"를 함께 알려야 한다 */
  it('임시 비밀번호 발급이 두 가지 사실을 함께 알린다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    vi.mocked(resetUserPassword).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()

    await confirmReset()

    expect(await screen.findByText('Xk7m-Qp29-Vr4t')).toBeInTheDocument()
    expect(screen.getByText(/다시 확인할 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByText(/기존 로그인은 모두 해제되었습니다/)).toBeInTheDocument()
  })

  /**
   * #253 : 일회용 비밀번호 창은 배경 클릭으로 닫히지 않는다 — 한 번 헛클릭하면 값을 다시 볼 수 없다.
   * Esc 와 「닫기」로는 닫힌다
   */
  it('일회용 비밀번호 창은 배경 클릭으로 닫히지 않고 Esc · 닫기로 닫힌다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    vi.mocked(resetUserPassword).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()

    await confirmReset()
    await screen.findByText('Xk7m-Qp29-Vr4t')
    const dialog = screen.getByRole('dialog')
    // 배경 요소가 있으면 그것을, 없으면 덮개 자체를 누른다 - 어느 쪽이든 「창 바깥」 클릭이다
    fireEvent.click(dialog.querySelector('[aria-hidden="true"]') ?? dialog)
    expect(screen.getByText('Xk7m-Qp29-Vr4t')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Xk7m-Qp29-Vr4t')).not.toBeInTheDocument())

    await confirmReset()
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '닫기' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  /** #330 : 발급 창 「닫기」도 주요 버튼이라 44px(h-11) 공용 클래스를 쓴다 */
  it('발급 창 「닫기」는 44px 주요 버튼이다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    vi.mocked(resetUserPassword).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()

    await confirmReset()
    const close = within(await screen.findByRole('dialog')).getByRole('button', { name: '닫기' })
    expect(close).toHaveClass('h-11')
    expect(close.className).toContain(primaryButtonClass)
  })

  /** #325 : 초기화는 되돌릴 수 없어(기존 로그인 전부 해제) 문서 삭제처럼 확인 창을 거친다 */
  it('비밀번호 초기화는 확인 창을 거친 뒤에만 요청한다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    vi.mocked(resetUserPassword).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /비밀번호 초기화/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/박사원/)).toBeInTheDocument()
    expect(within(dialog).getByText(/기존 로그인이 모두 해제됩니다/)).toBeInTheDocument()
    expect(resetUserPassword).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '초기화' }))
    await waitFor(() => expect(resetUserPassword).toHaveBeenCalledWith('u2'))
    expect(resetUserPassword).toHaveBeenCalledTimes(1)
  })

  it('확인 창에서 취소하면 초기화를 요청하지 않는다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /비밀번호 초기화/ }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(resetUserPassword).not.toHaveBeenCalled()
  })

  /** #325 : 연타로 두 번 나가면 늦게 온 응답이 이미 덮어써진 비밀번호를 보여 줄 수 있다 */
  it('초기화 요청 중에는 버튼이 비활성이고 연타해도 한 번만 요청한다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    const reset = deferred<{ temporaryPassword: string }>()
    vi.mocked(resetUserPassword).mockReturnValue(reset.promise)
    renderPage()

    const rowButton = await screen.findByRole('button', { name: /비밀번호 초기화/ })
    fireEvent.click(rowButton)
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: '초기화' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(rowButton).toBeDisabled())
    fireEvent.click(rowButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resetUserPassword).toHaveBeenCalledTimes(1)

    reset.resolve({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    expect(await screen.findByText('Xk7m-Qp29-Vr4t')).toBeInTheDocument()
    expect(rowButton).toBeEnabled()
    expect(resetUserPassword).toHaveBeenCalledTimes(1)
  })

  /** 자기 자신에게는 초기화 버튼을 띄우지 않는다 */
  it('자기 자신에게는 초기화 버튼이 없다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u1', email: 'a@b.com', name: '관리자', role: 'admin' },
    ])
    renderPage()

    await screen.findByText('a@b.com')
    expect(screen.queryByRole('button', { name: /비밀번호 초기화/ })).not.toBeInTheDocument()
  })

  /**
   * 계정 발급은 이 화면에만 있다(FEAT-AUTH-001). 스스로 가입하는 길이 없어졌으므로,
   * 이 폼이 사라지면 새 사용자가 <b>어디에서도</b> 태어나지 못한다.
   */
  it('계정을 발급하고 임시 비밀번호를 한 번 보여준다', async () => {
    vi.mocked(createAdminUser).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()

    fireEvent.change(await screen.findByLabelText('이메일'), {
      target: { value: 'new@b.com' },
    })
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '새사원' } })
    fireEvent.click(screen.getByRole('button', { name: '계정 추가' }))

    await waitFor(() => expect(createAdminUser).toHaveBeenCalledWith('new@b.com', '새사원'))
    expect(await screen.findByText('Xk7m-Qp29-Vr4t')).toBeInTheDocument()
    // 초기화와 달리 "기존 로그인 해제"가 아니라 "전달하세요"여야 한다 - 새 계정에는 끊을 세션이 없다
    expect(screen.getByText(/전달하세요/)).toBeInTheDocument()
    expect(screen.getByText(/다시 확인할 수 없습니다/)).toBeInTheDocument()
  })

  // 서버 상한(app.user.max-name-chars 기본값)과 같은 값 - 넘기면 서버가 400 으로 거절한다(#413)
  it('계정 발급 이름 입력은 50자까지만 받는다', async () => {
    renderPage()

    await screen.findByText('사용자 0명') // 비동기 조회가 끝난 뒤에 마친다
    expect(screen.getByLabelText('이름')).toHaveAttribute('maxLength', '50')
  })

  // #484 F10
  it('확인 창과 발급 창은 이름이 있는 대화상자다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    vi.mocked(resetUserPassword).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /비밀번호 초기화/ }))
    expect(screen.getByRole('dialog', { name: /박사원 님의 비밀번호를 초기화할까요/ })).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '초기화' }))
    expect(await screen.findByRole('dialog', { name: '임시 비밀번호가 발급되었습니다' })).toBeInTheDocument()
  })

  /** TC-ADMIN-041 : 일반 사용자는 되돌려진다(#513 - 나뉜 사용자 관리 화면도 같다) */
  it('일반 사용자는 사용자 관리 화면을 보지 못한다', async () => {
    currentRole = 'user'
    renderPage()

    await waitFor(() => expect(screen.queryByText('사용자 관리')).not.toBeInTheDocument())
    expect(listAdminUsers).not.toHaveBeenCalled()
  })

  // #513 : 문서 목록은 문서 관리 화면의 것이다 - 이 화면은 읽지 않는다
  it('사용자 관리 화면은 문서 목록을 읽지 않는다', async () => {
    renderPage()

    await screen.findByText('사용자 0명')
    expect(listDocuments).not.toHaveBeenCalled()
  })

  /** TC-ADMIN-089 : 삭제 버튼은 일반 사용자 행에만 있다 - 관리자(자기 자신 포함)는 서버도 400 으로 막는다 */
  it('삭제 버튼은 일반 사용자 행에만 있다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      SELF,
      { id: 'u3', email: 'kim@b.com', name: '김관리', role: 'admin' },
      PARK,
    ])
    renderPage()

    const parkRow = (await screen.findByText('park@b.com')).closest('li') as HTMLElement
    expect(within(parkRow).getByRole('button', { name: '박사원 삭제' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: / 삭제$/ })).toHaveLength(1)
  })

  /** TC-ADMIN-090 : 삭제는 확인 창을 거친다 - 대화 · 첨부가 함께 지워지고 되돌릴 수 없다는 것을 알린다 */
  it('사용자 삭제는 확인 창을 거친 뒤에만 요청하고 성공하면 목록을 다시 읽는다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([PARK])
    vi.mocked(deleteAdminUser).mockResolvedValue(undefined)
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '박사원 삭제' }))
    const dialog = await screen.findByRole('dialog', { name: '박사원 님을 삭제할까요?' })
    expect(within(dialog).getByText(/대화와 첨부가 함께 지워지며 되돌릴 수 없습니다/)).toBeInTheDocument()
    expect(deleteAdminUser).not.toHaveBeenCalled()

    vi.mocked(listAdminUsers).mockResolvedValue([])
    fireEvent.click(within(dialog).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(deleteAdminUser).toHaveBeenCalledWith('u2'))
    await waitFor(() => expect(screen.queryByText('park@b.com')).not.toBeInTheDocument())
    expect(screen.getByText('사용자 0명')).toBeInTheDocument()
  })

  it('삭제 확인 창에서 취소하면 요청하지 않는다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([PARK])
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '박사원 삭제' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleteAdminUser).not.toHaveBeenCalled()
  })

  /** 초기화와 같은 패턴 - 요청 중에는 행의 삭제 버튼이 막혀 확인 창을 다시 열 수 없고, 글자로 진행을 알린다 */
  it('삭제 요청 중에는 행 버튼이 비활성이고 다시 눌러도 확인 창이 열리지 않는다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([PARK])
    const del = deferred<void>()
    vi.mocked(deleteAdminUser).mockReturnValue(del.promise)
    renderPage()

    const rowButton = await screen.findByRole('button', { name: '박사원 삭제' })
    fireEvent.click(rowButton)
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '삭제' }))

    await waitFor(() => expect(rowButton).toBeDisabled())
    expect(rowButton).toHaveTextContent('삭제 중…')
    fireEvent.click(rowButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteAdminUser).toHaveBeenCalledTimes(1)

    del.resolve()
    await waitFor(() => expect(rowButton).toBeEnabled())
    expect(deleteAdminUser).toHaveBeenCalledTimes(1)
  })

  /** TC-ADMIN-091 : 409(문서를 올린 기록) 는 서버가 말한 이유를 그대로 배너에 보이고 목록은 그대로다 */
  it('삭제가 거절되면 서버 메시지를 오류 배너로 보인다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([PARK])
    vi.mocked(deleteAdminUser).mockRejectedValueOnce(
      new ApiError(409, '문서를 올린 기록이 있는 사용자는 삭제할 수 없음'),
    )
    renderPage()

    await confirmDelete()

    expect(await screen.findByRole('alert')).toHaveTextContent('문서를 올린 기록이 있는 사용자는 삭제할 수 없음')
    expect(screen.getByText('park@b.com')).toBeInTheDocument()
  })

  // 리뷰 반영 : 다른 관리자가 먼저 지워 404 가 와도 목록을 다시 읽어 사라진 행을 걷는다
  it('삭제가 실패해도 목록을 다시 읽는다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([PARK])
    vi.mocked(deleteAdminUser).mockRejectedValueOnce(new ApiError(404, '사용자 없음'))
    renderPage()
    await screen.findByText('park@b.com')
    vi.mocked(listAdminUsers).mockResolvedValue([])

    await confirmDelete()

    expect(await screen.findByRole('alert')).toHaveTextContent('사용자 없음')
    await waitFor(() => expect(screen.queryByText('park@b.com')).not.toBeInTheDocument())
  })

  // 리뷰 반영 : 늦게 온 옛 목록 응답이 새 응답을 덮지 않는다(문서 화면의 listGen 과 같은 세대 카운터)
  it('늦게 온 목록 응답은 나중에 나간 재조회 결과를 덮지 않는다', async () => {
    const first = deferred<typeof PARK[]>()
    vi.mocked(listAdminUsers)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue([])
    vi.mocked(createAdminUser).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()

    fireEvent.change(await screen.findByLabelText('이메일'), { target: { value: 'new@b.com' } })
    fireEvent.change(screen.getByLabelText('이름'), { target: { value: '새사원' } })
    fireEvent.click(screen.getByRole('button', { name: '계정 추가' }))
    expect(await screen.findByText('사용자 0명')).toBeInTheDocument()

    await act(async () => first.resolve([PARK]))

    expect(screen.queryByText('park@b.com')).not.toBeInTheDocument()
    expect(screen.getByText('사용자 0명')).toBeInTheDocument()
  })

  /** 행 버튼의 접근 가능한 이름에 대상이 들어간다 - 「삭제」만 여러 개면 화면 낭독기로는 누구인지 모른다 */
  it('행 버튼 이름에 사용자 이름이 붙는다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([PARK])
    renderPage()

    expect(await screen.findByRole('button', { name: '박사원 삭제' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '박사원 비밀번호 초기화' })).toBeInTheDocument()
  })
})
