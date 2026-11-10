import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import Markdown from './Markdown'

const TABLE = '| 구분 | 정의 |\n|---|---|\n| 설계불량 | 아주 긴 정의 |\n'

// 넓은 표(#643) - 가로 스크롤 상자는 키보드로 닿고, 오른쪽에 가린 열이 남았을 때만 페이드를 그린다
describe('Markdown 표', () => {
  afterEach(() => vi.restoreAllMocks())

  // jsdom 은 레이아웃이 없어 스크롤 폭을 직접 정한다
  function sizes(scrollWidth: number, clientWidth: number) {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth)
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth)
  }

  it('넘치는 표의 스크롤 상자는 이름 있는 region 이고 Tab 으로 닿는다 · 셀에 폭 상한', () => {
    sizes(900, 358)
    render(<Markdown text={TABLE} />)
    const region = screen.getByRole('region', { name: '표' })
    expect(region.tabIndex).toBe(0)
    expect(region.querySelector('table')).not.toBeNull()
    for (const cell of region.querySelectorAll('th, td')) expect(cell.className).toContain('max-w-[20rem]')
  })

  // #657 : 넘치지 않는 표마다 붙이면 답변의 표 수만큼 「표」 랜드마크 · Tab 정지점이 늘었다
  it('상자 안에 들어오는 표는 region · Tab 정지점이 없다', () => {
    sizes(700, 700)
    const { container } = render(<Markdown text={TABLE} />)
    expect(screen.queryByRole('region')).toBeNull()
    expect(container.querySelector('table')!.parentElement).not.toHaveAttribute('tabindex')
  })

  it('표가 상자 안에 들어오면 페이드가 없다', () => {
    sizes(700, 700)
    render(<Markdown text={TABLE} />)
    expect(screen.queryByTestId('table-fade')).toBeNull()
  })

  it('넘치면 페이드가 생기고, 끝까지 스크롤하면 사라진다', () => {
    sizes(900, 358)
    render(<Markdown text={TABLE} />)
    expect(screen.getByTestId('table-fade')).toBeInTheDocument()

    const region = screen.getByRole('region', { name: '표' })
    vi.spyOn(region, 'scrollLeft', 'get').mockReturnValue(542)
    act(() => {
      region.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByTestId('table-fade')).toBeNull()
  })
})
