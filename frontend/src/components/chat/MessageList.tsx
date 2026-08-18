import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '../../lib/api'
import type { ChatMessage } from '../../lib/types'
import Citations from './Citations'
import ImageLightbox from './ImageLightbox'

export default function MessageList({
  messages,
  stage,
}: {
  messages: ChatMessage[]
  stage?: string | null
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
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
          <p className="mb-2 inline-block rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
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
