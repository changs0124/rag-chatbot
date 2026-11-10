import { useEffect, useRef, useState } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 모달 · 드로어가 떠 있는 동안 키보드 · 낭독기를 그 안에 가둔다(#644, #105 §4 · F9).
 * - 열린 동안 모달 바깥(모달에서 body 까지 올라가는 길의 형제들)에 `inert` 를 건다 - Tab 도 낭독기 훑기도 뒤 화면에 닿지 않는다
 * - 열릴 때 포커스가 바깥에 있으면 안의 `data-autofocus` 요소(없으면 첫 포커스 대상)로 옮긴다. 보통은 autoFocus 가 이미 안으로
 *   옮겨 그대로지만, StrictMode(개발)는 효과를 두 번 돌려 첫 정리가 포커스를 연 요소로 돌려놓는다 - 그때도 같은 버튼으로 가게(#656)
 * - 닫히면 연 요소로 포커스를 돌려준다. 연 요소가 그새 사라졌거나 막혔으면(요청 중 disabled 등) returnTo 가 준 요소로
 * 모달 틀(껍데기)은 공통화하지 않는다(#105 판정) - 각 모달이 이 훅만 부른다. 반환한 ref 를 dialog 뿌리에 단다.
 */
export function useModalFocus<T extends HTMLElement>(returnTo?: () => HTMLElement | null | undefined) {
  const ref = useRef<T>(null)
  // 연 요소는 렌더 때 잡는다 - 커밋 단계의 autoFocus 가 먼저 포커스를 옮기기 때문에 effect 에서는 늦다
  const [opener] = useState(() => (typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null)))
  // returnTo 는 렌더마다 새 함수다 - 효과의 의존성에 넣으면 열린 채로 inert 를 걸었다 풀었다 하므로 마지막 것을 ref 로 들고 있는다
  const returnToRef = useRef(returnTo)
  useEffect(() => {
    returnToRef.current = returnTo
  })

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const made: Element[] = []
    for (let node: Element = root; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sib of Array.from(node.parentElement.children)) {
        // 이미 inert 인 것은 건드리지 않는다 - 겹쳐 뜬 모달이 닫힐 때 바깥 모달이 건 것을 풀지 않게
        if (sib !== node && !sib.hasAttribute('inert')) {
          sib.setAttribute('inert', '')
          made.push(sib)
        }
      }
    }
    if (!root.contains(document.activeElement)) (root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    return () => {
      for (const el of made) el.removeAttribute('inert')
      const usable = (el: HTMLElement | null | undefined) =>
        !!el && el.isConnected && el !== document.body && !(el as HTMLButtonElement).disabled
      const back = usable(opener) ? opener : returnToRef.current?.()
      if (usable(back)) back!.focus()
    }
  }, [opener])

  return ref
}
