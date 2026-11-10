// #663 사이드바 첫 로드 탐침 + 캡처. 사용 : node cap663.mjs <dist 폴더> <출력 폴더(json · png)>
// 대화 목록 응답을 3초 늦춰 로딩 중 · 다 읽은 뒤 · 빈 목록 · 실패를 두 폭(1440 · 390, 모바일은 드로어를 열어)에서 잰다
import { createRequire } from 'node:module'
const { chromium } = createRequire('C:/Users/User/AppData/Local/Temp/claude/cc19ec6eeab1f0fc/4a16aa4c-6f47-4da6-997b-0871147ba147/scratchpad/design/package.json')('playwright')
import fs from 'node:fs'
import path from 'node:path'

const [DIST, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin' }
const LIST = [
  { id: 'c1', title: '설계불량(부품선정오류) 클레임 처리 절차', updatedAt: iso(now - 1000) },
  { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
  { id: 'c3', title: '지난주 납품 지연 건', updatedAt: iso(now - 3 * 86400e3) },
]
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
// 목업 토큰은 실행 때 만든다(리터럴은 gitleaks 에 걸린다, #651)
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'

async function setup(context, listMode) {
  await context.route('http://app.local/**', (route) => {
    const u = new URL(route.request().url())
    let p = path.join(DIST, decodeURIComponent(u.pathname))
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
    const ct = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(p)] ?? 'application/octet-stream'
    route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(p) })
  })
  await context.route('http://mock.local/**', async (route) => {
    const r = route.request()
    const p = new URL(r.url()).pathname
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (p === '/api/auth/me') return json(route, admin)
    if (p === '/api/conversations' && r.method() === 'GET') {
      await new Promise((res) => setTimeout(res, 3000))
      if (listMode === 'fail') return json(route, { message: 'boom' }, 500)
      return json(route, listMode === 'empty' ? [] : LIST)
    }
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const probe = (page) =>
  page.evaluate(() => {
    const aside = [...document.querySelectorAll('aside')].find((a) => a.getBoundingClientRect().width > 0)
    const txt = aside ? aside.innerText : ''
    return {
      emptyTextShown: txt.includes('대화가 없습니다'),
      skeleton: !!aside?.querySelector('[data-testid="conversation-list-skeleton"]'),
      rows: aside ? aside.querySelectorAll('nav button[aria-current], nav li button, nav [data-conv]').length : 0,
      titlesShown: ['설계불량', '품질 보증'].filter((t) => txt.includes(t)).length,
      status: [...document.querySelectorAll('[role="status"]')].map((s) => s.textContent.trim()).filter(Boolean),
      alert: [...document.querySelectorAll('[role="alert"]')].map((s) => s.textContent.trim()).filter(Boolean),
    }
  })

const VPS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const browser = await chromium.launch()
const out = {}
for (const [vp, viewport] of Object.entries(VPS)) {
  const isMobile = vp === 'mobile'
  out[vp] = {}
  for (const mode of ['list', 'empty', 'fail']) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile, hasTouch: isMobile, locale: 'ko-KR', reducedMotion: 'reduce' })
    await setup(ctx, mode)
    const page = await ctx.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(700)
    if (isMobile) {
      await page.click('button[aria-label="대화 목록 열기"]')
      await page.waitForTimeout(300)
    }
    const loading = await probe(page)
    if (mode === 'list') await page.screenshot({ path: path.join(OUT, `${vp}-loading.png`) })
    await page.waitForTimeout(3200)
    const done = await probe(page)
    await page.screenshot({ path: path.join(OUT, `${vp}-${mode}-done.png`) })
    out[vp][mode] = { loading, done }
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
