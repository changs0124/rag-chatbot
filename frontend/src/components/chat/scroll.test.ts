import { describe, it, expect } from 'vitest'
import { isNearBottom, nextStick, STICK_THRESHOLD_PX } from './scroll'

/**
 * 자동 스크롤 판정 (#100).
 *
 * 판정이 없으면 긴 답변이 생성되는 내내 앞선 메시지를 다시 읽을 수 없다 — `patch` 가 토큰마다 새 배열을
 * 만들어 스크롤 effect 가 **토큰 하나당 한 번** 돌고, 위로 올려도 다음 토큰이 오는 즉시 맨 아래로 돌아간다.
 *
 * **여기서 잠그는 것은 판정뿐이다.** jsdom 은 레이아웃을 하지 않아 실제 컨테이너로는
 * `scrollTop` 이 늘 0 이고 `scrollIntoView` 도 없다 — 컨테이너를 찾아 붙이는 부분은 못 덮는다.
 */
describe('바닥 근접 판정', () => {
  const box = (scrollTop: number) => ({ scrollTop, scrollHeight: 1000, clientHeight: 400 })

  it('바닥에 있으면 참', () => {
    expect(isNearBottom(box(600))).toBe(true) // 1000 - 600 - 400 = 0
  })

  it('위로 충분히 올리면 거짓', () => {
    expect(isNearBottom(box(0))).toBe(false)
  })

  /** 경계 - 한쪽만 두면 off-by-one 이 살아남는다 */
  it('임계값 경계에서 갈린다', () => {
    expect(isNearBottom(box(600 - STICK_THRESHOLD_PX))).toBe(true)
    expect(isNearBottom(box(600 - STICK_THRESHOLD_PX - 1))).toBe(false)
  })

  /** 내용이 화면보다 짧으면 스크롤할 것이 없다 - 늘 바닥이다 */
  it('내용이 화면보다 짧으면 늘 바닥으로 본다', () => {
    expect(isNearBottom({ scrollTop: 0, scrollHeight: 200, clientHeight: 400 })).toBe(true)
  })

  /** 브라우저가 주는 소수점 오차를 견딘다 - 정확히 0 을 기대하면 실기기에서 깜빡인다 */
  it('소수점 오차를 견딘다', () => {
    expect(isNearBottom({ scrollTop: 599.6, scrollHeight: 1000, clientHeight: 400 })).toBe(true)
  })
})

describe('따라가기 유지 판정', () => {
  const at = (previousTop: number, scrollTop: number, stick: boolean) => ({
    previousTop,
    scrollTop,
    scrollHeight: 1000,
    clientHeight: 400,
    stick,
  })

  it('사용자가 위로 올리면 뗀다', () => {
    expect(nextStick(at(600, 100, true))).toBe(false)
  })

  /**
   * **이 케이스가 이 함수의 존재 이유다.**
   *
   * smooth 스크롤의 중간 위치에 걸려 스스로 따라가기를 멈추지 않게 방향을 본다 - 이유는 scroll.ts nextStick 주석.
   */
  it('아래로 움직이는 중이면(프로그램 스크롤) 떼지 않는다', () => {
    expect(nextStick(at(0, 100, true))).toBe(true)
  })

  it('바닥으로 돌아오면 다시 붙는다', () => {
    expect(nextStick(at(100, 600, false))).toBe(true)
  })

  /** 뗀 상태에서 위로 더 올려도 뗀 채다 */
  it('뗀 상태에서 계속 위로 올려도 뗀 채다', () => {
    expect(nextStick(at(300, 100, false))).toBe(false)
  })

  /** 소수점 흔들림(1px 미만)은 「위로 올렸다」로 보지 않는다 - 붙어 있던 상태가 유지된다 */
  it('1px 미만 흔들림은 무시한다', () => {
    expect(nextStick(at(100, 99.5, true))).toBe(true)
  })
})
