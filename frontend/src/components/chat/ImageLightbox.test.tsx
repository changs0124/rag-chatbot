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
  })
})
