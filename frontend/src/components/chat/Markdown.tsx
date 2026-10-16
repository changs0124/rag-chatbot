import type { ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkGfm from 'remark-gfm'

/**
 * 답변 본문의 마크다운(#270). 모델이 굵게 · 목록 · 표 · 제목으로 답하는데 평문으로 그리면 `**` 와 `|---|` 가
 * 글자 그대로 보였다.
 *
 * - **원시 HTML 은 그리지 않는다.** react-markdown 의 기본값(rehype-raw 를 붙이지 않음)이다 - 모델 출력이
 *   스크립트 · 이벤트 속성을 실어 오는 길이 되면 안 된다. `javascript:` 같은 위험한 링크 스킴은 기본 urlTransform 이 지운다
 * - 표는 가로로만 스크롤되는 상자에 넣는다 - 모바일 폭에서 화면 전체를 밀어내지 않게
 * - 그림 표식(`[[그림:키]]`)은 여기 오기 전에 잘려 나간다(splitFigures). 이 컴포넌트는 표식 사이의 글만 받는다
 * - **한국어 조사 앞의 굵게를 닫는다(#287).** 표준 강조 규칙은 닫는 `**` 앞이 문장부호 · 뒤가 글자면 안 닫는다 -
 *   `**설계불량(부품선정오류)**으로` 가 글자 그대로 보였다. remark-cjk-friendly 가 CJK 글자 옆에서 이 규칙을 푼다
 */
// 답변 버블 안이라 한 단계씩 낮춰 그린다 - h1·h2 는 h3, h3·h4 는 h4
const heading = ({ children }: { children?: ReactNode }) => (
  <h3 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h3>
)
const subheading = ({ children }: { children?: ReactNode }) => (
  <h4 className="mt-3 mb-1.5 font-semibold first:mt-0">{children}</h4>
)

const components: Components = {
  p: ({ children }) => <p className="my-2 break-words first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="break-words">{children}</li>,
  h1: heading,
  h2: heading,
  h3: subheading,
  h4: subheading,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-line pl-3 text-ink-muted">{children}</blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.9em]">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-lg bg-surface p-3 text-[13px] [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 max-w-full overflow-x-auto">
      <table className="w-max min-w-full border-collapse text-[14px]">{children}</table>
    </div>
  ),
  th: ({ children, style }) => (
    <th style={style} className="border border-line bg-surface px-2.5 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children, style }) => (
    <td style={style} className="border border-line px-2.5 py-1.5 align-top">
      {children}
    </td>
  ),
  hr: () => <hr className="my-3 border-line" />,
}

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkCjkFriendly]} components={components}>
      {text}
    </ReactMarkdown>
  )
}
