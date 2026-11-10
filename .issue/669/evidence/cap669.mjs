// #669 모바일 드로어 전체 화면 + X 닫기 탐침 · 캡처. 사용 : node cap669.mjs <dist 폴더> <출력 폴더(json · png)>
// 390 : 드로어를 열어 폭 · 높이 · X 버튼 크기 · 열린 뒤 포커스, X 로 닫은 뒤 열림 수 · 포커스 · inert 수 · body overflow, Esc 로 닫기
// 1440 : 데스크톱 사이드바 캡처(전후 픽셀 대조용)
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

async function setup(context) {
  const conversations = [
    { id: 'c1', title: '클레임 처리 절차', updatedAt: iso(now - 1000) },
    { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
    { id: 'c3', title: '지난주 납품 지연 건', updatedAt: iso(now - 3 * 86400e3) },
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
    if (/^\/api\/conversations\/[^/]+\/messages$/.test(p)) return json(route, [])
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const focusInfo = (page) => page.evaluate(() => {
  const e = document.activeElement
  if (!e || e === document.body) return 'BODY'
  const name = e.getAttribute('aria-label') || (e.textContent || '').trim().slice(0, 30) || ''
  return `${e.tagName.toLowerCase()}「${name}」`
})
const state = (page) => page.evaluate(() => ({
  open: document.querySelectorAll('[role="dialog"][aria-label="대화 목록"]').length,
  inert: document.querySelectorAll('[inert]').length,
  bodyOverflow: document.body.style.overflow || '(비어 있음)',
}))

const browser = await chromium.launch()
const result = {}

// 모바일 390
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(800)
  await page.getByRole('button', { name: '대화 목록 열기' }).click(); await page.waitForTimeout(400)
  const panel = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="대화 목록"]')
    const aside = d?.querySelector('aside')?.getBoundingClientRect()
    const x = [...(d?.querySelectorAll('button') ?? [])].find((b) => b.getAttribute('aria-label') === '대화 목록 닫기')?.getBoundingClientRect()
    return {
      panel: aside ? { x: aside.x, width: Math.round(aside.width), height: Math.round(aside.height) } : null,
      viewport: { width: innerWidth, height: innerHeight },
      closeButton: x ? { x: Math.round(x.x), y: Math.round(x.y), width: Math.round(x.width), height: Math.round(x.height) } : null,
    }
  })
  result.mobile = { opened: { ...panel, focus: await focusInfo(page), ...(await state(page)) } }
  await page.screenshot({ path: path.join(OUT, 'mobile-drawer.png') })

  const close = page.getByRole('button', { name: '대화 목록 닫기' })
  if (await close.count()) {
    await close.click(); await page.waitForTimeout(400)
    result.mobile.afterX = { focus: await focusInfo(page), ...(await state(page)) }
  } else {
    // 전(before)에는 X 가 없다 - 오른쪽 배경을 눌러 닫고 이어 간다
    result.mobile.afterX = 'X 버튼 없음'
    await page.mouse.click(380, 400); await page.waitForTimeout(400)
    result.mobile.afterBackdrop = { focus: await focusInfo(page), ...(await state(page)) }
  }
  await page.getByRole('button', { name: '대화 목록 열기' }).click(); await page.waitForTimeout(400)
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  result.mobile.afterEsc = { focus: await focusInfo(page), ...(await state(page)) }
  await page.screenshot({ path: path.join(OUT, 'mobile-closed.png') })
  await ctx.close()
}

// 데스크톱 1440 - 사이드바는 변하지 않아야 한다
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', reducedMotion: 'reduce' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/'); await page.waitForTimeout(800)
  result.desktop = {
    closeButtons: await page.getByRole('button', { name: '대화 목록 닫기' }).count(),
    sidebarWidth: await page.evaluate(() => Math.round(document.querySelector('aside')?.getBoundingClientRect().width ?? 0)),
  }
  await page.screenshot({ path: path.join(OUT, 'desktop-sidebar.png') })
  await ctx.close()
}

await browser.close()
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(result, null, 1))
console.log(JSON.stringify(result))
