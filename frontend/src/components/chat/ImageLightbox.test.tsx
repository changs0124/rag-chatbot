import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ImageLightbox from './ImageLightbox'

const items = [
  { src: 'blob:a', name: 'a.png' },
  { src: 'blob:b', name: 'b.png' },
]

/** 두 손가락으로 벌리는 동작 - 시작 거리에서 끝 거리까지 */
function pinch(target: HTMLElement, from: number, to: number) {
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 0, clientY: 0 })
  fireEvent.pointerDown(target, { pointerId: 2, clientX: from, clientY: 0 })
  fireEvent.pointerMove(target, { pointerId: 2, clientX: to, clientY: 0 })
  fireEvent.pointerUp(target, { pointerId: 2, clientX: to, clientY: 0 })
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 0, clientY: 0 })
}

describe('ImageLightbox', () => {
  it('두 손가락으로 벌리면 확대됨', () => {
    render(<ImageLightbox items={items} startIndex={0} onClose={vi.fn()} />)
    const img = screen.getByAltText('a.png')

    pinch(img, 100, 200)
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(2)' })
  })

  it('오므려도 화면 맞춤(1배) 아래로는 내려가지 않음', () => {
    render(<ImageLightbox items={items} startIndex={0} onClose={vi.fn()} />)
    const img = screen.getByAltText('a.png')

    pinch(img, 200, 50)
    // 1배 미만으로 줄면 이미지가 화면 가운데 점처럼 남아 되돌릴 방법이 안 보임
    expect(img).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' })
  })

  it('이미지를 넘기면 확대 상태를 들고 가지 않음', () => {
    render(<ImageLightbox items={items} startIndex={0} onClose={vi.fn()} />)
    pinch(screen.getByAltText('a.png'), 100, 300)

    fireEvent.click(screen.getByLabelText('다음 이미지'))
    // 다음 장이 확대된 채 열리면 엉뚱한 위치가 잘려 보임
    expect(screen.getByAltText('b.png')).toHaveStyle({ transform: 'translate(0px, 0px) scale(1)' })
  })

  it('확대 상태에서 끌면 이미지가 따라 움직임', () => {
    render(<ImageLightbox items={items} startIndex={0} onClose={vi.fn()} />)
    const img = screen.getByAltText('a.png')
    pinch(img, 100, 200)

    fireEvent.pointerDown(img, { pointerId: 3, clientX: 0, clientY: 0 })
    fireEvent.pointerMove(img, { pointerId: 3, clientX: 30, clientY: 20 })
    fireEvent.pointerUp(img, { pointerId: 3, clientX: 30, clientY: 20 })

    expect(img).toHaveStyle({ transform: 'translate(30px, 20px) scale(2)' })
  })

  describe('내려받기', () => {
    let click: ReturnType<typeof vi.spyOn>
    let saved: string[]

    function setup(res: { ok: boolean; status: number; type?: string }) {
      saved = []
      vi.stubGlobal(
        'fetch',
        vi.fn(() =>
          Promise.resolve({
            ok: res.ok,
            status: res.status,
            blob: () => Promise.resolve(new Blob(['x'], { type: res.type ?? 'application/json' })),
          }),
        ),
      )
      vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:dl'), revokeObjectURL: vi.fn() })
      click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download)
      })
    }

    afterEach(() => {
      click.mockRestore()
      vi.unstubAllGlobals()
    })

    /**
     * #324 F3 : 서명 URL 이 만료되면 백엔드는 404 JSON 을 돌려준다. 상태를 안 보면
     * 그 JSON 을 그림 파일로 저장한다 - 실패면 아무것도 저장하지 않는다.
     */
    it('응답이 실패면 저장하지 않음', async () => {
      setup({ ok: false, status: 404 })
      render(<ImageLightbox items={[{ src: 'https://api/x' }]} startIndex={0} onClose={vi.fn()} />)

      fireEvent.click(screen.getByLabelText('내려받기'))

      await waitFor(() => expect(fetch).toHaveBeenCalled())
      await Promise.resolve()
      expect(URL.createObjectURL).not.toHaveBeenCalled()
      expect(click).not.toHaveBeenCalled()
    })

    /** #324 F3 : 이름 없이 넘어온 첨부도 확장자가 붙어 저장된다(blob.type 기준) */
    it('이름이 없으면 받은 형식의 확장자를 붙여 저장함', async () => {
      setup({ ok: true, status: 200, type: 'image/png' })
      render(<ImageLightbox items={[{ src: 'https://api/x' }]} startIndex={0} onClose={vi.fn()} />)

      fireEvent.click(screen.getByLabelText('내려받기'))

      await waitFor(() => expect(click).toHaveBeenCalled())
      expect(saved).toEqual(['image.png'])
    })

    /**
     * #481 : 전송 전 카드 · 답변 속 문서 그림은 blob:/data: 이다. 운영 CSP connect-src 가
     * 둘을 허용하지 않으므로 fetch 하면 조용히 실패한다 - 부르지 않고 그 주소로 바로 저장한다.
     */
    it.each(['blob:abc', 'data:image/png;base64,AAAA'])('%s 면 fetch 없이 그 주소로 저장함', async (src) => {
      setup({ ok: true, status: 200 })
      render(<ImageLightbox items={[{ src, name: 'p.png' }]} startIndex={0} onClose={vi.fn()} />)

      fireEvent.click(screen.getByLabelText('내려받기'))

      await waitFor(() => expect(click).toHaveBeenCalled())
      expect(fetch).not.toHaveBeenCalled()
      expect(saved).toEqual(['p.png'])
      // 주소의 소유자가 따로 있으므로 회수하지 않는다
      expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    })

    /** #481 : 이름 없는 data: 는 MIME 에서 확장자를, 그 밖은 png 를 붙인다. 앵커는 문서에 붙었다 떼어진다 */
    it.each([
      ['data:image/jpeg;base64,AAAA', 'image.jpg'],
      ['data:image/webp;base64,AAAA', 'image.webp'],
      ['data:image/gif;base64,AAAA', 'image.gif'],
      ['data:image/png;base64,AAAA', 'image.png'],
      ['data:image/bmp;base64,AAAA', 'image.png'],
      ['blob:abc', 'image.png'],
    ])('이름 없는 %s 는 %s 로 저장함', async (src, expected) => {
      setup({ ok: true, status: 200 })
      render(<ImageLightbox items={[{ src }]} startIndex={0} onClose={vi.fn()} />)

      fireEvent.click(screen.getByLabelText('내려받기'))

      await waitFor(() => expect(click).toHaveBeenCalled())
      expect(saved).toEqual([expected])
      expect(document.querySelector('a[download]')).toBeNull()
    })

    /** #481 : 서명 URL(https)은 지금처럼 fetch 로 받아 저장한다 */
    it('https 면 기존대로 fetch 로 받아 저장함', async () => {
      setup({ ok: true, status: 200, type: 'image/png' })
      render(<ImageLightbox items={[{ src: 'https://api/x', name: 'p.png' }]} startIndex={0} onClose={vi.fn()} />)

      fireEvent.click(screen.getByLabelText('내려받기'))

      await waitFor(() => expect(click).toHaveBeenCalled())
      expect(fetch).toHaveBeenCalledWith('https://api/x')
    })
  })
})

// #484 F10
describe('ImageLightbox 대화상자 이름 (#484)', () => {
  it('role=dialog 에 이름이 있다', () => {
    render(<ImageLightbox items={items} startIndex={0} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: '이미지 보기' })).toBeInTheDocument()
  })
})
