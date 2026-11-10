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
const rects = {}
const rectOf = async (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round) }, sel)
for (const [vp, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const ctx = await browser.newContext({ viewport, isMobile: vp === 'mobile', hasTouch: vp === 'mobile', locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  const R = (result[vp] = {})

  // 1) 문서 관리 : Tab 순서 · 업로드 칸 · 삭제 이름
  await page.goto('http://app.local/admin/documents'); await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${vp}-admin-docs.png` })
  R.docsTabOrder = await tabs(page, 8)
  R.uploadReachable = R.docsTabOrder.some((s) => s.startsWith('input「file'))
  R.deleteNames = await page.$$eval('main li button, li button', (bs) => bs.map((b) => b.getAttribute('aria-label') || b.textContent.trim()))
  // 업로드 칸에 포커스가 오면 외곽선이 보이는지(라벨 outline)
  R.uploadFocusOutline = await page.evaluate(() => {
    const i = document.querySelector('input[type=file]'); i.focus()
    const l = i.closest('label'); const cs = getComputedStyle(l)
    return { focused: document.activeElement === i, labelOutline: cs.outlineStyle + ' ' + cs.outlineWidth }
  })
  if (R.uploadFocusOutline.focused) await page.locator('input[type=file]').evaluate((e) => e.closest('label').scrollIntoView())
  await page.screenshot({ path: `${OUT}/${vp}-admin-docs-upload-focus.png` })
  rects[`${vp}-admin-docs-upload-focus`] = await rectOf(page, 'section label')
  rects[`${vp}-admin-docs`] = await rectOf(page, 'section label')

  // 2) 확인 창 : 키보드로 열고 Tab 6번 · Esc · 포커스 복귀
  const del = page.locator('li button').first()
  await del.focus(); const opener = await focusInfo(page)
  await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/${vp}-confirm.png` })
  rects[`${vp}-confirm`] = await rectOf(page, '[role=dialog] > div.relative')
  const seq = await tabs(page, 6)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  R.confirm = { opener, tabs: seq, tabsInsideDialog: `${inDialog(seq)}/6`, afterClose: await focusInfo(page) }

  // 3) 임시 비밀번호 창 : 초기화 → 확인 → 창. Tab 4번 · Esc · 복귀
  await page.goto('http://app.local/admin/users'); await page.waitForTimeout(700)
  const reset = page.locator('button[aria-label$="비밀번호 초기화"]').first()
  await reset.focus(); const op2 = await focusInfo(page)
  await page.keyboard.press('Enter'); await page.waitForTimeout(200)
  await page.getByRole('button', { name: '초기화', exact: true }).click(); await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${vp}-issued.png` })
  rects[`${vp}-issued`] = await rectOf(page, '[role=dialog] > div.relative')
  const seq2 = await tabs(page, 4)
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  R.issued = { opener: op2, tabs: seq2, tabsInsideDialog: `${inDialog(seq2)}/4`, afterClose: await focusInfo(page) }

  // 4) 채팅 : (모바일) 드로어 → 대화 열기 → 확대 보기
  await page.goto('http://app.local/'); await page.waitForTimeout(700)
  if (vp === 'mobile') {
    const menu = page.locator('button[aria-label="대화 목록 열기"]')
    await menu.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${vp}-drawer.png` })
    rects[`${vp}-drawer`] = await rectOf(page, '.fixed.inset-0.z-40 > div.absolute.inset-y-0')
    const d = { dialogs: await page.$$eval('[role="dialog"]', (x) => x.map((e) => ({ label: e.getAttribute('aria-label'), modal: e.getAttribute('aria-modal') }))), focusAfterOpen: await focusInfo(page) }
    d.tabs = await tabs(page, 5)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    d.openAfterEsc = await page.locator('aside').filter({ visible: true }).count()
    d.focusAfterEsc = await focusInfo(page)
    R.drawer = d
    if (!d.openAfterEsc) { await menu.click(); await page.waitForTimeout(300) }
  }
  await page.locator('aside button', { hasText: '클레임 처리 절차' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(1200)
  R.logAriaBusy = await page.$eval('[role="log"]', (e) => e.getAttribute('aria-busy'))
  await page.screenshot({ path: `${OUT}/${vp}-chat.png` })
  rects[`${vp}-chat`] = await rectOf(page, '[role=log]')
  const thumb = page.locator('button[aria-label*="확대"]').first()
  if (await thumb.count()) {
    await thumb.focus(); const op3 = await focusInfo(page)
    await page.keyboard.press('Enter'); await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${vp}-lightbox.png` })
    rects[`${vp}-lightbox`] = await rectOf(page, '[role=dialog] .absolute.top-3.right-3')
    const seq3 = await tabs(page, 6)
    await page.keyboard.press('Escape'); await page.waitForTimeout(200)
    R.lightbox = { opener: op3, tabs: seq3, tabsInsideDialog: `${inDialog(seq3)}/6`, afterClose: await focusInfo(page) }
  } else R.lightbox = 'thumb not found'
  await ctx.close()
}
await browser.close()
fs.writeFileSync(`${OUT}/rects.json`, JSON.stringify(rects, null, 1))
fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(result, null, 1))
console.log(JSON.stringify(result, null, 1))
