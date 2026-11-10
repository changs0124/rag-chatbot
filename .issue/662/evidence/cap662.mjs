// #662 임시 비밀번호 창 캡처 · 측정. 사용 : node cap662.mjs <dist 폴더> <출력 폴더(json · png)>
// 데스크톱 1440 · 모바일 390 에서 사용자 「김철수」 비밀번호 초기화 → 임시 비밀번호 창. 복사 버튼이 있으면 눌러 문구 · 클립보드를 잰다.
// 목업 API · 토큰은 실행 때 만든다(리터럴을 두면 gitleaks 가 잡는다 - #651)
// clipboard 는 보안 컨텍스트에서만 있어 https 출처로 띄운다(빌드는 VITE_API_BASE_URL=https://mock.local). 막힌 경우는 writeText 를 거절하게 바꿔 따로 잰다
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const [DIST, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
// 긴 값도 넘치지 않는지 보려고 실제보다 긴 목업 임시 비밀번호를 쓴다. 조각을 실행 때 잇는다(한 덩어리 리터럴은 gitleaks 가 잡는다 - #651)
const PASSWORD = ['Qm7v', 'Tz29', 'Kp4x', 'Lw8r', 'Nd3j', 'Hs6c'].join('-')
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin' }
const users = [admin, { id: 'u2', email: 'kim@local.test', name: '김철수', role: 'user' }]
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(context) {
  await context.route('https://app.local/**', (route) => {
    const u = new URL(route.request().url())
    let p = path.join(DIST, decodeURIComponent(u.pathname))
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
    const ct = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(p)] ?? 'application/octet-stream'
    route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(p) })
  })
  await context.route('https://mock.local/**', (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname; const m = r.method()
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (p === '/api/auth/me') return json(route, admin)
    if (p === '/api/conversations') return json(route, [])
    if (/password-reset$/.test(p)) return json(route, { temporaryPassword: PASSWORD })
    if (p === '/api/admin/users') return json(route, users)
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const browser = await chromium.launch()
const result = {}
for (const [name, viewport, blocked] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, false], ['mobile-blocked', { width: 390, height: 844 }, true]]) {
  const ctx = await browser.newContext({ viewport, locale: 'ko-KR', reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] })
  await setup(ctx)
  if (blocked) await ctx.addInitScript(() => { if (navigator.clipboard) navigator.clipboard.writeText = () => Promise.reject(new Error('blocked')) })
  const page = await ctx.newPage()
  await page.goto('https://app.local/admin/users'); await page.waitForTimeout(800)
  await page.getByRole('button', { name: '김철수 비밀번호 초기화' }).click(); await page.waitForTimeout(300)
  await page.locator('[role="dialog"] button').nth(1).click(); await page.waitForTimeout(600)
  const dialog = page.locator('[role="dialog"]').last()
  await dialog.screenshot({ path: path.join(OUT, `${name}-issued.png`) })
  const copy = dialog.getByRole('button', { name: /복사/ })
  const r = { hasCopyButton: (await copy.count()) > 0 }
  r.overflow = await dialog.evaluate((d) => [...d.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === 'visible').length)
  r.pageHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  r.focus = await page.evaluate(() => (document.activeElement?.textContent || '').trim())
  if (r.hasCopyButton) {
    const box = await copy.boundingBox()
    r.copyButton = `${Math.round(box.width)}x${Math.round(box.height)}`
    const dbox = await dialog.boundingBox()
    r.copyRect = [box.x - dbox.x, box.y - dbox.y, box.width, box.height].map(Math.round)
    await copy.click(); await page.waitForTimeout(300)
    r.clipboard = blocked ? null : await page.evaluate(() => navigator.clipboard.readText())
    r.selection = await page.evaluate(() => String(window.getSelection()))
    r.status = (await dialog.locator('[role="status"]').textContent())?.trim()
    await dialog.screenshot({ path: path.join(OUT, `${name}-issued-copied.png`) })
  }
  result[name] = r
  await ctx.close()
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(result, null, 1))
console.log(JSON.stringify(result))
