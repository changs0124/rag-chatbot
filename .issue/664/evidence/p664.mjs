// #664 접근성 · 정렬 잔여 탐침. 사용 : node p664.mjs <dist 폴더> <출력 폴더(json · png)>
// A) 데스크톱 사이드바 폭 조절 손잡이 : 눌리는 폭(가로로 1px 씩 elementFromPoint) · 본문 · 사이드바 위로 나온 폭 · 키보드 포커스 선 두께
// B) 로그인 오류 : 오류 뒤 입력칸의 aria-invalid · aria-describedby 가 오류 문구를 가리키는지
// C) 헤더 제목 왼쪽 x vs 본문 칼럼(메시지 목록) 왼쪽 x — 두 폭
// 목업 API · 토큰은 실행 때 만든다(리터럴은 gitleaks 가 잡는다 - #651)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const [DIST, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
const iso = (ms) => new Date(ms).toISOString()
const now = Date.now()
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin' }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
const messages = [
  { id: 'm1', role: 'user', content: '클레임 처리 절차를 알려 주세요.', status: 'complete', citations: [] },
  { id: 'm2', role: 'assistant', content: '접수 → 1차 판정 → 대책 순으로 처리합니다. 판정이 어려우면 기술 검토 위원회에 회부합니다.', status: 'complete', citations: [] },
]

async function setup(context, { auth = true } = {}) {
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
    if (p === '/api/auth/login') return json(route, { message: '이메일 또는 비밀번호가 올바르지 않습니다' }, 401)
    if (p === '/api/auth/me') return auth ? json(route, admin) : json(route, {}, 401)
    if (p === '/api/conversations' && m === 'GET') return json(route, [{ id: 'c1', title: '클레임 처리 절차', updatedAt: iso(now - 1000) }])
    if (/^\/api\/conversations\/c1\/messages$/.test(p)) return json(route, messages)
    return json(route, {})
  })
  if (auth) await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const browser = await chromium.launch()
const result = {}

// A) 손잡이(데스크톱 전용)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(800)
  const sep = page.locator('[role="separator"]')
  const box = await sep.boundingBox()
  const y = Math.round(box.y + box.height / 2)
  const hits = await page.evaluate(({ x0, y }) => {
    const out = []
    for (let dx = -12; dx <= 16; dx++) {
      const el = document.elementFromPoint(x0 + dx, y)
      out.push({ dx, sep: !!el?.closest('[role="separator"]') })
    }
    return out
  }, { x0: Math.round(box.x), y })
  const on = hits.filter((h) => h.sep).map((h) => h.dx)
  await page.mouse.click(700, 400) // 본문 클릭으로 포커스를 문서에 둔 뒤 Tab 으로 손잡이까지
  await sep.focus()
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab') // focus-visible 을 키보드로
  await page.waitForTimeout(250)
  const line = await page.evaluate(() => {
    const s = document.querySelector('[role="separator"]')
    const span = s.querySelector('span')
    const cs = getComputedStyle(span)
    return { focused: document.activeElement === s, spanWidth: span.getBoundingClientRect().width, spanBg: cs.backgroundColor }
  })
  result.handle = { layoutWidth: box.width, hitFromLeftEdge: on.length ? [Math.min(...on), Math.max(...on)] : null, hitWidth: on.length, intoSidebar: on.length ? Math.max(0, -Math.min(...on)) : 0, intoMain: on.length ? Math.max(0, Math.max(...on) - (box.width - 1)) : 0, focusLine: line }
  await page.screenshot({ path: path.join(OUT, 'desktop-handle-focus.png'), clip: { x: box.x - 60, y: 0, width: 160, height: 300 } })
  await ctx.close()
}

// B) 로그인 오류 · C) 헤더 정렬 — 두 폭
for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  {
    const ctx = await browser.newContext({ viewport, locale: 'ko-KR', reducedMotion: 'reduce' })
    await setup(ctx, { auth: false })
    const page = await ctx.newPage()
    await page.goto('http://app.local/login'); await page.waitForTimeout(600)
    await page.locator('input[type="email"]').fill('nobody@local.test')
    await page.locator('input[type="password"]').fill('wrong-password')
    await page.getByRole('button', { name: '로그인' }).click(); await page.waitForTimeout(600)
    result[`${name}-login`] = await page.evaluate(() => [...document.querySelectorAll('form input')].map((i) => {
      const ids = (i.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean)
      return { type: i.type, ariaInvalid: i.getAttribute('aria-invalid'), describedBy: ids.map((id) => document.getElementById(id)?.textContent?.trim() ?? `(없는 id ${id})`) }
    }))
    await page.screenshot({ path: path.join(OUT, `${name}-login-error.png`) })
    await ctx.close()
  }
  {
    const ctx = await browser.newContext({ viewport, locale: 'ko-KR', reducedMotion: 'reduce' })
    await setup(ctx)
    const page = await ctx.newPage()
    await page.goto('http://app.local/'); await page.waitForTimeout(800)
    if (name === 'mobile') { await page.getByRole('button', { name: '대화 목록 열기' }).click(); await page.waitForTimeout(400) }
    await page.getByRole('button', { name: '클레임 처리 절차', exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(1200)
    result[`${name}-header`] = await page.evaluate(() => {
      const t = document.querySelector('header button[title="제목 변경"]') || document.querySelector('header span')
      const tr = t.getBoundingClientRect()
      const col = document.querySelector('[role="log"]')
      const cr = col.getBoundingClientRect()
      const pad = parseFloat(getComputedStyle(col).paddingLeft)
      const firstText = (() => { const r = document.createRange(); r.selectNodeContents(t); return r.getBoundingClientRect().left })()
      return { titleBoxX: Math.round(tr.left), titleTextX: Math.round(firstText), columnBoxX: Math.round(cr.left), columnContentX: Math.round(cr.left + pad), headerLeft: Math.round(document.querySelector('header').getBoundingClientRect().left), scrollTop: document.scrollingElement.scrollTop }
    })
    await page.screenshot({ path: path.join(OUT, `${name}-chat-header.png`) })
    await ctx.close()
  }
}

fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(result, null, 1))
console.log(JSON.stringify(result))
await browser.close()
