import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Composer from './Composer'
import { ApiError } from '../../lib/api'
import { deleteAttachment, uploadFile } from '../../lib/endpoints'
import type { Attachment } from '../../lib/types'
import { deferred } from '../../test/fixtures'

vi.mock('../../lib/endpoints', () => ({
  uploadFile: vi.fn(),
  deleteAttachment: vi.fn(),
}))

const image = (name = 'photo_0001.png') => new File(['x'], name, { type: 'image/png' })
const attachment = (id: string): Attachment => ({ id, fileType: 'image', url: `/api/files/${id}?token=t` })

function pick(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [file] } })
}

describe('Composer', () => {
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
  // 전송을 받아들인 입력창 - 받아들였을 때만 비운다(#323)
  const accept = async () => true

  it('고른 즉시 카드가 뜨고 업로드가 시작됨 - 파일명은 화면 텍스트로 두지 않음', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(image())

    const thumb = screen.getByAltText('photo_0001.png') as HTMLImageElement
    expect(thumb.src).toBe('blob:mock/0')
    expect(uploadFile).toHaveBeenCalledTimes(1)
    // 응답을 기다리지 않고 카드부터 그림 + 취소용 signal 을 함께 넘김
    expect(vi.mocked(uploadFile).mock.calls[0][1]).toBeInstanceOf(AbortSignal)
    // 이미지 카드에는 파일명을 쓰지 않음(alt 로만 남김)
    expect(screen.queryByText('photo_0001.png')).not.toBeInTheDocument()
  })

  it('업로드가 끝나기 전에는 보내기가 막힘', async () => {
    const d = deferred<Attachment>()
    vi.mocked(uploadFile).mockReturnValue(d.promise)
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(image())
    fireEvent.change(screen.getByPlaceholderText('메시지를 입력하세요'), { target: { value: '이 사진 설명해줘' } })
    expect(screen.getByLabelText('보내기')).toBeDisabled()

    d.resolve(attachment('a1'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
  })

  it('올라간 카드를 지우면 서버 첨부도 지우고 미리보기 URL 을 회수함', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

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
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

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
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(image())
    fireEvent.click(screen.getByLabelText('첨부 제거'))
    // abort 는 요청을 끊을 뿐 서버가 이미 받은 것을 되돌리지 않음 - 안 지우면 고아로 남음
    d.resolve(attachment('a1'))

    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith('a1'))
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
  })

  it('업로드가 실패하면 재시도가 보이고 그 동안 보내기가 막힘', async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new ApiError(413, '파일이 너무 큽니다'))
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

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

  it('미리보기를 그리지 못하는 파일은 이미지를 빼고 카드 바탕만 남김 - 깨진 아이콘·파일명이 비치지 않음(#317)', async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new ApiError(400, '지원하지 않는 파일 형식: image/heic'))
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(new File(['x'], 'photo.heic', { type: 'image/heic' }))
    const card = screen.getByLabelText('photo.heic 확대')
    fireEvent.error(within(card).getByRole('img'))

    await waitFor(() => expect(screen.getByText('재시도')).toBeInTheDocument())
    expect(within(card).queryByRole('img')).toBeNull()
    // 파일명은 접근성 이름으로만 남는다
    expect(card).toHaveAccessibleName('photo.heic 확대')
  })

  it('전송은 이미 올라간 id 로 나가고, 목록과 URL 을 정리함', async () => {
    vi.mocked(uploadFile)
      .mockResolvedValueOnce(attachment('a1'))
      .mockResolvedValueOnce(attachment('a2'))
    const onSend = vi.fn(async () => true)
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image('photo_0001.png'))
    pick(image('photo_0002.png'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())

    fireEvent.change(screen.getByPlaceholderText('메시지를 입력하세요'), { target: { value: '두 장 설명해줘' } })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('보내기'))
    })

    expect(onSend).toHaveBeenCalledWith('두 장 설명해줘', [attachment('a1'), attachment('a2')], expect.any(Function))
    // 전송 시점에는 업로드가 없음(이미 올라가 있음)
    expect(uploadFile).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
  })

  it('서버에 닿기 전에 끊긴 턴은 보낸 글과 카드가 입력창에 돌아오고, 그사이 쓴 글은 남음 (#440)', async () => {
    vi.mocked(uploadFile).mockResolvedValueOnce(attachment('a1'))
    let giveBack: () => void = () => {}
    const onSend = vi.fn(async (_t: string, _a: Attachment[], back: () => void) => {
      giveBack = back
      return true
    })
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)
    const box = screen.getByPlaceholderText('메시지를 입력하세요') as HTMLTextAreaElement

    pick(image('photo_0001.png'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    fireEvent.change(box, { target: { value: '이 사진 설명해줘' } })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('보내기'))
    })
    expect(box.value).toBe('')
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()

    fireEvent.change(box, { target: { value: '추가로' } })
    act(() => giveBack())

    expect(box.value).toBe('이 사진 설명해줘\n추가로')
    // 보낼 때 회수한 미리보기는 파일에서 다시 만든다. 서버 첨부는 그대로라 다시 올리지 않는다
    const thumb = screen.getByAltText('photo_0001.png') as HTMLImageElement
    expect(thumb.src).toBe('blob:mock/1')
    expect(uploadFile).toHaveBeenCalledTimes(1)

    // 되돌린 카드는 다시 보내면 같은 첨부 id 로 나간다
    await act(async () => {
      fireEvent.click(screen.getByLabelText('보내기'))
    })
    expect(onSend).toHaveBeenLastCalledWith('이 사진 설명해줘\n추가로', [attachment('a1')], expect.any(Function))
  })

  it('글만 되돌리라고 하면 카드는 버리고 글만 돌아온다 (#480)', async () => {
    // 400 · 404 처럼 카드가 거절 원인일 수 있는 실패 - 카드까지 돌리면 다시 보내도 같은 거절이다
    vi.mocked(uploadFile).mockResolvedValueOnce(attachment('a1'))
    let giveBack: (textOnly?: boolean) => void = () => {}
    const onSend = vi.fn(async (_t: string, _a: Attachment[], back: (textOnly?: boolean) => void) => {
      giveBack = back
      return true
    })
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)
    const box = screen.getByPlaceholderText('메시지를 입력하세요') as HTMLTextAreaElement

    pick(image('photo_0001.png'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    fireEvent.change(box, { target: { value: '이 사진 설명해줘' } })
    await act(async () => {
      fireEvent.click(screen.getByLabelText('보내기'))
    })

    act(() => giveBack(true))

    expect(box.value).toBe('이 사진 설명해줘')
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
  })

  /**
   * #323 F2 - 받지 않은 전송은 입력을 지우지 않는다.
   *
   * 고치기 전에는 `onSend` 의 결과와 무관하게 비워, 새 대화 생성 왕복 중에 보낸 두 번째 메시지가 사라지고
   * 이미 올린 첨부는 서버에서 지우지도 않은 채 상태에서만 빠져 고아로 남았다.
   */
  // 한글 조합을 끝내려고 누른 Enter 는 전송이 아니다(#385) - 조합이 끝난 뒤의 Enter 만 보낸다
  it('한글 조합 중 Enter 는 보내지 않음', async () => {
    const onSend = vi.fn(accept)
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)
    const box = screen.getByPlaceholderText('메시지를 입력하세요')
    fireEvent.change(box, { target: { value: '안녕' } })

    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    })
    expect(onSend).not.toHaveBeenCalled()
    expect(box).toHaveValue('안녕')

    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('onSend 가 받지 않으면 입력과 첨부 카드가 남음', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    const onSend = vi.fn(async () => false)
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image())
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    const box = screen.getByPlaceholderText('메시지를 입력하세요')
    fireEvent.change(box, { target: { value: '남아야 함' } })
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' })
    })

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(box).toHaveValue('남아야 함')
    expect(screen.getByAltText('photo_0001.png')).toBeInTheDocument()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  /**
   * #349 - 받아들임이 생성 왕복 뒤에 정해지면 그때까지 비우지 않고, 받지 않았으면 남긴다.
   *
   * 고치기 전에는 `onSend` 의 반환을 기다리지 않아, 새 대화 생성이 실패해도 입력과 첨부 초안이 이미 비워져 있었다.
   */
  it('onSend 가 나중에 받지 않음으로 끝나면 입력과 첨부 카드가 남음', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    const settled = deferred<boolean>()
    const onSend = vi.fn(() => settled.promise)
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image())
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    const box = screen.getByPlaceholderText('메시지를 입력하세요')
    fireEvent.change(box, { target: { value: '남아야 함' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)

    await act(async () => {
      settled.resolve(false)
      await settled.promise
    })

    expect(box).toHaveValue('남아야 함')
    expect(screen.getByAltText('photo_0001.png')).toBeInTheDocument()
    expect(revokeObjectURL).not.toHaveBeenCalled()
  })

  /** #349 - 받아들임을 기다리는 사이 이어 쓴 글 · 더한 첨부는 받아들여진 뒤에도 남고, 보낸 카드만 걷힌다 */
  it('받아들임을 기다리는 사이 더한 입력과 첨부는 남음', async () => {
    vi.mocked(uploadFile)
      .mockResolvedValueOnce(attachment('a1'))
      .mockResolvedValueOnce(attachment('a2'))
    const settled = deferred<boolean>()
    const onSend = vi.fn(() => settled.promise)
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image('photo_0001.png'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    const box = screen.getByPlaceholderText('메시지를 입력하세요')
    fireEvent.change(box, { target: { value: '첫 질문' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    // 받아들여지기 전에는 비우지 않는다
    expect(box).toHaveValue('첫 질문')

    // 생성 왕복 중에 이어 쓰고 한 장 더 고른다
    fireEvent.change(box, { target: { value: '다음 질문' } })
    pick(image('photo_0002.png'))
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())

    await act(async () => {
      settled.resolve(true)
      await settled.promise
    })

    expect(onSend).toHaveBeenCalledWith('첫 질문', [attachment('a1')], expect.any(Function))
    expect(box).toHaveValue('다음 질문')
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
    expect(screen.getByAltText('photo_0002.png')).toBeInTheDocument()
    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  /** #349 - 받아들임을 기다리는 동안 보낸 카드를 지워도 곧 메시지에 실릴 첨부를 서버에서 지우지 않는다 */
  it('받아들임을 기다리는 동안 보낸 카드를 지워도 서버 첨부를 지우지 않음', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    const settled = deferred<boolean>()
    const onSend = vi.fn(() => settled.promise)
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image())
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    fireEvent.keyDown(screen.getByPlaceholderText('메시지를 입력하세요'), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledWith('', [attachment('a1')], expect.any(Function))

    fireEvent.click(screen.getByLabelText('첨부 제거'))
    expect(deleteAttachment).not.toHaveBeenCalled()

    await act(async () => {
      settled.resolve(true)
      await settled.promise
    })
    expect(deleteAttachment).not.toHaveBeenCalled()
    expect(screen.queryByAltText('photo_0001.png')).not.toBeInTheDocument()
  })

  // #483 F17 : 200 전 판정 중에는 정지가 아무 일도 하지 않는다 - 정지 버튼 대신 이유를 단 비활성 보내기를 보인다
  it('settling 이면 정지 버튼 대신 이유를 단 비활성 보내기가 보인다', () => {
    const onSend = vi.fn(async () => true)
    render(<Composer onSend={onSend} streaming settling onStop={noop} />)

    expect(screen.queryByLabelText('중단')).not.toBeInTheDocument()
    expect(screen.getByLabelText('보내기')).toBeDisabled()
    expect(screen.getByLabelText('보내기')).toHaveAttribute('title', '보낸 글이 저장됐는지 확인하는 중입니다')
  })

  /** #323 F1 - 이력 로딩 · 대화 생성 중(busy)에는 Enter 도 버튼도 보내지 않고 입력을 지우지 않는다 */
  it('busy 이면 Enter · 버튼 모두 보내지 않고 입력이 남음', () => {
    const onSend = vi.fn(async () => true)
    render(<Composer onSend={onSend} streaming={false} busy onStop={noop} />)

    const box = screen.getByPlaceholderText('메시지를 입력하세요')
    fireEvent.change(box, { target: { value: '남아야 함' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByLabelText('보내기')).toBeDisabled()
    // 이유 없는 회색 버튼은 고장으로 읽힌다(#101)
    expect(screen.getByLabelText('보내기')).toHaveAttribute('title', '대화를 준비하는 중에는 보낼 수 없습니다')
    fireEvent.click(screen.getByLabelText('보내기'))
    fireEvent.submit(box.closest('form')!)

    expect(onSend).not.toHaveBeenCalled()
    expect(box).toHaveValue('남아야 함')
  })

  /** #435 - 보내기와 중단이 같은 자리라, 빠른 두 번 탭의 두 번째가 중단으로 떨어져 질문이 끊겼다 */
  it('중단 버튼이 나타난 직후의 클릭은 무시하고, 잠시 뒤의 클릭은 중단한다 (#435)', () => {
    vi.useFakeTimers()
    try {
      const onStop = vi.fn()
      const { rerender } = render(<Composer onSend={accept} streaming={false} onStop={onStop} />)
      rerender(<Composer onSend={accept} streaming onStop={onStop} />)

      act(() => void vi.advanceTimersByTime(300))
      fireEvent.click(screen.getByLabelText('중단'))
      expect(onStop).not.toHaveBeenCalled()

      act(() => void vi.advanceTimersByTime(300))
      fireEvent.click(screen.getByLabelText('중단'))
      expect(onStop).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('전송 전 카드도 눌러서 확대할 수 있음 - 업로드 완료를 기다리지 않음', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(image())
    fireEvent.click(screen.getByLabelText('photo_0001.png 확대'))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByAltText('photo_0001.png')).toHaveAttribute('src', 'blob:mock/0')
  })

  it('이미지를 끌어다 놓으면 첨부됨', async () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } })
    expect(screen.getByText('여기에 놓아 첨부')).toBeInTheDocument()

    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [image()] } })
    await waitFor(() => expect(screen.queryByText('여기에 놓아 첨부')).not.toBeInTheDocument())
    expect(uploadFile).toHaveBeenCalledTimes(1)
  })

  it('드래그가 자식 요소 경계를 지나도 오버레이가 깜빡이지 않음', () => {
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } })
    fireEvent.dragEnter(window, { dataTransfer: { types: ['Files'] } })
    fireEvent.dragLeave(window, { dataTransfer: { types: ['Files'] } })
    // 안쪽 요소를 벗어난 것뿐이므로 아직 화면 안에 있음
    expect(screen.getByText('여기에 놓아 첨부')).toBeInTheDocument()

    fireEvent.dragLeave(window, { dataTransfer: { types: ['Files'] } })
    expect(screen.queryByText('여기에 놓아 첨부')).not.toBeInTheDocument()
  })

  it('이미지가 아닌 파일은 첨부되지 않음', () => {
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

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
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(image())
    pick(image())

    await waitFor(() => expect(screen.getAllByAltText('photo_0001.png')).toHaveLength(2))
    // 중복 제거는 범위 밖 - 고른 만큼 쌓이는 것이 지금 계약임
    expect(uploadFile).toHaveBeenCalledTimes(2)
  })

  it('텍스트 없이 첨부만으로도 전송됨', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    const onSend = vi.fn(async () => true)
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)

    pick(image())
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    fireEvent.click(screen.getByLabelText('보내기'))

    expect(onSend).toHaveBeenCalledWith('', [attachment('a1')], expect.any(Function))
  })

  it('이미지를 붙여넣으면 첨부되고, 텍스트만 붙여넣으면 첨부가 생기지 않음', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)
    const textarea = screen.getByPlaceholderText('메시지를 입력하세요')

    fireEvent.paste(textarea, { clipboardData: { files: [image()] } })
    expect(uploadFile).toHaveBeenCalledTimes(1)

    fireEvent.paste(textarea, { clipboardData: { files: [] } })
    expect(uploadFile).toHaveBeenCalledTimes(1)
  })

  /**
   * #80 - **네트워크 실패**(비 `ApiError`)에서 일반 문구로 떨어진다.
   *
   * `api.md` 오류 코드 표가 이 상황을 명시한다 — 약 32MB 를 넘기면 Tomcat 이 연결을 끊어
   * **상태 코드 없이 I/O 오류**가 온다(#70 에서 실측). 즉 「HTTP 오류가 아닌 실패」는 계약에 적힌
   * **정상 시나리오**다.
   *
   * `.catch` 가 `e.message` 를 무방비로 읽도록 바뀌면 `ApiError` 케이스는 계속 통과하고
   * **네트워크 실패에서만 조용히 깨진다.**
   */
  it('네트워크 실패는 일반 문구로 떨어지고 서버 메시지와 구분됨', async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new Error('Failed to fetch'))
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(image())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('업로드 실패')
    // 원본 예외 문구가 그대로 새 나가지 않는다 - 사용자에게 줄 말이 아니다
    expect(alert).not.toHaveTextContent('Failed to fetch')
    expect(screen.getByText('재시도')).toBeInTheDocument()
    expect(screen.getByLabelText('보내기')).toBeDisabled()
  })

  /**
   * 짝이 되는 케이스 — `ApiError` 는 **서버가 준 메시지**를 그대로 보여준다.
   *
   * 둘이 같은 문구면 위 케이스를 잠글 값어치가 준다. 구분되는지까지 단언한다.
   */
  it('ApiError 는 서버 메시지를 보여줘 일반 실패와 구분됨', async () => {
    vi.mocked(uploadFile).mockRejectedValueOnce(new ApiError(413, '파일이 너무 큽니다'))
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    pick(image())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('파일이 너무 큽니다')
    expect(alert).not.toHaveTextContent('업로드 실패')
  })

  /**
   * #101 - 업로드 실패 사유가 **텍스트로** 보인다.
   *
   * `title` 툴팁은 **터치 기기에서 뜨지 않아**, 모바일 사용자는 작은 경고 아이콘만 보고 전송 버튼이
   * 왜 회색인지 알 수 없다. `features.md` FEAT-CHAT-001 이 「서버가 준 메시지를 보여준다」를 요구한다.
   */
  it('업로드가 실패하면 사유가 화면 텍스트로 보임', async () => {
    const d = deferred<Attachment>()
    vi.mocked(uploadFile).mockReturnValue(d.promise)
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)
    pick(image())

    d.reject(new ApiError(400, '이미지 크기는 10MB 를 넘을 수 없습니다'))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('이미지 크기는 10MB 를 넘을 수 없습니다'),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('보낼 수 없습니다')
  })

  /** 반대편 - 실패가 없으면 그 줄이 뜨지 않는다 */
  it('실패가 없으면 오류 줄이 뜨지 않음', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)
    pick(image())

    await waitFor(() => expect(screen.getByAltText('photo_0001.png')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * #94 - 언마운트에서 진행 중인 업로드를 끊는다.
   *
   * 끊지 않으면 화면을 떠난 뒤에도 파일이 서버에 올라가고, 어떤 메시지에도 연결되지 않아
   * 회수 크론을 기다리는 고아가 된다.
   */
  it('언마운트하면 진행 중인 업로드를 끊음', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    const { unmount } = render(<Composer onSend={accept} streaming={false} onStop={noop} />)
    pick(image())
    const signal = vi.mocked(uploadFile).mock.calls[0][1] as AbortSignal
    expect(signal.aborted).toBe(false)

    unmount()

    expect(signal.aborted).toBe(true)
  })

  /**
   * abort 보다 먼저 서버가 받아 버린 업로드는 <b>뒤늦게 성공</b>한다.
   *
   * abort 는 서버가 이미 받은 것을 되돌리지 않으므로 기존 회수 경로가 그대로 돌아야 한다 -
   * 이유는 Composer.tsx 언마운트 정리 effect 주석.
   */
  it('언마운트 뒤 뒤늦게 성공한 업로드는 서버에서도 지움', async () => {
    const d = deferred<Attachment>()
    vi.mocked(uploadFile).mockReturnValue(d.promise)
    const { unmount } = render(<Composer onSend={accept} streaming={false} onStop={noop} />)
    pick(image())

    unmount()
    d.resolve(attachment('a1'))

    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith('a1'))
  })

  /** 이미 올라간 첨부를 둔 채 떠나면 그 자리에서 지운다 - 뒤늦은 성공을 기다릴 것이 없다 */
  it('업로드가 끝난 첨부를 둔 채 언마운트하면 서버에서 지움', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a2'))
    const { unmount } = render(<Composer onSend={accept} streaming={false} onStop={noop} />)
    pick(image())
    await waitFor(() => expect(screen.getByAltText('photo_0001.png')).toBeInTheDocument())

    unmount()

    await waitFor(() => expect(deleteAttachment).toHaveBeenCalledWith('a2'))
  })

  describe('첨부 (+) 버튼 (#218 · #289)', () => {
    const original = window.matchMedia
    afterEach(() => {
      window.matchMedia = original
    })

    /** 포인터 종류만 흉내 냄 - 터치 환경에서도 앱 안 카메라가 없어야 함 */
    function pointer(coarse: boolean) {
      window.matchMedia = ((query: string) => ({
        matches: coarse && query === '(pointer: coarse)',
      })) as unknown as typeof window.matchMedia
    }

    it.each([
      ['터치', true],
      ['마우스·트랙패드', false],
    ])('%s 환경에서 + 는 메뉴 없이 기기 선택창을 바로 연다 - 「카메라」 항목 없음', (_, coarse) => {
      pointer(coarse)
      render(<Composer onSend={accept} streaming={false} onStop={noop} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const open = vi.spyOn(input, 'click').mockImplementation(() => {})

      fireEvent.click(screen.getByLabelText('첨부 추가'))

      expect(open).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('카메라')).toBeNull()
      expect(screen.queryByText('사진')).toBeNull()
    })

    it('선택창은 image/* 로 연다 - 형식을 좁히면 Android 가 카메라 없이 보관함으로 바로 들어간다 (#289)', () => {
      render(<Composer onSend={accept} streaming={false} onStop={noop} />)
      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      expect(input.accept).toBe('image/*')
      expect(input.multiple).toBe(true)
    })
  })

  // 서버 상한(app.chat.max-message-chars 기본값)과 같은 값 - 넘기면 서버가 400 으로 거절한다(#371)
  it('입력창은 4000자까지만 받는다 (#371)', () => {
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    expect(screen.getByPlaceholderText('메시지를 입력하세요')).toHaveAttribute('maxLength', '4000')
  })

  // 서버 상한(app.chat.max-attachments 기본값)과 같은 값 - 넘기면 서버가 400 으로 거절한다(#401)
  it('첨부는 5장까지만 받고 넘친 것은 올리지 않고 알린다 (#401)', () => {
    vi.mocked(uploadFile).mockReturnValue(deferred<Attachment>().promise)
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [image('p1.png'), image('p2.png'), image('p3.png')] } })
    fireEvent.change(input, { target: { files: [image('p4.png'), image('p5.png'), image('p6.png')] } })

    expect(uploadFile).toHaveBeenCalledTimes(5)
    expect(screen.queryByAltText('p6.png')).not.toBeInTheDocument()
    // 넘친 파일에는 미리보기 URL 도 만들지 않는다 - 만들면 회수할 카드가 없다
    expect(createObjectURL).toHaveBeenCalledTimes(5)
    expect(screen.getByRole('alert')).toHaveTextContent('첨부는 한 번에 5장까지 보낼 수 있습니다')
  })

  it('카드를 지우면 상한 안내가 걷히고 다시 첨부할 수 있다 (#401)', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    render(<Composer onSend={accept} streaming={false} onStop={noop} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((n) => image(`${n}.png`)) },
    })
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    fireEvent.click(screen.getAllByLabelText('첨부 제거')[0])

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    pick(image('p7.png'))
    expect(screen.getByAltText('p7.png')).toBeInTheDocument()
    expect(uploadFile).toHaveBeenCalledTimes(6)
  })

  it('되돌린 카드와 그사이 더한 카드가 5장을 넘으면 뒤에 더한 것을 걷고 알린다 (#440)', async () => {
    let seq = 0
    vi.mocked(uploadFile).mockImplementation(async () => attachment(`a${++seq}`))
    let giveBack: () => void = () => {}
    const onSend = vi.fn(async (_t: string, _a: Attachment[], back: () => void) => {
      giveBack = back
      return true
    })
    render(<Composer onSend={onSend} streaming={false} onStop={noop} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(input, { target: { files: ['s1', 's2', 's3'].map((n) => image(`${n}.png`)) } })
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    await act(async () => {
      fireEvent.click(screen.getByLabelText('보내기'))
    })
    fireEvent.change(input, { target: { files: ['n1', 'n2', 'n3'].map((n) => image(`${n}.png`)) } })
    await waitFor(() => expect(screen.getAllByLabelText('첨부 제거')).toHaveLength(3))
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(6))
    await act(async () => {})

    act(() => giveBack())

    expect(screen.getAllByLabelText('첨부 제거')).toHaveLength(5)
    expect(screen.getByAltText('s1.png')).toBeInTheDocument()
    expect(screen.queryByAltText('n3.png')).not.toBeInTheDocument()
    expect(deleteAttachment).toHaveBeenCalledWith('a6')
    expect(screen.getByRole('alert')).toHaveTextContent('나중에 추가한 사진을 뺐습니다')
  })

  it('언마운트 뒤에 온 되돌리기는 무시한다 (#440)', async () => {
    vi.mocked(uploadFile).mockResolvedValue(attachment('a1'))
    let giveBack: () => void = () => {}
    const onSend = vi.fn(async (_t: string, _a: Attachment[], back: () => void) => {
      giveBack = back
      return true
    })
    const { unmount } = render(<Composer onSend={onSend} streaming={false} onStop={noop} />)
    pick(image())
    await waitFor(() => expect(screen.getByLabelText('보내기')).toBeEnabled())
    await act(async () => {
      fireEvent.click(screen.getByLabelText('보내기'))
    })
    const made = createObjectURL.mock.calls.length
    unmount()

    giveBack()

    // 회수할 길이 없는 미리보기 URL 을 만들지 않는다
    expect(createObjectURL.mock.calls.length).toBe(made)
  })
})
