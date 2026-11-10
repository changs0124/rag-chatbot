import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'))
const DIST = process.argv[2]
const OUT = process.argv[3]
fs.mkdirSync(OUT, { recursive: true })

// solid-color PNG generator
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
const FIG = png(800, 420, [180, 60, 40])

const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin' }
const conversations = [
  { id: 'c1', title: '설계불량(부품선정오류) 클레임 처리 절차와 재발 방지 대책에 대한 아주 긴 제목의 대화', updatedAt: iso(now - 1000) },
  { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
  { id: 'c3', title: '지난주 납품 지연 건', updatedAt: iso(now - 3 * 86400e3) },
  { id: 'c4', title: '작년 감사 보고서 요약', updatedAt: iso(now - 40 * 86400e3) },
]
const longCell = '공급업체가 납품한 부품의 사양이 설계 도면과 일치하지 않아 조립 공정에서 반복적으로 불량이 발생한 경우에 해당합니다'
const answer = `## 클레임 처리 절차

클레임이 접수되면 **품질보증팀**이 1차 판정을 합니다 [1]. 판정 결과에 따라 **설계불량(부품선정오류)**으로 분류되면 설계팀으로 이관됩니다 [2].

1. 접수 및 등록
2. 원인 분석 — \`CLAIM-2026-000123-ABCDEF-VERYLONGIDENTIFIERWITHOUTSPACES\`
3. 대책 수립

| 구분 | 정의 | 담당 부서 | 처리 기한 |
|---|---|---|---|
| 설계불량 | ${longCell} | 설계팀 | 14일 |
| 제조불량 | 작업 표준 미준수로 인한 불량 | 생산팀 | 7일 |

[[그림:tm-p0]]

자세한 내용은 [사내 규정](https://intranet.example.com/rules/claim) 을 참고하세요.

\`\`\`
SELECT * FROM claims WHERE status = 'OPEN' AND created_at > now() - interval '30 days' ORDER BY created_at DESC;
\`\`\`
`
const messages = [
  { id: 'm1', role: 'user', content: '클레임 처리 절차를 알려 주세요. 특히 설계불량으로 분류되는 기준이 궁금합니다.', status: 'complete', citations: [], attachments: [{ id: 'a1', fileType: 'image', url: '/api/files/a1/raw' }, { id: 'a2', fileType: 'image', url: '/api/files/a2/raw' }] },
  { id: 'm2', role: 'assistant', content: answer, status: 'complete', citations: [
    { seq: 1, sourceName: '품질보증_클레임처리지침_v3.2_최종_수정본_2026년_개정판.pdf', snippet: '클레임 접수 시 품질보증팀은 영업일 기준 2일 이내에 1차 판정을 수행하고 그 결과를 접수 부서에 회신하여야 한다. 판정이 어려운 경우 기술 검토 위원회에 회부할 수 있으며 위원회는 7일 이내에 결론을 내야 한다. 이 경우 접수 부서는 고객에게 중간 경과를 통보한다.' },
    { seq: 2, sourceName: '설계변경관리규정.docx', snippet: '부품선정오류는 설계불량으로 분류한다.' },
  ] },
  { id: 'm3', role: 'user', content: '요약해 줘', status: 'complete', citations: [] },
  { id: 'm4', role: 'assistant', content: '관련 자료를 찾지 못했습니다. 일반적으로 클레임은 접수 → 판정 → 대책 순으로 처리됩니다.', status: 'complete', citations: [] },
]
const documents = [
  { id: 'd1', filename: '품질보증_클레임처리지침_v3.2_최종_수정본_2026년_개정판_사내배포용_외부반출금지.pdf', byteSize: 2_345_678, status: 'completed', uploadedByName: '관리자홍길동', createdAt: iso(now - 86400e3) },
  { id: 'd2', filename: '설계변경관리규정.docx', byteSize: 45_000, status: 'in_progress', uploadedByName: '관리자홍길동', createdAt: iso(now) },
  { id: 'd3', filename: '스캔본.pdf', byteSize: 9_000_000, status: 'failed', uploadedByName: '김철수', createdAt: iso(now - 400 * 86400e3) },
]
const users = [
  admin,
  { id: 'u2', email: 'very.long.email.address.for.testing@subsidiary.example.co.kr', name: '김철수아주긴이름입니다', role: 'user' },
  { id: 'u3', email: 'lee@local.test', name: '이영희', role: 'user' },
]

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(context, { auth = true } = {}) {
  await context.route('http://app.local/**', (route) => {
    const u = new URL(route.request().url())
    let p = path.join(DIST, decodeURIComponent(u.pathname))
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
    const ext = path.extname(p)
    const ct = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' }[ext] ?? 'application/octet-stream'
    route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(p) })
  })
  await context.route('http://mock.local/**', (route) => {
    const r = route.request()
    const u = new URL(r.url())
    const p = u.pathname
    const m = r.method()
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (p === '/api/auth/me') return auth ? json(route, admin) : json(route, { message: 'unauth' }, 401)
    if (p === '/api/auth/login') return json(route, { message: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401)
    if (p === '/api/conversations' && m === 'GET') return json(route, conversations)
    if (/^\/api\/conversations\/c1\/messages$/.test(p)) return json(route, messages)
    if (/^\/api\/conversations\/[^/]+\/messages$/.test(p)) return json(route, [])
    if (p.startsWith('/api/files/')) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: IMG })
    if (p.startsWith('/api/doc-figures/')) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/png', body: FIG })
    if (p === '/api/admin/documents') return json(route, documents)
    if (p === '/api/admin/users') return json(route, users)
    return json(route, {})
  })
  if (auth) await context.addInitScript(() => localStorage.setItem('rag_chatbot_token', 'h.eyJzdWIiOiJ1MSJ9.s'))
}
// #643 증거 : 표 넘침 · 입력창 높이를 두 폭에서 재고 PNG 로 찍는다(H1 화면 밀림은 #642 범위라 찍기 전 문서 스크롤을 0 으로 되돌린다)
const browser = await chromium.launch()
const out = {}
for (const [vp, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: vp === 'mobile', hasTouch: vp === 'mobile', locale: 'ko-KR' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(800)
  if (vp === 'mobile') { await page.click('button[aria-label="대화 목록 열기"]'); await page.waitForTimeout(300) }
  await page.locator('aside button', { hasText: '설계불량' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(1500)
  const top0 = () => page.evaluate(() => { document.scrollingElement.scrollTop = 0 })
  const table = page.locator('table').first()
  await table.scrollIntoViewIfNeeded(); await top0(); await page.waitForTimeout(200)
  const m = {}
  m.table = await page.evaluate(() => {
    const t = document.querySelector('table'); const w = t.parentElement; const r = w.getBoundingClientRect()
    return { tableW: Math.round(t.getBoundingClientRect().width), boxW: w.clientWidth, overflow: w.scrollWidth > w.clientWidth, rows: [...t.rows].map(x => Math.round(x.getBoundingClientRect().height)),
      wrapTabIndex: w.tabIndex, wrapRole: w.getAttribute('role'), wrapLabel: w.getAttribute('aria-label'), fade: getComputedStyle(w.parentElement).getPropertyValue('--x') || null,
      box: { x: r.x, y: r.y, w: r.width, h: r.height } }
  })
  m.fadeVisible = await page.evaluate(() => { const f = document.querySelector('[data-testid="table-fade"]'); return f ? getComputedStyle(f).opacity : null })
  await page.screenshot({ path: `${OUT}/${vp}-table.png` })
  const ta = page.locator('textarea'); await ta.click(); await ta.type('첫 줄')
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+Enter'); await ta.type(`${i + 2}번째 줄`) }
  await page.waitForTimeout(200)
  m.textarea5 = await ta.evaluate(el => ({ h: el.clientHeight, sh: el.scrollHeight }))
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Enter'); await ta.type(`${i + 6}번째 줄`) }
  await page.waitForTimeout(200)
  m.textarea11 = await ta.evaluate(el => ({ h: el.clientHeight, sh: el.scrollHeight }))
  await top0(); await page.waitForTimeout(100)
  m.composerBox = await page.locator('div.rounded-3xl').first().evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  await page.screenshot({ path: `${OUT}/${vp}-composer.png` })
  await ta.fill('한 줄'); await page.waitForTimeout(100)
  m.textareaOneLine = await ta.evaluate(el => el.clientHeight)
  m.sendBtn = await page.locator('button[aria-label="보내기"]').evaluate(el => Math.round(el.getBoundingClientRect().height))
  out[vp] = m
  await ctx.close()
}
await browser.close()
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
