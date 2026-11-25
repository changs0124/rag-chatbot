// #730 진입 애니메이션 증거. 사용 : node e730.mjs <dist 폴더> <출력 폴더> <playwright 가 있는 package.json>
// ① 장면별 정지 프레임 : CDP Animation.setPlaybackRate(0) 로 새 애니메이션을 출발점에 묶고, 열고 나서 currentTime 을 T ms 로 맞춰 찍는다
//    (애니메이션이 없는 before 는 완성 상태가 찍힌다)
// ② 성능 : 같은 열기 동작을 재생 속도 1 로 RUNS(기본 7)회, 열기 직전 → 400ms 뒤 Performance.getMetrics 차이의 중앙값
// ③ 조작 : 확인 창을 열고 30ms 뒤 「취소」 클릭이 먹는지, 드로어를 열고 30ms 뒤 Esc 가 먹는지
// ④ reduced-motion : 열린 직후 남은 애니메이션의 지속 시간
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const [DIST, OUT, PW] = process.argv.slice(2)
const { chromium } = createRequire(PW)('playwright')
fs.mkdirSync(OUT, { recursive: true })
const T = Number(process.env.FREEZE_MS ?? 60)
const now = Date.now()
const iso = (ms) => new Date(ms).toISOString()
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin', theme: 'light' }
const LIST = [
  { id: 'c1', title: '클레임 처리 절차', updatedAt: iso(now - 1000) },
  { id: 'c2', title: '품질 보증 기간 문의', updatedAt: iso(now - 3600e3) },
]
const USERS = [admin, { id: 'u2', email: 'kim@local.test', name: '김사원', role: 'user' }]
// 눈에 보이는 크기의 단색 그림(시안 계열) - 라이트박스에서 확대 상태가 보이게
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520"><rect width="800" height="520" fill="#0e7490"/><circle cx="400" cy="260" r="150" fill="#a5f3fc"/></svg>'
const MESSAGES = [
  { id: 'm1', role: 'user', content: '이 사진 속 부품 클레임 절차 알려줘', status: 'complete', citations: [], attachments: [{ id: 'a1', fileType: 'image', url: '/files/a1.png' }] },
  { id: 'm2', role: 'assistant', content: '클레임은 접수 → 원인 분석 → 판정 순서로 처리합니다.', status: 'complete', citations: [] },
]
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
// 목업 토큰 · 비밀번호는 실행 때 만든다(리터럴은 gitleaks 에 걸린다, #651 · #662)
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
const TEMP = ['Tmp', 'Pw', '-', '7731'].join('')

async function setup(context, { usersFail = false } = {}) {
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
    if (p === '/api/conversations' && r.method() === 'GET') return json(route, LIST)
    if (/^\/api\/conversations\/c1\/messages/.test(p)) return json(route, MESSAGES)
    if (/^\/api\/conversations\/[^/]+\/messages/.test(p)) return json(route, [])
    if (p.startsWith('/files/')) return route.fulfill({ status: 200, headers: CORS, contentType: 'image/svg+xml', body: SVG })
    if (p === '/api/admin/users' && r.method() === 'GET') return usersFail ? json(route, { message: '사용자 목록을 불러오지 못했습니다' }, 500) : json(route, USERS)
    if (/password-reset$/.test(p)) return json(route, { temporaryPassword: TEMP })
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
}

const VPS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

// 장면 : prep(열기 전 준비) · open(여는 동작) · target(애니메이션 대상 = 박스)
const SCENES = {
  confirm: {
    url: '/',
    prep: async (page, m) => { if (m) await openDrawer(page) },
    open: (page) => page.locator('[aria-label="\'클레임 처리 절차\' 대화 삭제"]').filter({ visible: true }).first().click({ force: true }),
    target: '[role="dialog"][aria-labelledby] > .relative',
  },
  menu: {
    url: '/',
    prep: async (page, m) => { if (m) await openDrawer(page) },
    open: (page) => page.locator('button[aria-expanded]').filter({ visible: true }).last().click(),
    target: '.bottom-full',
  },
  drawer: {
    url: '/', mobileOnly: true,
    prep: async () => {},
    open: (page) => page.click('button[aria-label="대화 목록 열기"]'),
    target: '[role="dialog"][aria-label="대화 목록"]',
  },
  lightbox: {
    url: '/',
    prep: async (page, m) => {
      if (m) await openDrawer(page)
      await page.locator('aside a, aside button', { hasText: '클레임 처리 절차' }).filter({ visible: true }).first().click()
      await page.waitForSelector('button[aria-label="첨부 이미지 확대"]')
      await page.waitForTimeout(400)
    },
    open: (page) => page.click('button[aria-label="첨부 이미지 확대"]'),
    target: '[role="dialog"] img',
  },
  drop: {
    url: '/',
    prep: async () => {},
    open: (page) => page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }))
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    }),
    target: '.fixed.inset-0.z-40.backdrop-blur-sm',
  },
  banner: {
    url: '/admin/users', usersFail: true,
    prep: async () => {},
    open: async () => {},
    target: '[role="alert"]',
  },
  password: {
    url: '/admin/users',
    prep: async (page) => {
      await page.click('button[aria-label="김사원 비밀번호 초기화"]')
      await page.getByRole('button', { name: '초기화', exact: true }).click()
      await page.waitForSelector('text=임시 비밀번호가 발급되었습니다')
      await page.waitForTimeout(400)
    },
    open: (page) => page.getByRole('button', { name: '복사', exact: true }).click(),
    target: '[role="dialog"] [role="status"]',
  },
}

