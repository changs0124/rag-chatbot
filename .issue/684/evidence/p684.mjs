// #684 3차 리뷰 코드 후속 탐침. 사용 : node p684.mjs <dist 폴더> <출력 폴더(json · png)>
// 두 폭(1440 · 390)에서 ① 첫 목록 실패 → 사이드바 「다시 시도」 : 누른 동안 버튼 · 포커스, 성공 뒤 입력창 위 오류 줄(role=alert)이 남는지
// ② 다시 시도가 또 실패하면 알리는지 ③ (데스크톱) 대화 삭제 확인 창을 연 채 700 폭 → 취소 뒤 포커스가 어디 있는지
// ④ (모바일) 드로어를 열었을 때 첫 포커스 · Tab 순서에서 X 의 자리 · 드로어 오른쪽 끝 테두리 폭
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
  { id: 'c1', title: '클레임 처리 절차', updatedAt: iso(now - 1000) },
  { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
]
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
// 목업 토큰은 실행 때 만든다(리터럴은 gitleaks 에 걸린다, #651)
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'

// fails : 목록 GET 을 처음 몇 번 실패시킬지. 실패 · 성공 모두 1.2초 늦춰 「누른 동안」을 잴 수 있게
async function setup(context, fails = 0) {
  let n = 0
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
      n += 1
      if (n > 1) await new Promise((res) => setTimeout(res, 1200))
      if (n <= fails) return json(route, { message: 'boom' }, 500)
      return json(route, LIST)
    }
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const VPS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const browser = await chromium.launch()
const out = {}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') })
const active = (page) =>
  page.evaluate(() => {
    const a = document.activeElement
    if (!a || a === document.body) return 'BODY'
    return `${a.tagName.toLowerCase()}「${a.getAttribute('aria-label') || a.textContent.trim().slice(0, 20)}」`
  })
const alerts = (page) => page.evaluate(() => [...document.querySelectorAll('[role="alert"]')].map((e) => e.textContent.trim()).filter(Boolean))
const sidebarState = (page) =>
  page.evaluate(() => {
    const aside = [...document.querySelectorAll('aside')].find((a) => a.getBoundingClientRect().width > 0)
    const btn = aside && [...aside.querySelectorAll('button')].find((b) => /다시 시도|다시 읽는 중/.test(b.textContent))
    return { text: aside ? aside.innerText.replace(/\s+/g, ' ').slice(0, 200) : '', retryButton: btn ? { text: btn.textContent.trim(), disabled: btn.disabled } : null }
  })

for (const [name, vp] of Object.entries(VPS)) {
  const isMobile = name === 'mobile'
  const r = (out[name] = {})
  for (const [label, fails] of [['retryOk', 1], ['retryFail', 2]]) {
    const context = await browser.newContext({ viewport: vp, isMobile, hasTouch: isMobile, deviceScaleFactor: 1 })
    await setup(context, fails)
    const page = await context.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(1200)
    if (isMobile) {
      await page.click('button[aria-label="대화 목록 열기"]')
      await page.waitForTimeout(300)
    }
    const s = (r[label] = {})
    s.beforeRetry = { sidebar: await sidebarState(page), alerts: await alerts(page) }
    const retry = page.locator('aside button', { hasText: '다시 시도' }).filter({ visible: true }).first()
    await retry.focus()
    await retry.click()
    await page.waitForTimeout(300)
    s.during = { sidebar: await sidebarState(page), focus: await active(page) }
    if (label === 'retryOk') await shot(page, `${name}-retry-during`)
    await page.waitForTimeout(1600)
    s.after = { sidebar: await sidebarState(page), alerts: await alerts(page), focus: await active(page) }
    await shot(page, `${name}-${label}-after`)
    await context.close()
  }

  if (!isMobile) {
    const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 })
    await setup(context, 0)
    const page = await context.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(1200)
    const del = page.locator('aside button[aria-label="\'클레임 처리 절차\' 대화 삭제"]').first()
    await del.focus()
    await del.click()
    await page.waitForTimeout(300)
    await page.setViewportSize({ width: 700, height: 900 })
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '취소' }).click()
    await page.waitForTimeout(300)
    r.hiddenSidebarConfirm = { focusAfterCancel: await active(page) }
    await context.close()
  } else {
    const context = await browser.newContext({ viewport: vp, isMobile, hasTouch: true, deviceScaleFactor: 1 })
    await setup(context, 0)
    const page = await context.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(1200)
    await page.click('button[aria-label="대화 목록 열기"]')
    await page.waitForTimeout(300)
    const first = await active(page)
    const order = []
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      order.push(await active(page))
    }
    const border = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="대화 목록"]')
      const aside = d && d.querySelector('aside')
      return aside ? getComputedStyle(aside).borderRightWidth : null
    })
    r.drawer = { firstFocus: first, tabOrder: order, asideBorderRight: border }
    await shot(page, `${name}-drawer`)
    await context.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
