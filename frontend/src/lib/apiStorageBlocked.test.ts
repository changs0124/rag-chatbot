import { describe, it, expect, vi } from 'vitest'

// #483 F12 : 사이트 데이터를 막은 브라우저는 저장소 접근에서 던진다. 모듈 평가에서 터지면 ErrorBoundary 도 못 잡아 백지가 된다.
// 파일을 따로 둔 이유 : 다시 import 한 모듈의 storage 리스너가 남아, 같은 파일의 storage 이벤트 케이스에서 진짜 reload 를 부른다
describe('저장소가 막힌 브라우저', () => {
  it('저장소 접근이 던져도 import 되고 토큰은 메모리로 든다', async () => {
    const denied = () => {
      throw new DOMException('denied', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(denied)
    vi.resetModules()

    const { getToken, setToken } = await import('./api')

    expect(getToken()).toBeNull()
    setToken('mem')
    expect(getToken()).toBe('mem')
    setToken(null)
    expect(getToken()).toBeNull()
    vi.restoreAllMocks()
  })

  // 쓰기만 던지면(용량 초과 등) 옛 계정 토큰이 남아 새로고침 때 그 계정으로 들어간다 - 지워 본다
  it('setItem 만 던지면 남은 옛 토큰을 지운다', async () => {
    localStorage.setItem('rag_chatbot_token', 'old-account')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    vi.resetModules()

    const { getToken, setToken } = await import('./api')
    setToken('new-account')

    expect(getToken()).toBe('new-account')
    expect(localStorage.getItem('rag_chatbot_token')).toBeNull()
    vi.restoreAllMocks()
  })
})
