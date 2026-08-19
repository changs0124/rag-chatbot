import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import { ThemeProvider } from '../theme/ThemeContext'
import { setToken } from '../lib/api'
import AdminPage from './AdminPage'
import type { RagDocument } from '../lib/types'

vi.mock('../lib/endpoints', () => ({
  listDocuments: vi.fn(),
  listAdminUsers: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  resetUserPassword: vi.fn(),
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
        Promise.resolve({ id: 'u1', email: 'a@b.com', name: '관리자', theme: 'system', role: currentRole }),
      ),
    },
  }
})

const { listDocuments, listAdminUsers, deleteDocument, resetUserPassword } = await import(
  '../lib/endpoints'
)

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
      <ThemeProvider>
        <AuthProvider>
          <AdminPage />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>,
  )
}

describe('관리자 화면', () => {
  beforeEach(() => {
    currentRole = 'admin'
    setToken('t')
    vi.mocked(listDocuments).mockResolvedValue([])
    vi.mocked(listAdminUsers).mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
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

  /** TC-ADMIN-043 : 상태별 표시가 구분된다 */
  it('완료·처리중·실패가 각각 다른 문구로 보인다', async () => {
    vi.mocked(listDocuments).mockResolvedValue([
      doc({ id: 'a', status: 'completed' }),
      doc({ id: 'b', status: 'in_progress' }),
      doc({ id: 'c', status: 'failed' }),
    ])

    renderPage()

    expect(await screen.findByText('● 완료')).toBeInTheDocument()
    expect(screen.getByText('◐ 처리중')).toBeInTheDocument()
    expect(screen.getByText('⚠ 실패')).toBeInTheDocument()
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
   */
  it('인덱싱 중이면 폴링한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'in_progress' })])
    renderPage()
    await screen.findByText('◐ 처리중')
    const before = vi.mocked(listDocuments).mock.calls.length

    await vi.advanceTimersByTimeAsync(6000)

    expect(vi.mocked(listDocuments).mock.calls.length).toBeGreaterThan(before)
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
    await screen.findByText('● 완료')
    const before = vi.mocked(listDocuments).mock.calls.length

    await vi.advanceTimersByTimeAsync(20000)

    expect(vi.mocked(listDocuments).mock.calls.length).toBe(before)
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

  /** 임시 비밀번호는 "다시 못 본다"와 "대상이 로그아웃된다"를 함께 알려야 한다 */
  it('임시 비밀번호 발급이 두 가지 사실을 함께 알린다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u2', email: 'park@b.com', name: '박사원', role: 'user', createdAt: '2026-08-19T00:00:00Z' },
    ])
    vi.mocked(resetUserPassword).mockResolvedValue({ temporaryPassword: 'Xk7m-Qp29-Vr4t' })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: '비밀번호 초기화' }))

    expect(await screen.findByText('Xk7m-Qp29-Vr4t')).toBeInTheDocument()
    expect(screen.getByText(/다시 확인할 수 없습니다/)).toBeInTheDocument()
    expect(screen.getByText(/기존 로그인은 모두 해제되었습니다/)).toBeInTheDocument()
  })

  /** 자기 자신에게는 초기화 버튼을 띄우지 않는다 */
  it('자기 자신에게는 초기화 버튼이 없다', async () => {
    vi.mocked(listAdminUsers).mockResolvedValue([
      { id: 'u1', email: 'a@b.com', name: '관리자', role: 'admin', createdAt: '2026-08-19T00:00:00Z' },
    ])
    renderPage()

    await screen.findByText('a@b.com')
    expect(screen.queryByRole('button', { name: '비밀번호 초기화' })).not.toBeInTheDocument()
  })

  /** TC-ADMIN-041 : 일반 사용자는 되돌려진다 */
  it('일반 사용자는 관리 화면을 보지 못한다', async () => {
    currentRole = 'user'
    renderPage()

    await waitFor(() => expect(screen.queryByText('문서 관리')).not.toBeInTheDocument())
    // 되돌려졌으므로 목록 조회 자체가 일어나지 않는다
    expect(listDocuments).not.toHaveBeenCalled()
  })
})
