import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from '../auth/AuthContext'
import { setToken } from '../lib/api'
import AdminDocumentsPage from './AdminDocumentsPage'
import type { RagDocument } from '../lib/types'
import { deferred } from '../test/fixtures'

vi.mock('../lib/endpoints', () => ({
  listDocuments: vi.fn(),
  listAdminUsers: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
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

const { listDocuments, listAdminUsers, deleteDocument, syncDocuments, uploadDocument } = await import(
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
      <AuthProvider>
        <AdminDocumentsPage />
      </AuthProvider>
    </BrowserRouter>,
  )
}

// 행의 삭제 버튼 이름은 「<파일 이름> 삭제」다(#644) - 모달의 「삭제」와 겹치지 않는다
const ROW_DELETE = /^.+ 삭제$/

describe('문서 관리 화면', () => {
  beforeEach(() => {
    currentRole = 'admin'
    setToken('t')
    vi.mocked(listDocuments).mockResolvedValue([])
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
   * #330 : 폴링은 문서 목록만 다시 읽는다 - 지켜보는 것은 인덱싱 상태뿐이다. #513 뒤로 이 화면은 사용자 목록을 아예 읽지 않는다.
   */
  it('인덱싱 중이면 문서 목록만 폴링한다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'in_progress' })])
    renderPage()
    await screen.findByText('처리중')
    const before = vi.mocked(listDocuments).mock.calls.length

    await vi.advanceTimersByTimeAsync(6000)

    expect(vi.mocked(listDocuments).mock.calls.length).toBeGreaterThan(before)
    expect(listAdminUsers).not.toHaveBeenCalled()
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
    fireEvent.click(await screen.findByRole('button', { name: ROW_DELETE }))

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

    fireEvent.click(screen.getByRole('button', { name: ROW_DELETE }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('아직 문서가 없습니다')).toBeInTheDocument()

    await act(async () => late.resolve([doc({ status: 'completed' })]))

    expect(screen.queryByText('취업규칙.pdf')).not.toBeInTheDocument()
    expect(screen.getByText('아직 문서가 없습니다')).toBeInTheDocument()
  })

  // #615 : 목록 응답이 폴링 주기보다 늦으면 요청이 겹쳐, 먼저 나간 요청이 늦게 와서 뒤 요청의 새 상태를 옛 상태로 덮었다
  it('앞 폴링이 끝나기 전에는 다음 폴링을 보내지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'in_progress' })])
    renderPage()
    await screen.findByText('처리중')

    const slow = deferred<RagDocument[]>()
    vi.mocked(listDocuments).mockReturnValueOnce(slow.promise)
    await vi.advanceTimersByTimeAsync(5000)
    const sent = vi.mocked(listDocuments).mock.calls.length

    await vi.advanceTimersByTimeAsync(15000)
    expect(vi.mocked(listDocuments).mock.calls.length).toBe(sent)

    await act(async () => slow.resolve([doc({ status: 'in_progress' })]))
    await vi.advanceTimersByTimeAsync(5000)
    expect(vi.mocked(listDocuments).mock.calls.length).toBe(sent + 1)
  })

  // #624 : 요청 타임아웃이 없어, 응답도 실패도 없는 폴링 요청 하나가 #615 의 진행 중 표시를 붙잡아 폴링이 멈췄다
  it('응답이 없는 폴링 요청은 타임아웃으로 끊고 다음 틱에 다시 보낸다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(listDocuments).mockResolvedValue([doc({ status: 'in_progress' })])
    renderPage()
    await screen.findByText('처리중')

    // 타임아웃 신호를 직접 쥐고, 신호가 끊기면 요청도 실패하게 한다(fetch 와 같은 모양)
    const timeout = new AbortController()
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    onTestFinished(() => spy.mockRestore())
    vi.mocked(listDocuments).mockImplementationOnce(
      (signal?: AbortSignal) =>
        new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('timeout')))),
    )
    await vi.advanceTimersByTimeAsync(5000)
    const sent = vi.mocked(listDocuments).mock.calls.length

    await act(async () => timeout.abort())
    await vi.advanceTimersByTimeAsync(5000)

    expect(vi.mocked(listDocuments).mock.calls.length).toBe(sent + 1)
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
    fireEvent.click(await screen.findByRole('button', { name: ROW_DELETE }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '스토어와 동기화' }))
    expect(await screen.findByRole('status')).toHaveTextContent('이미 스토어와 맞습니다')
  })

  // #589 : 못 불러온 목록의 건수를 「0건」으로 보이면 다 지워졌다고 읽는다(#483 F4 와 같은 오독)
  it('첫 로드가 끝나기 전이나 실패하면 건수를 보이지 않는다', async () => {
    const slow = deferred<RagDocument[]>()
    vi.mocked(listDocuments).mockReturnValueOnce(slow.promise)
    renderPage()
    await waitFor(() => expect(listDocuments).toHaveBeenCalled()) // 로그인 확인 뒤에야 목록을 부른다
    expect(screen.getByRole('heading', { name: '문서' })).toBeInTheDocument()

    await act(async () => slow.reject(new Error('503')))
    expect(await screen.findByText('목록을 불러오지 못했습니다')).toBeInTheDocument()
    expect(screen.queryByText(/문서 0건/)).not.toBeInTheDocument()
  })

  // #589 : 사용자 관리(#483)와 같이 - 삭제가 도는 동안 다시 지우지 않고, 새 시도는 이전 오류를 걷는다
  it('삭제가 도는 동안은 다시 지우지 않고, 새 시도는 이전 오류를 지운다', async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc(), doc({ id: 'd2', filename: '복무규정.pdf' })])
    vi.mocked(deleteDocument).mockRejectedValueOnce(new Error('boom'))
    renderPage()
    const [first] = await screen.findAllByRole('button', { name: ROW_DELETE })
    fireEvent.click(first)
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(await screen.findByText('삭제하지 못했습니다')).toBeInTheDocument()

    const slow = deferred<void>()
    vi.mocked(deleteDocument).mockReturnValueOnce(slow.promise)
    fireEvent.click(screen.getAllByRole('button', { name: ROW_DELETE })[0])
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }))
    expect(screen.queryByText('삭제하지 못했습니다')).not.toBeInTheDocument()
    for (const b of screen.getAllByRole('button', { name: /삭제/ })) expect(b).toBeDisabled()

    await act(async () => slow.resolve())
    expect(deleteDocument).toHaveBeenCalledTimes(2)
  })

  // #513 : 사용자 목록 · 발급 · 초기화 · 삭제는 사용자 관리 화면에만 있다
  it('문서 관리 화면에는 사용자 구역이 없다', async () => {
    renderPage()

    await screen.findByText('아직 문서가 없습니다')
    expect(screen.queryByRole('heading', { name: /사용자/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '계정 추가' })).not.toBeInTheDocument()
  })

  // #644 : 업로드 칸은 키보드로 닿아야 하고(display:none 금지), 행의 삭제 버튼은 파일 이름으로 구분된다
  it('업로드 칸에 Tab 으로 닿고, 삭제 버튼 이름에 파일 이름이 붙는다', async () => {
    vi.mocked(listDocuments).mockResolvedValue([doc(), doc({ id: 'd2', filename: '복무규정.pdf' })])
    const { container } = renderPage()
    await screen.findByText('복무규정.pdf')

    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    // jsdom 은 Tailwind CSS 를 적용하지 않아 `hidden` 이어도 focus() 가 성공한다 - 실제로 지키는 단언은 바로 아래 클래스 검사이고,
    // 포커스 두 줄은 sr-only 입력이 포커스 가능한 요소로 남았는지만 본다. Tab 도달은 브라우저 탐침(#644 증거)이 정본
    expect(input).not.toHaveClass('hidden')
    input.focus()
    expect(input).toHaveFocus()
    expect(screen.getByRole('button', { name: '복무규정.pdf 삭제' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: ROW_DELETE })).toHaveLength(2)
  })
})