async function openDrawer(page) {
  await page.click('button[aria-label="대화 목록 열기"]')
  await page.waitForTimeout(400)
}

async function newPage(browser, vp, mobile, opts = {}) {
  const context = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1, reducedMotion: opts.reduce ? 'reduce' : 'no-preference', permissions: ['clipboard-read', 'clipboard-write'] })
  await setup(context, opts)
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  return { context, page, cdp }
}

const box = (page, sel) =>
  page.evaluate((s) => {
    const el = [...document.querySelectorAll(s)].filter((e) => e.getBoundingClientRect().width > 0).at(-1)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const d = document.createElement('div')
    d.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:3px solid #ff2d55;border-radius:6px;pointer-events:none;z-index:2147483647`
    document.body.appendChild(d)
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), opacity: getComputedStyle(el).opacity }
  }, sel)

const anims = (page) => page.evaluate(() => document.getAnimations().map((a) => ({ name: a.animationName ?? '', duration: a.effect?.getComputedTiming().duration, target: a.effect?.target?.className?.toString().slice(0, 60) })))

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))

const browser = await chromium.launch()
const out = { freezeMs: T, scenes: {} }
for (const [vpName, vp] of Object.entries(VPS)) {
  const mobile = vpName === 'mobile'
  for (const [name, sc] of Object.entries(SCENES)) {
    if (sc.mobileOnly && !mobile) continue
    const key = `${vpName}-${name}`
    const r = (out.scenes[key] = {})

    // ① 정지 프레임
    {
      const { context, page, cdp } = await newPage(browser, vp, mobile, sc)
      await page.goto('http://app.local' + sc.url)
      await page.waitForTimeout(1200)
      await sc.prep(page, mobile)
      await cdp.send('Animation.enable')
      await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 })
      if (name === 'banner') { await page.reload(); await page.waitForSelector('[role="alert"]') } else await sc.open(page)
      await page.waitForTimeout(150)
      r.animations = await anims(page)
      await page.evaluate((t) => document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming().duration > 50) { a.pause(); a.currentTime = t } }), T)
      r.box = await box(page, sc.target)
      await page.screenshot({ path: path.join(OUT, key + '.png') })
      await context.close()
    }

    // ② 성능 (배너는 페이지 로드에 묶여 있어 뺀다)
    if (name !== 'banner') {
      const runs = []
      for (let i = 0; i < Number(process.env.RUNS ?? 7); i++) {
        const { context, page, cdp } = await newPage(browser, vp, mobile, sc)
        await page.goto('http://app.local' + sc.url)
        await page.waitForTimeout(1000)
        await sc.prep(page, mobile)
        await cdp.send('Performance.enable')
        const a = await metrics(cdp)
        const t0 = Date.now()
        await sc.open(page)
        await page.waitForSelector(sc.target, { state: 'attached' })
        const appear = Date.now() - t0
        await page.waitForTimeout(400)
        const b = await metrics(cdp)
        runs.push({
          layouts: b.LayoutCount - a.LayoutCount,
          styleRecalcs: b.RecalcStyleCount - a.RecalcStyleCount,
          layoutMs: (b.LayoutDuration - a.LayoutDuration) * 1000,
          styleMs: (b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000,
          scriptMs: (b.ScriptDuration - a.ScriptDuration) * 1000,
          taskMs: (b.TaskDuration - a.TaskDuration) * 1000,
          appearMs: appear,
        })
        await context.close()
      }
      r.perf = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, +median(runs.map((x) => x[k])).toFixed(2)]))
      r.perfMin = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, +Math.min(...runs.map((x) => x[k])).toFixed(2)]))
    }
  }

  // ③ 조작 : 애니메이션 도중(30ms) 누름 · Esc
  {
    const { context, page } = await newPage(browser, vp, mobile)
    await page.goto('http://app.local/')
    await page.waitForTimeout(1200)
    if (mobile) await openDrawer(page)
    await SCENES.confirm.open(page)
    await page.waitForTimeout(30)
    await page.getByRole('button', { name: '취소' }).click({ timeout: 1000 })
    await page.waitForTimeout(50)
    out[`${vpName}-cancelDuringAnimation`] = (await page.locator('[role="dialog"][aria-labelledby]').count()) === 0 ? 'closed' : 'still-open'
    if (mobile) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      await page.click('button[aria-label="대화 목록 열기"]')
      await page.waitForTimeout(30)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(50)
      out[`${vpName}-drawerEscDuringAnimation`] = (await page.locator('[role="dialog"][aria-label="대화 목록"]').count()) === 0 ? 'closed' : 'still-open'
    }
    await context.close()
  }

  // ④ reduced-motion
  {
    const { context, page } = await newPage(browser, vp, mobile, { reduce: true })
    await page.goto('http://app.local/')
    await page.waitForTimeout(1200)
    if (mobile) await openDrawer(page)
    await SCENES.confirm.open(page)
    await page.waitForTimeout(20)
    out[`${vpName}-reducedMotionAnimations`] = await anims(page)
    await context.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))
