import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../lib/api'
import type { ChatMessage } from '../../lib/types'
import Citations from './Citations'
import { nextStick } from './scroll'
import ImageLightbox from './ImageLightbox'

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
}: {
  messages: ChatMessage[]
  stage?: string | null
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  /** 바닥을 따라갈지. 사용자가 위로 올리면 거짓이 되고, 새 질문을 보내면 다시 참이 된다 */
  const stick = useRef(true)
  const lastUserMessageId = useRef<string | null>(null)

  /**
   * 사용자가 어디를 보고 있는지 따라간다. 컨테이너가 없으면(테스트 환경 등) 종전대로 늘 따라간다.
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
  let lastUserMessageIdInList: string | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserMessageIdInList = messages[i].id
      break
    }
  }
  useEffect(() => {
    if (lastUserMessageIdInList && lastUserMessageIdInList !== lastUserMessageId.current) {
      lastUserMessageId.current = lastUserMessageIdInList
      stick.current = true
    }
  }, [lastUserMessageIdInList])

  /**
   * 답변이 흐르는 동안 따라 내려간다 — **사용자가 위로 올렸으면 멈춘다**(#100).
   *
   * `patch` 가 토큰마다 새 배열을 만들어 이 effect 가 **토큰 하나당 한 번** 돈다. 판정이 없던 동안에는
   * 긴 답변이 생성되는 내내 앞선 메시지를 다시 읽을 수 없었다 — 위로 올려도 다음 토큰이 도착하는
   * 즉시 맨 아래로 되돌아갔다.
   */
  useEffect(() => {
    if (!stick.current) return
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages, stage])

  if (messages.length === 0) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-xl font-semibold text-ink">무엇을 도와드릴까요?</p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            답변에는 근거 출처가 함께 붙습니다. 찾은 자료가 없으면 없다고 먼저 밝힙니다.
          </p>
        </div>
      </div>
    )
  }

  // 진행 단계를 보여주는 동안에는 답변 버블을 내지 않음(R-11 한 줄 교체형).
  // 단계가 최소 표시 시간을 마치면 stage가 null이 되고 그때 답변 텍스트로 교체됨
  const last = messages[messages.length - 1]
  const pending =
    last.role === 'assistant' && (!!stage || (last.status === 'streaming' && !last.content))

  return (
    <div ref={rootRef} className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
      <div
        className="flex flex-col gap-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.map((m) =>
          pending && m.id === last.id ? null : <MessageBubble key={m.id} message={m} />,
        )}
      </div>
      {pending && (
        // log 영역과 분리한 별도 라이브 영역 - 원자적으로 교체해 낭독이 누적되지 않게 함
        <p
          role="status"
          aria-atomic="true"
          className="px-1 text-sm text-ink-muted"
        >
          {stage ?? '…'}
        </p>
      )}
      <div ref={endRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  // 확대 보기는 그 말풍선의 이미지들을 한 묶음으로 넘김(좌우 이동 대상)
  const images = (message.attachments ?? []).filter((a) => a.fileType === 'image')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      {/* 답변에는 배경을 깔지 않음(ChatGPT · Claude 공통) - 긴 답변에 큰 색면이 깔리면 읽는 흐름이 끊김 */}
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl bg-raised px-4 py-3 text-[15px] leading-relaxed text-ink shadow-[var(--shadow-ambient)]'
            : 'w-full text-[15px] leading-relaxed text-ink'
        }
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((a) =>
              a.fileType === 'image' ? (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setLightboxIndex(images.findIndex((i) => i.id === a.id))}
                  aria-label="첨부 이미지 확대"
                  className="block h-24 w-24 overflow-hidden rounded-lg"
                >
                  <img
                    src={API_BASE + a.url}
                    alt="첨부 이미지"
                    className="h-full w-full object-cover"
                  />
                </button>
              ) : (
                <span key={a.id} className="rounded-lg bg-surface px-2 py-1 text-xs text-ink-muted">
                  📄 문서
                </span>
              ),
            )}
          </div>
        )}
        {/* 무자료 표시 - 텍스트 접두가 아니라 "출처 0건"에서 파생함(P-8).
            스트리밍 중에는 아직 citations가 안 왔으므로 complete 인 메시지에만 붙임.
            중단된 답변(stopped)은 출처 판정 자체를 못 마쳐 늘 0건이므로 제외함 - 붙이면 거짓말이 됨 */}
        {!isUser && message.status === 'complete' && !message.stopped && message.citations.length === 0 && (
          <p className="mb-2 inline-block rounded-full bg-highlight px-2.5 py-1 text-[11px] font-medium text-highlight-ink">
            자료 없음 - 관련 자료를 찾지 못해 추론으로 답변함
          </p>
        )}
        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        {message.status === 'error' && (
          <p className="mt-1 text-[13px] text-danger">응답 중 오류가 발생했습니다</p>
        )}
        {!isUser && <Citations citations={message.citations} />}
      </div>

      {lightboxIndex !== null && images[lightboxIndex] && (
        <ImageLightbox
          items={images.map((a) => ({ src: API_BASE + a.url }))}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
