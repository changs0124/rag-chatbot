import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Composer from './Composer'
import { ApiError } from '../../lib/api'
import { deleteAttachment, uploadFile } from '../../lib/endpoints'
import type { Attachment } from '../../lib/types'

vi.mock('../../lib/endpoints', () => ({
  uploadFile: vi.fn(),
  deleteAttachment: vi.fn(),
}))

const image = (name = 'photo_0001.png') => new File(['x'], name, { type: 'image/png' })
const attachment = (id: string): Attachment => ({ id, fileType: 'image', url: `/api/files/${id}?token=t` })

/** 해소 시점을 테스트가 쥐는 promise - "업로드 중" 상태를 관측하려면 필요함 */
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function pick(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('Composer', () => {
  // vitest globals 미사용이라 RTL 자동 정리가 안 걸림 - 렌더가 누적되지 않게 직접 정리함
  afterEach(cleanup)

  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(deleteAttachment).mockResolvedValue(undefined)
    // jsdom 에 없음. 회수(revoke)는 눈으로 확인되지 않아 이 스텁의 호출이 유일한 게이트임
    let seq = 0
    createObjectURL = vi.fn(() => `blob:mock/${seq++}`)
    revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
  })

  const noop = () => {}

  it('고른 즉시 카드가 뜨고 업로드가 시작됨 - 파일명은 화면 텍스트로 두지 않음', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())

    const thumb = screen.getByAltText('photo_0001.png') as HTMLImageElement
    expect(thumb.src).toBe('blob:mock/0')
    expect(uploadFile).toHaveBeenCalledTimes(1)
    // 응답을 기다리지 않고 카드부터 그림 + 취소용 signal 을 함께 넘김
    expect(vi.mocked(uploadFile).mock.calls[0][1]).toBeInstanceOf(AbortSignal)
    // 두 제품과 같은 구분 - 이미지 카드에는 파일명을 쓰지 않음(alt 로만 남김)
    expect(screen.queryByText('photo_0001.png')).not.toBeInTheDocument()
  })

  it('업로드가 끝나기 전에는 보내기가 막힘', async () => {
    const d = deferred<Attachment>()
    vi.mocked(uploadFile).mockReturnValue(d.promise)
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())
    fireEvent.change(screen.getByPlaceholderText('메시지를 입력하세요'), { target: { value: '이 사진 설명해줘' } })
    expect(screen.getByLabelText('보내기')).toBeDisabled()

    d.resolve(attachment('a1'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
  })

  it('올라간 카드를 지우면 서버 첨부도 지우고 미리보기 URL 을 회수함', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    fireEvent.click(screen.getByLabelText('첨부 제거'))

    expect(deleteAttachment).toHaveBeenCalledWith('a1')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock/0')
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
  })

  it('업로드 중에 카드를 지우면 요청을 끊고 오류로 표시하지 않음', async () => {
    const d = deferred<Attachment>()
    vi.mocked(uploadFile).mockReturnValue(d.promise)
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())
    const signal = vi.mocked(uploadFile).mock.calls[0][1] as AbortSignal
    fireEvent.click(screen.getByLabelText('첨부 제거'))

    expect(signal.aborted).toBe(true)
    // 지워서 끊은 것이므로 실패 카드가 되면 안 됨
    d.reject(new ApiError(0, '중단됨'))
    await waitFor(() => expect(screen.queryByText('재시도')).not.toBeInTheDocument())
    expect(deleteAttachment).not.toHaveBeenCalled()
  })

  it('지운 카드의 업로드가 뒤늦게 성공하면 그 파일을 서버에서 지움', async () => {
    const d = deferred<Attachment>()
    vi.mocked(uploadFile).mockReturnValue(d.promise)
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())
    fireEvent.click(screen.getByLabelText('첨부 제거'))
    // abort 는 요청을 끊을 뿐 서버가 이미 받은 것을 되돌리지 않음 - 안 지우면 고아로 남음
    d.resolve(attachment('a1'))

    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith('a1'))
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
  })

  it('업로드가 실패하면 재시도가 보이고 그 동안 보내기가 막힘', async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new ApiError(413, '파일이 너무 큽니다'))
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())
    fireEvent.change(screen.getByPlaceholderText('메시지를 입력하세요'), { target: { value: '설명해줘' } })
    await waitFor(() => expect(screen.getByText('재시도')).toBeInTheDocument())
    // 실패 카드를 둔 채 보내면 그 이미지가 빠진 줄 모르고 나감
    expect(screen.getByLabelText('보내기')).toBeDisabled()

    vi.mocked(uploadFile).mockResolvedValueOnce(attachment('a1'))
    fireEvent.click(screen.getByText('재시도'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    expect(uploadFile).toHaveBeenCalledTimes(2)
  })

  it('전송은 이미 올라간 id 로 나가고, 목록과 URL 을 정리함', async () => {
    vi.mocked(uploadFile)
      .mockResolvedValueOnce(attachment('a1'))
      .mockResolvedValueOnce(attachment('a2'))
    const onSend = vi.fn()
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image('photo_0001.png'))
    pick(image('photo_0002.png'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())

    fireEvent.change(screen.getByPlaceholderText('메시지를 입력하세요'), { target: { value: '두 장 설명해줘' } })
    fireEvent.click(screen.getByLabelText('보내기'))

    expect(onSend).toHaveBeenCalledWith('두 장 설명해줘', [attachment('a1'), attachment('a2')])
    // 전송 시점에는 업로드가 없음(이미 올라가 있음)
    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
  })

  it('전송 전 카드도 눌러서 확대할 수 있음 - 업로드 완료를 기다리지 않음', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())
    fireEvent.click(screen.getByLabelText('photo_0001.png 확대'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByAltText('photo_0001.png')).toHaveAttribute('src', 'blob:mock/0')
  })

  it('이미지를 끌어다 놓으면 첨부됨', async () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } })
    expect(screen.getByText('여기에 놓아 첨부')).toBeInTheDocument()

    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [image()] } })
    await waitFor(() => expect(screen.queryByText('여기에 놓아 첨부')).not.toBeInTheDocument())
    expect(uploadFile).toHaveBeenCalledTimes(1)
  })

  it('드래그가 자식 요소 경계를 지나도 오버레이가 깜빡이지 않음', () => {
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } })
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } })
    fireEvent.dragLeave(window, { dataTransfer: { types: ['Files'] } })
    // 안쪽 요소를 벗어난 것뿐이므로 아직 화면 안에 있음
    expect(screen.getByText('여기에 놓아 첨부')).toBeInTheDocument()

    fireEvent.dragLeave(window, { dataTransfer: { types: ['Files'] } })
    expect(screen.queryByText('여기에 놓아 첨부')).not.toBeInTheDocument()
  })

  it('이미지가 아닌 파일은 첨부되지 않음', () => {
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'report.pdf', { type: 'application/pdf' })] } })

    // 서버도 받지 않으므로 카드를 만들면 실패만 보여 주게 됨
    expect(uploadFile).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('첨부 제거')).not.toBeInTheDocument()
  })

  it('같은 파일을 두 번 골라도 각각 카드가 되고 각각 올라감', async () => {
    vi.mocked(uploadFile)
      .mockResolvedValueOnce(attachment('a1'))
      .mockResolvedValueOnce(attachment('a2'))
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)

    pick(image())
    pick(image())

    await waitFor(() => expect(screen.getAllByAltText('photo_0001.png')).toHaveLength(2))
    // 중복 제거는 범위 밖 - 고른 만큼 쌓이는 것이 지금 계약임
    expect(uploadFile).toHaveBeenCalledTimes(2)
  })

  it('텍스트 없이 첨부만으로도 전송됨', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    const onSend = vi.fn()
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image())
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    fireEvent.click(screen.getByLabelText('보내기'))

    expect(onSend).toHaveBeenCalledWith('', [attachment('a1')])
  })

  it('이미지를 붙여넣으면 첨부되고, 텍스트만 붙여넣으면 첨부가 생기지 않음', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={noop} streaming={false} onStop={noop} />)
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요')

    fireEvent.paste(textarea, { clipboardData: { files: [image()] } })
    expect(uploadFile).toHaveBeenCalledTimes(1)

    fireEvent.paste(textarea, { clipboardData: { files: [] } })
    expect(uploadFile).toHaveBeenCalledTimes(1)
  })
})
