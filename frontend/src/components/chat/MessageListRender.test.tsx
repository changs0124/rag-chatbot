import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import MessageList from './MessageList'
import type { ChatMessage } from '../../lib/types'

/*
 * 스트리밍 중 토큰이 올 때마다 지난 답변까지 마크다운을 다시 파싱하지 않는다(#405).
 *
 * useChat 의 patch 는 바뀐 답변 하나만 새 객체로 만들고 나머지는 같은 객체를 돌려준다. 버블이 그 동일성을
 * 보지 않으면 답변 20개짜리 대화에서 토큰 하나에 마크다운 파싱이 21번 돈다. 파싱 횟수는 Markdown 호출로 센다.
 */
const parsed = vi.hoisted(() => [] as string[])
vi.mock('./Markdown', () => ({
  default: ({ text }: { text: string }) => {
    parsed.push(text)
    return <p>{text}</p>
  },
}))

describe('MessageList 스트리밍 재렌더 (#405)', () => {
  it('토큰이 붙어도 지난 답변은 다시 파싱하지 않는다', async () => {
    const done: ChatMessage[] = [
      { id: 'u1', role: 'user', content: '첫 질문', status: 'complete', citations: [] },
      { id: 'a1', role: 'assistant', content: '첫 답변', status: 'complete', citations: [] },
      { id: 'u2', role: 'user', content: '둘째 질문', status: 'complete', citations: [] },
    ]
    const streaming: ChatMessage = { id: 'a2', role: 'assistant', content: '둘', status: 'streaming', citations: [] }
    const { rerender } = render(<MessageList messages={[...done, streaming]} />)
    // Markdown 은 지연 로딩(#417) - 청크가 와서 첫 답변이 그려진 뒤부터 센다
    await waitFor(() => expect(parsed).toEqual(expect.arrayContaining(['첫 답변', '둘'])))
    // 같은 입력으로 한 번 더 그려 청크 도착으로 밀려 있던 재시도를 비운다
    rerender(<MessageList messages={[...done, streaming]} />)
    parsed.length = 0

    // patch 와 같은 모양 - 진행 중인 답변만 새 객체, 나머지는 같은 객체
    rerender(<MessageList messages={[...done, { ...streaming, content: '둘째 답' }]} />)

    expect(parsed).toEqual(['둘째 답'])
  })
})
