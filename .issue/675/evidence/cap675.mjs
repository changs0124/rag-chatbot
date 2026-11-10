// #675 화면 · 상태 후속 탐침 + 캡처. 사용 : node cap675.mjs <dist 폴더> <출력 폴더(json · png)>
// 두 폭(1440 · 390)에서 ① 대화 삭제 아이콘이 닫기 X 와 같은 모양인지 ② 공백 없는 200자 입력에서 보내기 버튼이 입력줄 안에 있는지
// ③ 첫 목록 실패 뒤 오류가 걷히면 사이드바가 무엇을 말하는지 ④ 관리 화면 「다시 시도」를 누른 동안의 표시
// ⑤ 프로필 메뉴를 연 채 폭 조절 손잡이 자리를 누르면 메뉴가 닫히는지(데스크톱) · 「새 대화」 hover 배경을 잰다
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
]
const DOCS = [{ id: 'd1', filename: '클레임처리지침.pdf', byteSize: 2200000, status: 'completed', uploadedByName: '관리자홍길동', createdAt: iso(now - 86400e3) }]
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
// 목업 토큰은 실행 때 만든다(리터럴은 gitleaks 에 걸린다, #651)
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
const LONG = 'https://example.com/' + 'a'.repeat(180)

async function setup(context, opts = {}) {
  const state = { conv: 0, docs: 0 }
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
      state.conv += 1
      if (opts.listFailFirst && state.conv === 1) return json(route, { message: 'boom' }, 500)
      return json(route, LIST)
    }
    if (p === '/api/admin/documents' && r.method() === 'GET') {
      state.docs += 1
      if (state.docs === 1) return json(route, { message: 'boom' }, 500)
      await new Promise((res) => setTimeout(res, 2000))
      return json(route, DOCS)
    }
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const VPS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const browser = await chromium.launch()
const out = {}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') })
// 바운딩 박스용 좌표(after 이미지에 박스를 그린다) - 선택자에 맞는 보이는 요소들을 감싼 사각형
const boxes = {}
const rectOf = (page, sel) =>
  page.evaluate((sel) => {
    const rs = [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    if (!rs.length) return null
    const x = Math.min(...rs.map((r) => r.left))
    const y = Math.min(...rs.map((r) => r.top))
    return [Math.round(x), Math.round(y), Math.round(Math.max(...rs.map((r) => r.right)) - x), Math.round(Math.max(...rs.map((r) => r.bottom)) - y)]
  }, sel)
const openDrawer = async (page, isMobile) => {
  if (!isMobile) return
  await page.click('button[aria-label="대화 목록 열기"]')
  await page.waitForTimeout(300)
}
const visibleAside = (page) =>
  page.evaluate(() => {
    const aside = [...document.querySelectorAll('aside')].find((a) => a.getBoundingClientRect().width > 0)
    return aside ? aside.innerText : ''
  })

for (const [vp, viewport] of Object.entries(VPS)) {
  const isMobile = vp === 'mobile'
  const o = (out[vp] = {})
  const ctxOpts = { viewport, deviceScaleFactor: 1, isMobile, hasTouch: isMobile, locale: 'ko-KR', reducedMotion: 'reduce' }

  // ① 삭제 아이콘 vs 닫기 X
  {
    const ctx = await browser.newContext(ctxOpts)
    await setup(ctx)
    const page = await ctx.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(800)
    await openDrawer(page, isMobile)
    o.icons = await page.evaluate(() => {
      const aside = [...document.querySelectorAll('aside')].find((a) => a.getBoundingClientRect().width > 0)
      const del = aside?.querySelector('button[aria-label$="대화 삭제"] svg')?.innerHTML ?? null
      const close = document.querySelector('button[aria-label="대화 목록 닫기"] svg')?.innerHTML ?? null
      // 닫기 X 와 같은 그림(선 두 개 대각선)인지 - 데스크톱은 닫기 버튼이 없어 IconClose 모양과 비교
      const xShape = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'
      return { deleteIsX: del === xShape, closeIsX: close === null ? null : close === xShape }
    })
    // 「새 대화」 hover 배경
    const nb = page.locator('aside button', { hasText: '새 대화' }).filter({ visible: true }).first()
    const before = await nb.evaluate((e) => getComputedStyle(e).backgroundColor)
    await nb.hover()
    await page.waitForTimeout(250)
    o.newChatBg = { rest: before, hover: await nb.evaluate((e) => getComputedStyle(e).backgroundColor) }
    boxes[`${vp}-sidebar`] = [await rectOf(page, 'aside button[aria-label$="대화 삭제"]')].filter(Boolean)
    await shot(page, `${vp}-sidebar`)
    await ctx.close()
  }

  // ② 긴 URL 입력
  {
    const ctx = await browser.newContext(ctxOpts)
    await setup(ctx)
    const page = await ctx.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(800)
    const ta = page.locator('textarea').first()
    await ta.fill(LONG)
    await page.waitForTimeout(300)
    o.longUrl = await page.evaluate(() => {
      const ta = document.querySelector('textarea')
      const row = ta.parentElement
      const send = [...row.querySelectorAll('button')].pop()
      const r = row.getBoundingClientRect()
      const s = send.getBoundingClientRect()
      return {
        rowRight: Math.round(r.right),
        sendRight: Math.round(s.right),
        sendInside: s.right <= r.right + 0.5 && s.left >= r.left - 0.5,
        textareaWidth: Math.round(ta.getBoundingClientRect().width),
        pageHScroll: document.documentElement.scrollWidth > window.innerWidth,
      }
    })
    boxes[`${vp}-long-url`] = [await rectOf(page, 'textarea')].filter(Boolean)
    await shot(page, `${vp}-long-url`)
    await ctx.close()
  }

  // ③ 첫 목록 실패 → 오류가 걷힌 뒤 사이드바
  {
    const ctx = await browser.newContext(ctxOpts)
    await setup(ctx, { listFailFirst: true })
    const page = await ctx.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(800)
    await openDrawer(page, isMobile)
    o.listFail = { atFail: (await visibleAside(page)).includes('대화가 없습니다') ? '대화가 없습니다' : (await visibleAside(page)).includes('불러오지 못했') ? '불러오지 못했습니다' : 'other' }
    // 오류를 걷는 동작 - 「새 대화」(useChat 이 error 를 비운다)
    await page.locator('aside button', { hasText: '새 대화' }).filter({ visible: true }).first().click()
    await page.waitForTimeout(400)
    await openDrawer(page, isMobile)
    const txt = await visibleAside(page)
    o.listFail.afterErrorCleared = txt.includes('대화가 없습니다') ? '대화가 없습니다' : txt.includes('불러오지 못했') ? '불러오지 못했습니다' : 'other'
    const retry = page.locator('aside button', { hasText: '다시 시도' }).filter({ visible: true })
    o.listFail.retryButton = (await retry.count()) > 0
    boxes[`${vp}-list-fail`] = [await rectOf(page, 'aside nav > div:last-child, aside nav > p:not([role])')].filter(Boolean)
    await shot(page, `${vp}-list-fail`)
    if (o.listFail.retryButton) {
      await retry.first().click()
      await page.waitForTimeout(800)
      const t2 = await visibleAside(page)
      o.listFail.afterRetryTitles = ['설계불량', '품질 보증'].filter((t) => t2.includes(t)).length
    }
    await ctx.close()
  }

  // ④ 관리 화면 「다시 시도」 진행 표시
  {
    const ctx = await browser.newContext(ctxOpts)
    await setup(ctx)
    const page = await ctx.newPage()
    await page.goto('http://app.local/admin/documents')
    await page.waitForTimeout(900)
    const btn = page.getByRole('button', { name: /다시 시도|다시 읽는 중/ })
    await btn.first().click()
    await page.waitForTimeout(200)
    o.adminRetry = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[role="alert"] button')][0]
      return b ? { text: b.textContent.trim(), disabled: b.disabled } : { text: null, disabled: null }
    })
    boxes[`${vp}-admin-retry-pending`] = [await rectOf(page, '[role="alert"] button')].filter(Boolean)
    await shot(page, `${vp}-admin-retry-pending`)
    await page.waitForTimeout(2400)
    o.adminRetry.afterLoaded = (await page.locator('text=클레임처리지침.pdf').count()) > 0
    await ctx.close()
  }

  // ⑤ 프로필 메뉴 + 손잡이(데스크톱만)
  if (!isMobile) {
    const ctx = await browser.newContext(ctxOpts)
    await setup(ctx)
    const page = await ctx.newPage()
    await page.goto('http://app.local/')
    await page.waitForTimeout(800)
    await page.locator('aside button[aria-expanded]').first().click()
    await page.waitForTimeout(200)
    const sep = await page.locator('[role="separator"]').boundingBox()
    await page.mouse.click(sep.x + sep.width + 4, 450)
    await page.waitForTimeout(250)
    o.menuOverHandle = { menuStillOpen: (await page.locator('aside a[href="/me"]').count()) > 0 }
    await page.reload()
    await page.waitForTimeout(800)
    await page.locator('aside button[aria-expanded]').first().click()
    await page.waitForTimeout(200)
    await page.locator('aside a[href="/me"]').hover()
    await page.waitForTimeout(250)
    boxes[`${vp}-profile-menu-hover`] = [await rectOf(page, 'aside a[href="/me"]')].filter(Boolean)
    await shot(page, `${vp}-profile-menu-hover`)
    await ctx.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(out, null, 1) + '\n')
fs.writeFileSync(path.join(OUT, 'boxes.json'), JSON.stringify(boxes) + '\n')
console.log(JSON.stringify(out, null, 1))
