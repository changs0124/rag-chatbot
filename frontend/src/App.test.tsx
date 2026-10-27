import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { setToken } from './lib/api'
import App from './App'

vi.mock('./lib/endpoints', () => ({
  listDocuments: vi.fn(() => Promise.resolve([])),
  listAdminUsers: vi.fn(() => Promise.resolve([])),
}))

/** AuthProvider 가 기동 시 /api/auth/me 를 부른다 - 관리 경로를 열려면 관리자여야 한다 */
vi.mock('./lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/api')>()
  return {
    ...actual,
    api: {
      ...actual.api,
      get: vi.fn(() => Promise.resolve({ id: 'u1', email: 'a@b.com', name: '관리자', role: 'admin' })),
    },
  }
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}

// #513 : 관리 화면을 경로 둘로 나눴다
describe('관리 경로', () => {
  beforeEach(() => setToken('t'))
  afterEach(() => {
    setToken(null)
    vi.clearAllMocks()
  })

  // 나누기 전 경로의 북마크가 채팅 화면(그 외 경로)으로 떨어지지 않고 문서 관리로 간다
  it('옛 /admin 은 문서 관리로 넘어간다', async () => {
    renderAt('/admin')

    expect(await screen.findByRole('heading', { name: '문서 관리' })).toBeInTheDocument()
  })

  it('/admin/users 는 사용자 관리 화면이다', async () => {
    renderAt('/admin/users')

    expect(await screen.findByRole('heading', { name: '사용자 관리' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '문서 관리' })).not.toBeInTheDocument()
  })
})
