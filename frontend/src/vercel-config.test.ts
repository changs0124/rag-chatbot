/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// 배포 설정은 런타임에 안 잡히므로 파일을 읽어 규칙이 남아 있는지 본다(#707)
const config = JSON.parse(readFileSync(`${process.cwd()}/vercel.json`, 'utf-8')) as {
  rewrites: { source: string; destination: string }[]
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const spa = config.rewrites.find((r) => r.destination === '/index.html')!
// Vercel source 의 이 형태(그룹 · 부정 전방탐색)는 JS 정규식과 같게 해석된다
const spaMatches = (path: string) => new RegExp(`^${spa.source}$`).test(path)

describe('vercel.json SPA 리라이트 · 캐시 헤더', () => {
  it('없는 /assets 청크는 index.html 로 돌리지 않는다 (#702) - 돌리면 HTML 이 1년 immutable 로 캐시된다(#693)', () => {
    expect(spaMatches('/assets/index-abc123.js')).toBe(false)
    expect(spaMatches('/assets/Markdown-old.js')).toBe(false)
  })

  it('앱 라우트는 index.html 로 돌린다 - 직접 열기 · 새로고침이 404 가 되지 않게', () => {
    for (const path of ['/', '/login', '/me', '/admin/documents', '/admin/users', '/assets', '/assetsx']) {
      expect(spaMatches(path)).toBe(true)
    }
  })

  it('/assets 만 1년 immutable 이고 보안 헤더는 모든 경로에 붙는다', () => {
    const assets = config.headers.find((h) => h.source === '/assets/(.*)')!
    expect(assets.headers).toContainEqual({ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' })
    const all = config.headers.find((h) => h.source === '/(.*)')!
    expect(all.headers.map((h) => h.key)).toEqual(expect.arrayContaining(['Content-Security-Policy', 'X-Frame-Options']))
    expect(all.headers.some((h) => h.key === 'Cache-Control')).toBe(false)
  })
})
