// #656 포커스 후속 탐침. 사용 : node p656.mjs <dist 폴더> <출력 폴더(json · png)>
// A) 390 에서 드로어를 연 채 1024 로 넓힌 뒤 inert 수 · body overflow · 데스크톱 사이드바를 누를 수 있는지
// B) 확인 창이 닫힌 뒤 포커스 : 비밀번호 초기화 실패 · 문서 삭제 성공 · (모바일) 드로어 안 대화 삭제 + 그 뒤 Esc
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
const users = [admin, { id: 'u2', email: 'kim@local.test', name: '김철수', role: 'user' }]
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(context) {
  const conversations = [
    { id: 'c1', title: '클레임 처리 절차', updatedAt: iso(now - 1000) },
    { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
  ]
  const documents = [
    { id: 'd1', filename: '클레임처리지침.pdf', byteSize: 2_345_678, status: 'completed', uploadedByName: '관리자홍길동', createdAt: iso(now - 86400e3) },
    { id: 'd2', filename: '스캔본.pdf', byteSize: 9_000_000, status: 'failed', uploadedByName: '김철수', createdAt: iso(now - 40 * 86400e3) },
  ]
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
    if (/^\/api\/conversations\/[^/]+$/.test(p) && m === 'DELETE') {
      conversations.splice(conversations.findIndex((c) => p.endsWith(c.id)), 1)
      return route.fulfill({ status: 204, headers: CORS })
    }
    if (/^\/api\/conversations\/[^/]+\/messages$/.test(p)) return json(route, [])
    if (/^\/api\/admin\/documents\/[^/]+$/.test(p) && m === 'DELETE') {
      documents.splice(documents.findIndex((d) => p.endsWith(d.id)), 1)
      return route.fulfill({ status: 204, headers: CORS })
    }
    if (p === '/api/admin/documents') return json(route, documents)
    if (/password-reset$/.test(p)) return json(route, { code: 'INTERNAL', message: '일시 오류' }, 500)
    if (p === '/api/admin/users') return json(route, users)
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const focusInfo = (page) => page.evaluate(() => {
  const e = document.activeElement
  if (!e || e === document.body) return 'BODY'
  const name = e.getAttribute('aria-label') || (e.textContent || '').trim().slice(0, 30) || e.getAttribute('type') || ''
  return `${e.tagName.toLowerCase()}「${name}」`
})
// 확인 창의 확정 버튼(두 번째 버튼)을 누른다
const confirm = async (page) => {
  await page.locator('[role="dialog"][aria-labelledby] button').nth(1).click()
  await page.waitForTimeout(600)
}

const browser = await chromium.launch()
const result = {}

// A) 회전 : 390 에서 드로어 열기 → 1024 로 넓힘
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(800)
  await page.getByRole('button', { name: '대화 목록 열기' }).click(); await page.waitForTimeout(400)
  // 보이는 「새 대화」 버튼 중 드로어 밖 것이 inert 안에 있는지 · 보이는 대화 항목을 실제로 눌러 대화가 열리는지
  const snap = () => page.evaluate(() => {
    const visible = [...document.querySelectorAll('button')].filter((b) => b.offsetParent && /새 대화/.test(b.textContent || ''))
    const outside = visible.find((b) => !b.closest('[role="dialog"][aria-label="대화 목록"]'))
    return {
      width: innerWidth,
      inertCount: document.querySelectorAll('[inert]').length,
      bodyOverflow: document.body.style.overflow || '(비어 있음)',
      drawerInDom: !!document.querySelector('[role="dialog"][aria-label="대화 목록"]'),
      desktopNewChatInert: outside ? !!outside.closest('[inert]') : null,
    }
  })
  const opened = await snap()
  await page.screenshot({ path: `${OUT}/rotate-390-open.png` })
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(500)
  const wide = await snap()
  // 사이드바의 두 번째 대화를 눌러 본다 - inert 면 눌리지 않아 머리 제목이 그대로다
  const item = page.locator('button', { hasText: '품질 보증 기간 문의' }).filter({ visible: true }).first()
  await item.click({ timeout: 3000, force: true }).catch(() => {})
  await page.waitForTimeout(500)
  wide.clickOpenedConversation = await page.evaluate(() => /품질 보증 기간 문의/.test(document.querySelector('header')?.textContent || ''))
  await page.screenshot({ path: `${OUT}/rotate-1024-after.png` })
  result.rotate = { opened390: opened, after1024: wide }
  await ctx.close()
}

// B) 확인 창이 닫힌 뒤 포커스
for (const [vp, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } })) {
  const ctx = await browser.newContext({ viewport, isMobile: vp === 'mobile', hasTouch: vp === 'mobile', locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  const R = (result[vp] = {})

  await page.goto('http://app.local/admin/users'); await page.waitForTimeout(800)
  await page.locator('button[aria-label$="비밀번호 초기화"]').first().click(); await page.waitForTimeout(300)
  await confirm(page)
  R.resetFailedFocus = await focusInfo(page)
  await page.screenshot({ path: `${OUT}/${vp}-reset-failed.png` })

  await page.goto('http://app.local/admin/documents'); await page.waitForTimeout(800)
  await page.locator('li button').first().click(); await page.waitForTimeout(300)
  await confirm(page)
  R.docDeletedFocus = await focusInfo(page)

  if (vp === 'mobile') {
    await page.goto('http://app.local/'); await page.waitForTimeout(800)
    await page.getByRole('button', { name: '대화 목록 열기' }).click(); await page.waitForTimeout(400)
    await page.locator('[role="dialog"][aria-label="대화 목록"] [aria-label$="대화 삭제"]').first().click(); await page.waitForTimeout(300)
    await confirm(page)
    R.drawerConvDeletedFocus = await focusInfo(page)
    await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    R.drawerOpenAfterEsc = await page.locator('[role="dialog"][aria-label="대화 목록"]').count()
    await page.screenshot({ path: `${OUT}/${vp}-drawer-after-delete-esc.png` })
  }
  await ctx.close()
}
await browser.close()
fs.writeFileSync(`${OUT}/probe.json`, JSON.stringify(result, null, 1))
console.log(JSON.stringify(result, null, 1))
