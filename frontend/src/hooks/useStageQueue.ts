import { useCallback, useRef, useState } from 'react'

/**
 * 한 단계를 화면에 유지하는 최소 시간(ms). 목업은 단계가 같은 순간에 도착해 표시 시간이 0이 되므로,
 * 실제로 도달한 단계를 읽을 수 있을 만큼만 붙잡아 둠. 없는 단계를 만들거나 순서를 바꾸지는 않음(REQ-RAG-004).
 */
const STAGE_MIN_MS = 350

/** 진행 단계(REQ-CHAT-005) 표시 큐. `useChat` 에서 뺐다(#456) */
export function useStageQueue() {
  const [stage, setStage] = useState<string | null>(null)
  // 실제 도달한 단계를 순서대로 담아 최소 표시 시간만큼 유지함(단계를 만들지 않고 읽을 시간만 줌)
  const stageQueue = useRef<string[]>([])
  const stageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const advanceStage = useCallback(() => {
    const next = stageQueue.current.shift()
    if (next === undefined) {
      stageTimer.current = null
      setStage(null)
      return
    }
    setStage(next)
    stageTimer.current = setTimeout(advanceStage, STAGE_MIN_MS)
  }, [])

  const pushStage = useCallback(
    (label: string) => {
      stageQueue.current.push(label)
      if (stageTimer.current === null) advanceStage()
    },
    [advanceStage],
  )

  const clearStages = useCallback(() => {
    if (stageTimer.current) clearTimeout(stageTimer.current)
    stageTimer.current = null
    stageQueue.current = []
    setStage(null)
  }, [])

  return { stage, pushStage, clearStages }
}
