import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFigure, resetFigureCache, splitFigures, stripFigureMarkers } from './docFigures'

describe('splitFigures', () => {
  it('leaves plain text as one segment', () => {
    expect(splitFigures('그림 없는 답')).toEqual([{ type: 'text', text: '그림 없는 답' }])
  })

  it('cuts a marker line out and absorbs its own line breaks', () => {
    expect(splitFigures('순서는 다음과 같다.\n[[그림:tm-p061-f1]]\n이어서 SET 을 누른다.')).toEqual([
      { type: 'text', text: '순서는 다음과 같다.' },
      { type: 'figure', key: 'tm-p061-f1' },
      { type: 'text', text: '이어서 SET 을 누른다.' },
    ])
  })

  it('keeps an off-format marker as text', () => {
    // 대문자·밑줄은 서버가 404 로 막는 형식이라 그림으로 보지 않는다
    expect(splitFigures('[[그림:TM_p1]]')).toEqual([{ type: 'text', text: '[[그림:TM_p1]]' }])
  })

  it.each(['[', '[[', '[[그', '[[그림:', '[[그림:tm-p0', '[[그림:tm-p061-f1]'])(
    'hides a half-arrived marker %j while streaming',
    (tail) => {
      expect(splitFigures(`설명\n${tail}`, true)).toEqual([{ type: 'text', text: '설명\n' }])
    },
  )

  it('does not cut a finished answer that happens to end with [', () => {
    expect(splitFigures('배열은 [', false)).toEqual([{ type: 'text', text: '배열은 [' }])
  })

  it('does not cut an ordinary bracket while streaming', () => {
    expect(splitFigures('출처 [1]', true)).toEqual([{ type: 'text', text: '출처 [1]' }])
  })
})

describe('loadFigure', () => {
  beforeEach(() => {
    resetFigureCache()
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fig') })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('returns an object URL and asks only once', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['png']), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadFigure('tm-p061-f1')).toBe('blob:fig')
    expect(await loadFigure('tm-p061-f1')).toBe('blob:fig')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('remembers a missing figure as null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadFigure('tm-p999-f1')).toBeNull()
    expect(await loadFigure('tm-p999-f1')).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forgets a network failure so the next render retries', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(new Response(new Blob(['png']), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadFigure('tm-p061-f2')).rejects.toThrow('network')
    expect(await loadFigure('tm-p061-f2')).toBe('blob:fig')
  })
})

describe('stripFigureMarkers', () => {
  it('replaces every marker in a citation snippet with a short placeholder', () => {
    expect(stripFigureMarkers('앞 [[그림:tm-p062-f2]] (그림 설명: 가) 뒤 [[그림:tm-p062-f3]]')).toBe(
      '앞 [그림] (그림 설명: 가) 뒤 [그림]',
    )
  })
})
