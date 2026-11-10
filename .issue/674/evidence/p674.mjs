// #674 포커스 · inert 후속 탐침. 사용 : node p674.mjs <dist 폴더> <출력 폴더(json · png)>
// A) 1440 에서 사이드바 대화 삭제 확인 창을 띄운 채 700 폭으로 줄임 → 확인 창이 보이는지 · inert 수 · 취소 뒤 inert
// C) Safari 흉내 : 클릭이 버튼에 포커스를 주지 않는 경우(pointerdown + el.click(), activeElement 는 body) 확인 창을 열고 Esc → 포커스
//    모바일은 드로어 안에서 같은 식으로 연 뒤 취소 → 그 뒤 Esc 로 드로어가 닫히는지
// (드로어 + 이동 확인 창 회전 · 삭제 실패 뒤 ref 는 목업으로 재현되지 않아 단위 테스트로 지킨다)
// 목업 API · 토큰은 실행 때 만든다(리터럴을 두면 gitleaks 가 잡는다 - #651)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const [DIST, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin' }
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(context, opts = {}) {
  const conversations = [
    { id: 'c1', title: '클레임 처리 절차', updatedAt: iso(now - 1000) },
    { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
  ]
  const state = { failDelete: !!opts.failDelete }
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
    if (p === '/api/conversations' && m === 'POST') return json(route, { id: 'c9', title: '새 대화', updatedAt: iso(Date.now()) })
    if (/^\/api\/conversations\/[^/]+$/.test(p) && m === 'DELETE') {
      if (state.failDelete) return json(route, { code: 'INTERNAL', message: '일시 오류' }, 500)
      conversations.splice(conversations.findIndex((c) => p.endsWith(c.id)), 1)
      return route.fulfill({ status: 204, headers: CORS })
    }
    if (/^\/api\/conversations\/[^/]+\/messages$/.test(p)) return json(route, [])
    // 답변 스트림은 끝내지 않는다 - 「답변 중」 상태를 붙잡아 이동 확인 창을 띄우기 위해
    if (p === '/api/chat') return
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
  return { conversations, state }
}

const focusInfo = (page) => page.evaluate(() => {
  const e = document.activeElement
  if (!e || e === document.body) return 'BODY'
  const name = e.getAttribute('aria-label') || (e.textContent || '').trim().slice(0, 30) || ''
  return `${e.tagName.toLowerCase()}「${name}」`
})
const snap = (page) => page.evaluate(() => {
  const dlg = [...document.querySelectorAll('[role="dialog"][aria-labelledby]')]
  const vis = dlg.filter((d) => { const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
  const ta = document.querySelector('textarea')
  return {
    width: innerWidth,
    confirmInDom: dlg.length,
    confirmVisible: vis.length,
    inert: document.querySelectorAll('[inert]').length,
    composerInert: !!ta?.closest('[inert]'),
  }
})
// Safari 흉내 : pointerdown 을 보내고 el.click() - 버튼에 포커스가 가지 않는다
const safariClick = (page, selector) => page.evaluate((sel) => {
  ;(document.activeElement)?.blur?.()
  const el = document.querySelector(sel)
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }))
  el.click()
  return document.activeElement === document.body
}, selector)

const browser = await chromium.launch()
const result = {}

// A) 데스크톱 확인 창 → 폭 축소
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(800)
  await page.getByRole('button', { name: "'클레임 처리 절차' 대화 삭제" }).first().click(); await page.waitForTimeout(300)
  const at1440 = await snap(page)
  await page.setViewportSize({ width: 700, height: 900 }); await page.waitForTimeout(400)
  const at700 = await snap(page)
  await page.screenshot({ path: path.join(OUT, 'A-confirm-700.png') })
  // 보이는 확인 창이 있으면 그 취소를 누른다. 없으면 사용자는 누를 곳이 없다(Esc 만 풀 수 있음)
  let cancelled = false
  if (at700.confirmVisible) {
    await page.getByRole('button', { name: '취소' }).click(); await page.waitForTimeout(300); cancelled = true
  }
  const afterCancel = await snap(page)
  result.A = { at1440, at700, cancelledByButton: cancelled, afterCancel }
  await ctx.close()
}

// C) Safari 흉내
for (const [label, vp] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(800)
  const r = {}
  if (label === 'mobile') {
    await page.getByRole('button', { name: '대화 목록 열기' }).click(); await page.waitForTimeout(300)
    r.openerWasBody = await safariClick(page, `[role="dialog"][aria-label="대화 목록"] [aria-label="'클레임 처리 절차' 대화 삭제"]`)
  } else {
    r.openerWasBody = await safariClick(page, `aside [aria-label="'클레임 처리 절차' 대화 삭제"]`)
  }
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  r.focusAfterCancel = await focusInfo(page)
  if (label === 'mobile') {
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    r.drawerOpenAfterSecondEsc = await page.locator('[role="dialog"][aria-label="대화 목록"]').count()
  }
  result[`C-${label}`] = r
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(result, null, 1))
console.log(JSON.stringify(result))
