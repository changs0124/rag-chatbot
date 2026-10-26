import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import { setToken } from '../lib/api'
import AdminPage from './AdminPage'
import { primaryButtonClass } from '../components/primaryButton'
import type { RagDocument } from '../lib/types'
import { deferred } from '../test/fixtures'

vi.mock('../lib/endpoints', () => ({
  listDocuments: vi.fn(),
  listAdminUsers: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  resetUserPassword: vi.fn(),
  createAdminUser: vi.fn(),
  syncDocuments: vi.fn(),
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

const {
  listDocuments,
  listAdminUsers,
  deleteDocument,
  resetUserPassword,
  createAdminUser,
  syncDocuments,
  uploadDocument,
} = await import('../lib/endpoints')

function doc(over: Partial<RagDocument> = {}): RagDocument {
  return {
    id: 'd1',
    filename: '취업규칙.pdf',
    byteSize: 2_516_582,
    status: 'completed',
    uploadedByName: '김운영',
    createdAt: '2026-08-19T00:00:00Z',
    ...over,
  }
}

function renderPage() {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <AdminPage />
      </AuthProvider>
    </BrowserRouter>,
  )
}

/** 행의 「비밀번호 초기화」 → 확인 창의 「초기화」 (#325) */
async function confirmReset() {
  fireEvent.click(await screen.findByRole('button', { name: '비밀번호 초기화' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '초기화' }))
}

describe('관리자 화면', () => {
  beforeEach(() => {
    currentRole = 'admin'
    setToken('t')
    vi.mocked(listDocuments).mockResolvedValue([])
    vi.mocked(listAdminUsers).mockResolvedValue([])
    vi.mocked(createAdminUser).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
  })

  afterEach(() => {
    setToken(null)
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  /** TC-ADMIN-042 : 문서 0건이면 빈 상태 문구가 뜬다 */
  it('문서가 없으면 아직 시작하지 않은 상태임을 밝힌다', async () => {
    renderPage()

    expect(await screen.findByText('아직 문서가 없습니다')).toBeInTheDocument()
    // 0건은 "검색했는데 없다"가 아니다. 그 차이를 문구가 말해야 한다
    expect(screen.getByText(/자료 없음/)).toBeInTheDocument()
  })

  // #483 F4 : 못 불러온 것을 「없다」로 읽히게 하면 안 된다 - 관리자는 문서가 다 지워졌다고 읽는다
  it('첫 로드가 실패하면 빈 상태 문구 없이 오류만 보인다', async () => {
    vi.mocked(listDocuments).mockRejectedValueOnce(new Error('503'))
    renderPage()

    expect(await screen.findByText('목록을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText('아직 문서가 없습니다')).not.toBeInTheDocument()
  })

  // #483 : 첫 로드 실패는 폴링도 돌지 않는다 - 배너의 「다시 시도」로 다시 부르고, 성공하면 배너가 걷힌다
  it('첫 로드 실패 배너의 다시 시도가 목록을 다시 읽는다', async () => {
    vi.mocked(listDocuments).mockRejectedValueOnce(new Error('503'))
    renderPage()
    await screen.findByText('목록을 불러오지 못했습니다')
    vi.mocked(listDocuments).mockResolvedValue([doc()])

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(await screen.findByText('취업규칙.pdf')).toBeInTheDocument()
    expect(screen.queryByText('목록을 불러오지 못했습니다')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  // #483 : 못 불러온 사용자 목록을 「사용자 0명」으로 보이지 않는다
  it('첫 로드가 실패하면 사용자 수를 적지 않는다', async () => {
    vi.mocked(listAdminUsers).mockRejectedValueOnce(new Error('503'))
    renderPage()
    await screen.findByText('목록을 불러오지 못했습니다')

    expect(screen.getByRole('heading', { name: '사용자' })).toBeInTheDocument()
    expect(screen.queryByText(/사용자 0명/)).not.toBeInTheDocument()
  })

  /** TC-ADMIN-043 : 상태별 표시가 구분된다 */
  it('완료·처리중·실패가 각각 다른 문구로 보인다', async () => {
    vi.mocked(listDocuments).mockResolvedValue([
      doc({ id: 'a', status: 'completed' }),
      doc({ id: 'b', status: 'in_progress' }),
      doc({ id: 'c', status: 'failed' }),
    ])

    renderPage()

    expect(await screen.findByText('완료')).toBeInTheDocument()
    expect(screen.getByText('처리중')).toBeInTheDocument()
    expect(screen.getByText('실패')).toBeInTheDocument()
  })

  /**
   * TC-ADMIN-044 : 실패 문서에 설명이 붙는다.
   *
   * 아이콘만 검사하면 관리자가 "올라갔으니 됐다"고 오독하는 상태(REQ-ADMIN-003)가 그대로 통과한다.
   */
  it('인덱싱 실패에는 근거로 쓰이지 않는다는 설명이 붙는다', async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'failed' })])

    renderPage()

    expect(await screen.findByText(/답변 근거로 쓰이지 않습니다/)).toBeInTheDocument()
  })

  /**
   * TC-ADMIN-045 : 처리중 문서가 있으면 목록을 다시 읽는다.
   *
   * 가짜 타이머를 **렌더 전에** 건다 - 나중에 걸면 이미 실제 타이머로 만들어진 interval 을
   * 제어하지 못해 "폴링을 안 한다"는 잘못된 결론이 나온다. `shouldAdvanceTime` 이 있어야
   * 그 사이 프로미스(목록 조회)도 해소된다.
   *
   * #330 : 폴링은 문서 목록만 다시 읽는다 - 지켜보는 것은 인덱싱 상태뿐이라 사용자 목록까지 받을 이유가 없다.
   */
  it('인덱싱 중이면 문서 목록만 폴링한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'in_progress' })])
    renderPage()
    await screen.findByText('처리중')
    const before = vi.mocked(listDocuments).mock.calls.length
    const usersBefore = vi.mocked(listAdminUsers).mock.calls.length

    await vi.advanceTimersByTimeAsync(6000)

    expect(vi.mocked(listDocuments).mock.calls.length).toBeGreaterThan(before)
    expect(vi.mocked(listAdminUsers).mock.calls.length).toBe(usersBefore)
  })

  /**
   * TC-ADMIN-046 : 전부 종료 상태면 다시 읽지 않는다.
   *
   * 앞 케이스만 있으면 "영원히 폴링" 하는 구현도 통과한다. 멈추는 쪽을 함께 고정한다.
   */
  it('전부 완료면 폴링을 멈춘다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'completed' })])
    renderPage()
    await screen.findByText('완료')
    const before = vi.mocked(listDocuments).mock.calls.length

    await vi.advanceTimersByTimeAsync(20000)

    expect(vi.mocked(listDocuments).mock.calls.length).toBe(before)
  })

  /**
   * #324 F4 : 폴링이 한 번 실패해도 다음 폴링이 성공하면 목록 오류 배너는 걷힌다.
   * 배포 · 재기동 순간 한 번 실패한 배너가 목록이 계속 갱신되는 동안 남아 있으면 안 된다.
   */
  it('폴링이 한 번 실패한 뒤 성공하면 목록 오류가 사라진다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments)
      .mockResolvedValueOnce([doc({ status: 'in_progress' })])
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([doc({ status: 'in_progress' })])
    renderPage()
    await screen.findByText('처리중')

    await vi.advanceTimersByTimeAsync(5000)
    expect(await screen.findByText('목록을 불러오지 못했습니다')).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(5000)
    await waitFor(() => expect(screen.queryByText('목록을 불러오지 못했습니다')).not.toBeInTheDocument())
  })

  /** #324 F4 : 폴링 성공이 걷는 것은 목록 오류뿐이다 - 업로드 오류는 남는다 */
  it('폴링이 성공해도 업로드 오류는 남는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'in_progress' })])
    vi.mocked(uploadDocument).mockRejectedValueOnce(new Error('too big'))
    const { container } = renderPage()
    await screen.findByText('처리중')

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.pdf')] } })
    expect(await screen.findByText('업로드하지 못했습니다')).toBeInTheDocument()
    const before = vi.mocked(listDocuments).mock.calls.length

    await vi.advanceTimersByTimeAsync(5000)

    expect(vi.mocked(listDocuments).mock.calls.length).toBeGreaterThan(before)
    expect(screen.getByText('업로드하지 못했습니다')).toBeInTheDocument()
  })

  /** TC-ADMIN-053 : 스토어와 동기화하면 가져온 수를 알리고 목록을 다시 읽는다(#193) */
  it('스토어와 동기화하면 가져온 수를 알리고 목록을 다시 읽는다', async () => {
    vi.mocked(syncDocuments).mockResolvedValueOnce({ added: 2, total: 2 })
    renderPage()
    await screen.findByText('아직 문서가 없습니다')
    vi.mocked(listDocuments).mockResolvedValue([doc({ filename: '필드클레임현황.md' })])

    fireEvent.click(screen.getByRole('button', { name: '스토어와 동기화' }))

    expect(await screen.findByText('스토어에서 2건을 가져왔습니다')).toBeInTheDocument()
    expect(await screen.findByText('필드클레임현황.md')).toBeInTheDocument()
  })

  /** TC-ADMIN-054 : 더 가져올 것이 없으면 이미 맞다고 알린다 — 0건을 실패로 읽지 않게 */
  it('가져올 것이 없으면 이미 맞다고 알린다', async () => {
    vi.mocked(syncDocuments).mockResolvedValueOnce({ added: 0, total: 2 })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '스토어와 동기화' }))

    expect(await screen.findByText('이미 스토어와 맞습니다 (스토어 2건)')).toBeInTheDocument()
  })

  /** 삭제 확인 문구가 "옛 답변의 각주는 남는다"를 알려야 한다 */
  it('삭제 확인이 기존 답변의 출처는 남는다고 알린다', async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc()])
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }))

    expect(screen.getByText(/이미 나간 답변의 출처 표기는 그대로 남습니다/)).toBeInTheDocument()

    // 행과 모달에 같은 이름의 버튼이 둘 있다 - 모달 안에서 찾는다
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('d1'))
  })

  // #483 F13 : 삭제 직전에 떠난 폴링 응답이 삭제 뒤 refresh 보다 늦게 오면 지운 문서가 되살아나 보이면 안 된다
  it('삭제 뒤 refresh 보다 늦게 온 폴링 응답은 목록을 덮지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'in_progress' })])
    renderPage()
    await screen.findByText('처리중')

    const late = deferred<RagDocument[]>()
    vi.mocked(listDocuments).mockReturnValueOnce(late.promise).mockResolvedValue([])
    await vi.advanceTimersByTimeAsync(5000)

    fireEvent.click(screen.getByRole('button', { name: '삭제' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('아직 문서가 없습니다')).toBeInTheDocument()

    await act(async () => late.resolve([doc({ status: 'completed' })]))

    expect(screen.queryByText('취업규칙.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('아직 문서가 없습니다')).toBeInTheDocument()
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

    fireEvent.click(await screen.findByRole('button', { name: '비밀번호 초기화' }))
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

    fireEvent.click(await screen.findByRole('button', { name: '비밀번호 초기화' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(resetUserPassword).not.toHaveBeenCalled()
  })

  /** #325 : 연타로 두 번 나가면 늦게 온 응답이 이미 덮어써진 비밀번호를 보여 줄 수 있다 */
  it('초기화 요청 중에는 버튼이 비활성이고 연타해도 한 번만 요청한다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    let resolve!: (v: { temporaryPassword: string }) => void
    vi.mocked(resetUserPassword).mockReturnValue(new Promise((r) => (resolve = r)))
    renderPage()

    const rowButton = await screen.findByRole('button', { name: '비밀번호 초기화' })
    fireEvent.click(rowButton)
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: '초기화' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)

    await waitFor(() => expect(rowButton).toBeDisabled())
    fireEvent.click(rowButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(resetUserPassword).toHaveBeenCalledTimes(1)

    resolve({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
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
    expect(screen.queryByRole('button', { name: '비밀번호 초기화' })).not.toBeInTheDocument()
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

    await screen.findByText('아직 문서가 없습니다') // 비동기 조회가 끝난 뒤에 마친다
    expect(screen.getByLabelText('이름')).toHaveAttribute('maxLength', '50')
  })

  /** TC-ADMIN-041 : 일반 사용자는 되돌려진다 */
  it('일반 사용자는 관리 화면을 보지 못한다', async () => {
    currentRole = 'user'
    renderPage()

    await waitFor(() => expect(screen.queryByText('문서 관리')).not.toBeInTheDocument())
    // 되돌려졌으므로 목록 조회 자체가 일어나지 않는다
    expect(listDocuments).not.toHaveBeenCalled()
  })

  // #484 F6 : 오류는 alert, 성공·진행 알림은 status
  it('삭제 실패는 alert, 동기화 결과는 status 로 낭독된다', async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc()])
    vi.mocked(deleteDocument).mockRejectedValueOnce(new Error('boom'))
    vi.mocked(syncDocuments).mockResolvedValueOnce({ added: 0, total: 2 })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '삭제' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '스토어와 동기화' }))
    expect(await screen.findByRole('status')).toHaveTextContent('이미 스토어와 맞습니다')
  })

  // #484 F10
  it('확인 창과 발급 창은 이름이 있는 대화상자다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user' },
    ])
    vi.mocked(resetUserPassword).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: '비밀번호 초기화' }))
    expect(screen.getByRole('dialog', { name: /박사원 님의 비밀번호를 초기화할까요/ })).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '초기화' }))
    expect(await screen.findByRole('dialog', { name: '임시 비밀번호가 발급되었습니다' })).toBeInTheDocument()
  })
})
