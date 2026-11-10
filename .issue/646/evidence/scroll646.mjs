// #646(#644 탐침 재사용) 키보드 · 낭독기 탐침 + 캡처. 사용 : node k644.mjs <dist 폴더> <출력 폴더(json · png)>
// 목업 API(probe.mjs 와 같은 자료) · 데스크톱 1440×900 · 모바일 390×844
import { createRequire } from 'node:module'
const { chromium } = createRequire('C:/Users/User/AppData/Local/Temp/claude/cc19ec6eeab1f0fc/4a16aa4c-6f47-4da6-997b-0871147ba147/scratchpad/design/package.json')('playwright')
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const [DIST, OUT] = process.argv.slice(2)
// 목업 토큰은 실행 때 만든다(리터럴은 gitleaks 가 잡는다 - #651)
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
fs.mkdirSync(OUT, { recursive: true })

function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; const g = ((x >> 4) + (y >> 4)) & 1; raw[o] = g ? rgb[0] : 255; raw[o + 1] = g ? rgb[1] : 255; raw[o + 2] = g ? rgb[2] : 255 }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const IMG = png(320, 200, [8, 113, 155])
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin' }
const conversations = [
  { id: 'c1', title: '클레임 처리 절차', updatedAt: iso(now - 1000) },
  { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
]
const messages = [
  { id: 'm1', role: 'user', content: '클레임 처리 절차를 알려 주세요.', status: 'complete', citations: [], attachments: [{ id: 'a1', fileType: 'image', url: '/api/files/a1/raw' }, { id: 'a2', fileType: 'image', url: '/api/files/a2/raw' }] },
  { id: 'm2', role: 'assistant', content: '클레임이 접수되면 **품질보증팀**이 1차 판정을 합니다 [1].', status: 'complete', citations: [{ seq: 1, sourceName: '지침.pdf', snippet: '1차 판정' }] },
]
const documents = [
  { id: 'd1', filename: '클레임처리지침.pdf', byteSize: 2_345_678, status: 'completed', uploadedByName: '관리자홍길동', createdAt: iso(now - 86400e3) },
  { id: 'd2', filename: '설계변경관리규정.docx', byteSize: 45_000, status: 'in_progress', uploadedByName: '관리자홍길동', createdAt: iso(now) },
  { id: 'd3', filename: '스캔본.pdf', byteSize: 9_000_000, status: 'failed', uploadedByName: '김철수', createdAt: iso(now - 40 * 86400e3) },
]
const users = [admin, { id: 'u2', email: 'kim@local.test', name: '김철수', role: 'user' }]
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(context) {
  await context.route('http://app.local/**', (route) => {
    const u = new URL(route.request().url())
    let p = path.join(DIST, decodeURIComponent(u.pathname))
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
    const ct = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(p)] ?? 'application/octet-stream'
    route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(p) })
  })
  await context.route('http://mock.local/**', (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname; const m = r.method()
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (p === '/api/auth/me') return json(route, admin)
    if (p === '/api/conversations' && m === 'GET') return json(route, conversations)
    if (/^\/api\/conversations\/c1\/messages$/.test(p)) return json(route, messages)
    if (/^\/api\/conversations\/[^/]+\/messages$/.test(p)) return json(route, [])
    if (p.startsWith('/api/files/')) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: IMG })
    if (p === '/api/admin/documents') return json(route, documents)
    if (/password-reset$/.test(p)) return json(route, { temporaryPassword: 'Tmp-4821-xQ' })
    if (p === '/api/admin/users') return json(route, users)
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

// 지금 포커스된 요소 : 태그 · 이름 · 속한 dialog
const focusInfo = (page) => page.evaluate(() => {
  const e = document.activeElement
  if (!e || e === document.body) return 'BODY'
  const name = e.getAttribute('aria-label') || (e.textContent || '').trim().slice(0, 30) || e.getAttribute('type') || ''
  const dlg = e.closest('[role="dialog"]')
  return `${e.tagName.toLowerCase()}「${name}」${dlg ? ' ∈dialog(' + (dlg.getAttribute('aria-label') || dlg.getAttribute('aria-labelledby') ? 'named' : '') + ')' : ''}`
})
async function tabs(page, n) {
  const seq = []
  for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); seq.push(await focusInfo(page)) }
  return seq
}
const inDialog = (seq) => seq.filter((s) => s.includes('∈dialog')).length

const browser = await chromium.launch()
const result = {}
const br = await chromium.launch()
for (const [vp, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const context = await br.newContext({ viewport, isMobile: vp === 'mobile', hasTouch: vp === 'mobile', locale: 'ko-KR' })
  await setup(context)
  const page = await context.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(700)
  if (vp === 'mobile') { await page.click('button[aria-label="대화 목록 열기"]'); await page.waitForTimeout(400) }
  await page.getByText('클레임 처리 절차').filter({ visible: true }).first().click(); await page.waitForTimeout(1500)
  result[vp] = await page.evaluate(() => ({ docScrollTop: document.scrollingElement.scrollTop, docHeight: document.scrollingElement.scrollHeight, viewport: innerHeight, headerTop: Math.round(document.querySelector('header')?.getBoundingClientRect().top ?? NaN) }))
  await context.close()
}
await br.close()
fs.writeFileSync(`${OUT}/scroll.json`, JSON.stringify(result, null, 1))
console.log(JSON.stringify(result))
await browser.close()
