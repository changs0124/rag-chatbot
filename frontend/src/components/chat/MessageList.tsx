import { useEffect, useRef } from 'react'
import { API_BASE } from '../../lib/api'
import type { ChatMessage } from '../../lib/types'
import Citations from './Citations'

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
      <div className="grid h-full place-items-center px-4 text-center text-sm text-zinc-400">
        무엇이든 물어보세요. 답변에는 근거 출처가 함께 표시됩니다.
      </div>
    )
  }

  // 진행 단계를 보여주는 동안에는 답변 버블을 내지 않음(R-11 한 줄 교체형).
  // 단계가 최소 표시 시간을 마치면 stage가 null이 되고 그때 답변 텍스트로 교체됨
  const last = messages[messages.length - 1]
  const pending =
    last.role === 'assistant' && (!!stage || (last.status === 'streaming' && !last.content))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div
        className="flex flex-col gap-4"
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
          className="px-1 text-sm text-zinc-400 dark:text-zinc-500"
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
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          isUser
            ? 'max-w-[85%] rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'max-w-[85%] rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
        }
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {message.attachments.map((a) =>
              a.fileType === 'image' ? (
                <img
                  key={a.id}
                  src={API_BASE + a.url}
                  alt="첨부 이미지"
                  className="h-24 w-24 rounded-lg object-cover"
                />
              ) : (
                <span key={a.id} className="rounded-lg bg-black/10 px-2 py-1 text-xs">
                  📄 문서
                </span>
              ),
            )}
          </div>
        )}
        {/* 무자료 표시 - 텍스트 접두가 아니라 "출처 0건"에서 파생함(P-8).
            스트리밍 중에는 아직 citations가 안 왔으므로 complete 인 메시지에만 붙임 */}
        {!isUser && message.status === 'complete' && message.citations.length === 0 && (
          <p className="mb-1 text-xs text-amber-600 dark:text-amber-400">
            자료 없음 - 관련 자료를 찾지 못해 추론으로 답변함
          </p>
        )}
        {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        {message.status === 'error' && <p className="mt-1 text-xs text-red-500">응답 중 오류가 발생했습니다</p>}
        {!isUser && <Citations citations={message.citations} />}
      </div>
    </div>
  )
}
