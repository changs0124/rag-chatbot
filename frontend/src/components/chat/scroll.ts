/**
 * 자동 스크롤 판정 (#100).
 *
 * **별도 모듈인 이유** — jsdom 은 레이아웃을 하지 않아 실제 요소로는 `scrollTop` 이 늘 0 이고
 * `scrollIntoView` 도 없다. 판정을 컴포넌트 안에 두면 **테스트로 덮을 방법이 아예 없다.**
 * 숫자만 받는 순수 함수로 떼어 두면 그 부분만은 잠글 수 있다.
 */

/** 바닥에 얼마나 가까우면 「따라간다」고 볼지. 한 줄 남짓이면 아직 바닥을 보고 있는 것으로 친다 */
export const STICK_THRESHOLD_PX = 48

/** 위로 움직였다고 볼 최소 거리. 1px 미만은 브라우저의 소수점 흔들림이다 */
const UP_EPSILON_PX = 1

/** 스크롤이 바닥 근처인가. 소수점 오차를 견디도록 `<=` 로 둔다 */
export function isNearBottom(m: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= STICK_THRESHOLD_PX
}

/**
 * 스크롤이 한 번 일어난 뒤 「계속 따라갈지」를 정한다.
 *
 * <p><b>「위로 움직였을 때만 뗀다」가 핵심이다.</b> 바닥에서 멀다는 것만 보고 떼면
 * {@code scrollIntoView({behavior:'smooth'})} 의 <b>애니메이션 중간 위치</b>가 그 조건에 걸려
 * 스스로 따라가기를 멈춘다 — 실기기에서 실제로 그렇게 멎었다(jsdom 은 레이아웃을 하지 않아
 * 이 경로를 재현하지 못한다).
 *
 * <p>프로그램이 만든 스크롤은 늘 <b>아래로</b> 향하므로 이 규칙에 걸리지 않는다.
 * 사용자가 위로 올리면 떼고, 다시 바닥으로 돌아오면 붙는다.
 */
export function nextStick(m: {
  previousTop: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  stick: boolean
}): boolean {
  if (isNearBottom(m)) return true
  if (m.scrollTop < m.previousTop - UP_EPSILON_PX) return false
  return m.stick
}
