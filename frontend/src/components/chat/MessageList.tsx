import { useEffect, useRef } from 'react'
import { API_BASE } from '../../lib/api'
import type { ChatMessage } from '../../lib/types'
import Citations from './Citations'

export default function MessageList({ messages }: { messages: ChatMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="grid h-full place-items-center px-4 text-center text-sm text-zinc-400">
        무엇이든 물어보세요. 답변에는 근거 출처가 함께 표시됩니다.
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
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
        {message.content ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          message.status === 'streaming' && <span className="text-zinc-400">응답 생성 중…</span>
        )}
        {message.status === 'error' && <p className="mt-1 text-xs text-red-500">응답 중 오류가 발생했습니다</p>}
        {!isUser && <Citations citations={message.citations} />}
      </div>
    </div>
  )
}
