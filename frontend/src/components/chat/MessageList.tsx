import { lazy, memo, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../lib/api'
import type { ChatMessage } from '../../lib/types'
import Citations from './Citations'
import { nextStick } from './scroll'
import ImageLightbox from './ImageLightbox'
import DocFigure from './DocFigure'
import { splitFigures } from '../../lib/docFigures'

function PlainText({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words">{text}</p>
}
// 지연 로딩(#417) - react-markdown · remark 묶음은 번들의 큰 몫인데 로그인 화면은 쓰지 않는다. 첫 답변을 그릴 때 받는다
// 청크를 못 받으면 평문으로 물러선다 - 재배포로 옛 청크가 사라지거나(없는 `/assets/*` 는 404 다, #702) 망이 끊기면
// lazy 가 던진 오류가 최상위 ErrorBoundary 까지 올라가 **앱 전체가 오류 화면**이 된다. ChatPage 가 미리 받아 둔다
const Markdown = lazy(() => import('./Markdown').catch(() => ({ default: PlainText })))

/** 스크롤을 실제로 하는 조상. MessageList 는 컨테이너를 소유하지 않는다(ChatPage 가 가진다) */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return null
}

export default function MessageList({
  messages,
  stage,
  onAttachmentError,
}: {
  messages: ChatMessage[]
  stage?: string | null
  /** 보낸 첨부 이미지가 깨졌을 때(서명 URL 만료, #558) - 새 서명을 받아 다시 그리게 한다 */
  onAttachmentError?: (attachmentId: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  /** 바닥을 따라갈지. 사용자가 위로 올리면 거짓이 되고, 새 질문을 보내면 다시 참이 된다 */
  const stick = useRef(true)
  const lastUserMessageId = useRef<string | null>(null)

  /**
   * 사용자가 어디를 보고 있는지 따라간다. 컨테이너가 없으면(테스트 환경 등) 늘 따라간다.
   *
   * **`hasMessages` 에 의존하는 이유** - 메시지가 0건이면 아래에서 빈 화면을 그리며 조기 반환하므로
   * `rootRef` 가 붙지 않는다. 의존성을 `[]` 로 두면 그 시점에 한 번 돌고 끝나 **리스너가 영영
   * 등록되지 않는다.** 실기기에서 실제로 그렇게 죽어 있었다(jsdom 은 이 경로를 재현하지 못한다).
   */
  const hasMessages = messages.length > 0
  useEffect(() => {
    const scroller = findScrollParent(rootRef.current)
    if (!scroller) return
    let previousTop = scroller.scrollTop
    const onScroll = () => {
      stick.current = nextStick({
        previousTop,
        scrollTop: scroller.scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
        stick: stick.current,
      })
      previousTop = scroller.scrollTop
    }
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [hasMessages])

  /**
   * **내가 보낸 질문은 위치와 무관하게 바닥으로 간다.** 위를 읽던 중에 보냈어도 방금 보낸 것은 봐야 한다.
   *
   * **마지막 메시지가 아니라 「마지막 사용자 메시지」를 본다** - 전송 시 사용자 메시지와 답변 버블이
   * 함께 추가돼 배열의 끝은 늘 assistant 다. 끝만 보면 새 질문을 영영 못 알아챈다
   * (실기기에서 실제로 그렇게 동작하지 않았다).
   */
  const lastUserMessageIdInList = messages.findLast((m) => m.role === 'user')?.id ?? null
  useEffect(() => {
    if (lastUserMessageIdInList && lastUserMessageIdInList !== lastUserMessageId.current) {
      lastUserMessageId.current = lastUserMessageIdInList
      stick.current = true
    }
  }, [lastUserMessageIdInList])

  /**
   * 답변이 흐르는 동안 따라 내려간다 — **사용자가 위로 올렸으면 멈춘다**(#100). 이 effect 는 토큰마다 돈다.
   */
  useEffect(() => {
    if (!stick.current) return
    // 움직임 줄이기 설정이면 부드럽게 굴리지 않는다(#644) - JS 로 준 smooth 는 CSS 의 scroll-behavior 전역 끄기가 못 막는다
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth' })
  }, [messages, stage])

  // 진행 단계를 보여주는 동안에는 답변 버블을 내지 않음(REQ-CHAT-005, 한 줄 교체형).
  // 단계가 최소 표시 시간을 마치면 stage가 null이 되고 그때 답변 텍스트로 교체됨
  const last = messages.at(-1)
  const pending =
    !!last && last.role === 'assistant' && (!!stage || (last.status === 'streaming' && !last.content))
  // 답이 흐르는 동안 log 를 바쁨으로 둔다(#644) - 아니면 낭독기가 토큰 조각마다 읽어 쌓는다. 끝나 풀린 뒤 완성된 답을 읽게 하려는
  // 의도다 - 해제 뒤 실제로 읽는지는 낭독기마다 달라 실기기로 확인하지 않았다(11-10 보류, #105)
  const busy = !!last && last.role === 'assistant' && (!!stage || last.status === 'streaming')

  // log 영역과 분리한 별도 라이브 영역 - 원자적으로 교체해 낭독이 누적되지 않게 함.
  // 그릇은 늘 두고 글만 넣는다(#484 규칙 · #590). 빈 화면 · 목록 어느 쪽이든 같은 자리(조각의 두 번째 자식)라
  // 새 대화 첫 턴에도 그릇이 이미 있다(#601). 보이는 단계 줄은 목록 안에 따로 두고 낭독은 이쪽이 맡는다
  const status = (
    <p role="status" aria-atomic="true" className="sr-only">
      {pending ? (stage ?? '…') : ''}
    </p>
  )

  if (messages.length === 0) {
    return (
      <>
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-ink md:text-[28px]">무엇을 도와드릴까요?</p>
          </div>
        </div>
        {status}
      </>
    )
  }

  return (
    <>
      <div ref={rootRef} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
        <div
          className="flex flex-col gap-6"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={busy}
        >
          {messages.map((m) =>
            pending && m.id === last?.id ? null : <MessageBubble key={m.id} message={m} onAttachmentError={onAttachmentError} />,
          )}
        </div>
        {/* 보이는 단계 줄 - 낭독은 아래 status 그릇이 맡는다(두 번 읽히지 않게 aria-hidden).
            끝 표식과 한 묶음으로 두어 단계 줄이 없을 때 flex 간격이 하나 더 생기지 않게 하고, 있을 때는 mt-6 로 전과 같은 간격 */}
        <div>
          {pending && (
            // 움직이는 점 셋(#646) - 정지한 「…」 글자는 멈춘 것처럼 읽혔다. 움직임 줄이기면 점은 멈추고 단계 글자만 남는다
            <p aria-hidden="true" className="flex items-center gap-2.5 px-1 text-sm text-ink-muted">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-muted motion-reduce:animate-none" />
              </span>
              {/* 단계 글자가 아직 없으면 점 셋만 - 「…」 글자를 더하면 점이 두 번 보였다(#657). 낭독용 status 는 「…」를 그대로 둔다 */}
              {stage}
            </p>
          )}
          <div ref={endRef} className={pending ? 'mt-6' : undefined} />
        </div>
      </div>
      {status}
    </>
  )
}

// memo(#405) - 스트리밍 중 patch 는 진행 중인 답변만 새 객체로 만든다. 경계가 없으면 토큰마다 지난 답변까지
// 마크다운을 다시 파싱한다(답변 20개면 토큰 하나에 21번)
const MessageBubble = memo(function MessageBubble({
  message,
  onAttachmentError,
}: {
  message: ChatMessage
  onAttachmentError?: (attachmentId: string) => void
}) {
  const isUser = message.role === 'user'
  // 확대 보기는 그 말풍선의 이미지들을 한 묶음으로 넘김(좌우 이동 대상). 첨부는 이미지뿐이다(#391)
  const images = message.attachments ?? []
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  // 문서 그림(FEAT-CHAT-004). 사용자 첨부와 묶음을 섞지 않는다 - 확대 화면의 좌우 이동은 같은 종류끼리다.
  // 표식은 답변에서만 그림이 된다 - 사용자가 친 표식은 글자 그대로 둔다(#385)
  const segments = !message.content
    ? []
    : isUser
      ? [{ type: 'text' as const, text: message.content }]
      : splitFigures(message.content, message.status === 'streaming')
  const [figureSrc, setFigureSrc] = useState<Record<string, string>>({})
  const [openFigure, setOpenFigure] = useState<string | null>(null)
  const onFigureLoad = useCallback(
    (key: string, src: string) => setFigureSrc((prev) => (prev[key] === src ? prev : { ...prev, [key]: src })),
    [],
  )
  const figureKeys = [
    ...new Set(segments.flatMap((s) => (s.type === 'figure' && figureSrc[s.key] ? [s.key] : []))),
  ]
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      {/* 답변에는 배경을 깔지 않음(ChatGPT · Claude 공통) - 긴 답변에 큰 색면이 깔리면 읽는 흐름이 끊김 */}
      <div
        className={
          isUser
            ? // 질문은 그림자 없는 면(#646) - 떠 있는 카드보다 가라앉은 말풍선이 답변 쪽으로 시선을 넘긴다
              'max-w-[85%] rounded-3xl bg-surface px-4 py-2.5 text-[15px] leading-relaxed text-ink'
            : 'w-full text-[15px] leading-relaxed text-ink'
        }
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setLightboxIndex(images.findIndex((i) => i.id === a.id))}
                // 여러 장이면 몇 번째인지 붙인다(#590) - 같은 이름 버튼이 줄지어 있으면 낭독기로 고를 수 없다
                aria-label={images.length > 1 ? `첨부 이미지 ${images.indexOf(a) + 1}/${images.length} 확대` : '첨부 이미지 확대'}
                className="block h-24 w-24 overflow-hidden rounded-lg"
              >
                <img
                  src={API_BASE + a.url}
                  alt="첨부 이미지"
                  onError={() => onAttachmentError?.(a.id)}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        {/* 무자료 표시 - 텍스트 접두가 아니라 "출처 0건"에서 파생함(REQ-RAG-003).
            스트리밍 중에는 아직 citations가 안 왔으므로 complete 인 메시지에만 붙임.
            중단된 답변(stopped)은 출처 판정 자체를 못 마쳐 늘 0건이므로 제외함 - 붙이면 거짓말이 됨 */}
        {!isUser && message.status === 'complete' && !message.stopped && message.citations.length === 0 && (
          <p className="mb-2 inline-block rounded-full bg-highlight px-2.5 py-1 text-xs font-medium md:text-[11px] text-highlight-ink">
            자료 없음 - 관련 자료를 찾지 못해 추론으로 답변함
          </p>
        )}
        {segments.map((s, i) =>
          s.type === 'text' ? (
            // 답변만 마크다운으로 그린다(#270). 사용자가 친 글은 쓴 그대로 보여야 한다 - `*` 나 `|` 를 친 사람의 글이 서식으로 바뀌면 안 된다
            isUser ? (
              <p key={`t${i}`} className="whitespace-pre-wrap break-words">
                {s.text}
              </p>
            ) : (
              // 청크가 오기 전에는 같은 글을 평문으로 보여 준다 - 빈 자리가 깜빡이지 않게
              <Suspense key={`t${i}`} fallback={<PlainText text={s.text} />}>
                <Markdown text={s.text} />
              </Suspense>
            )
          ) : (
            <DocFigure key={`f${i}-${s.key}`} figureKey={s.key} onLoad={onFigureLoad} onOpen={setOpenFigure} />
          ),
        )}
        {/* 같은 오류를 ChatPage 배너(role=alert)가 이미 읽는다 - 이중 낭독을 막는다(#484) */}
        {message.status === 'error' && (
          <p aria-hidden="true" className="mt-1 text-[13px] text-danger">응답 중 오류가 발생했습니다</p>
        )}
        {!isUser && <Citations citations={message.citations} />}
      </div>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <ImageLightbox
          items={images.map((a) => ({ src: API_BASE + a.url }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          // 확대 화면 · 내려받기도 썸네일과 같은 재서명으로 복구한다(#587) - 새 URL 이 오면 items 가 바뀐다
          onImageError={(i) => onAttachmentError?.(images[i].id)}
        />
      )}
      {openFigure !== null && figureKeys.includes(openFigure) && (
        <ImageLightbox
          items={figureKeys.map((k) => ({ src: figureSrc[k], name: `${k}.png` }))}
          startIndex={figureKeys.indexOf(openFigure)}
          onClose={() => setOpenFigure(null)}
        />
      )}
    </div>
  )
})
