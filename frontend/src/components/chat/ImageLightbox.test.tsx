import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  // vitest globals 미사용이라 RTL 자동 정리가 안 걸림 - 렌더가 누적되지 않게 직접 정리함
  afterEach(cleanup)

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
})
