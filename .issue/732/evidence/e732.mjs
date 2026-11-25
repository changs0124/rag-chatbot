// #732 — #730 진입 애니메이션 측정 하네스의 고친 판(#730 리뷰 후속). #730 의 e730.mjs 는 당시 기록으로 그대로 둔다
// 사용 : RUNS=15 FREEZE_MS=15 node e732.mjs <dist 폴더> <출력 폴더> <playwright 가 있는 package.json>
// ① 정지 프레임 : CDP Animation.setPlaybackRate(0) 로 새 애니메이션을 출발점에 묶고, 열고 나서 currentTime 을 FREEZE_MS 로 맞춰 찍는다.
//    박스 · 실효 opacity(조상까지 곱) · 계산된 scale/translate 는 실제로 움직이는 요소에서 잰다
// ② 성능 : 같은 열기 동작을 RUNS 회. 실행마다 페이지 안 rAF 로
//    attachMs(대상이 DOM 에 생긴 첫 프레임 — CSS 애니메이션은 이 시점을 늦출 수 없다) · settledMs(대상과 조상에 도는 애니메이션이 없는 첫 프레임 = 눈에 보이는 완성)
//    + Performance.getMetrics 차이(열기 → 400ms) + PerformanceObserver('longtask') 개수 · 최대 길이를 남긴다. 실행별 값은 runs 에 전부
// ③ 조작 : 확인 창을 열고 30ms 뒤 「취소」를 **좌표로** 누른다(locator.click 은 요소가 멈출 때까지 기다려 애니메이션 뒤에 눌린다).
//    pointerdown 순간의 애니메이션 currentTime 을 함께 남긴다. 드로어는 30ms 뒤 Esc
// ④ reduced-motion : 창이 실제로 열렸는지 + 카드의 animationName · animationDuration
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'

const [DIST, OUT, PW] = process.argv.slice(2)
const { chromium } = createRequire(PW)('playwright')
fs.mkdirSync(OUT, { recursive: true })
const T = Number(process.env.FREEZE_MS ?? 15)
const RUNS = Number(process.env.RUNS ?? 15)
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

async function setup(context, { usersFail = false, resetFail = false } = {}) {
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
    if (/password-reset$/.test(p)) return resetFail ? json(route, { message: '초기화하지 못했습니다' }, 500) : json(route, { temporaryPassword: TEMP })
    return json(route, {})
  })
  await context.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), TOKEN)
  await context.addInitScript(() => {
    window.__lt = []
    try {
      new PerformanceObserver((l) => window.__lt.push(...l.getEntries().map((e) => ({ s: e.startTime, d: e.duration })))).observe({ type: 'longtask', buffered: true })
    } catch {}
    const find = (sels, needle) => {
      for (const s of sels) {
        const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0 && (!needle || e.textContent.includes(needle)))
        if (el) return el
      }
      return null
    }
    window.__find = find
    // 대상과 조상에 running 애니메이션이 하나라도 있으면 아직 완성 전
    const moving = (el) => { for (let e = el; e; e = e.parentElement) if (e.getAnimations().some((a) => a.playState === 'running')) return true; return false }
    // 대상이 생긴 프레임부터 ms 뒤에 action 을 실행하고, 그 순간의 진입 애니메이션 상태를 함께 돌려준다
    window.__atMs = (sels, ms, action) => new Promise((res) => {
      const t0 = performance.now()
      const wait = () => {
        if (!find(sels, null)) { if (performance.now() - t0 > 3000) return res({ error: 'not-found' }); return requestAnimationFrame(wait) }
        const seen = performance.now()
        setTimeout(() => {
          const anims = document.getAnimations().filter((a) => a.animationName).map((a) => ({ name: a.animationName, currentTime: a.currentTime === null ? null : +Number(a.currentTime).toFixed(1), playState: a.playState }))
          const r = action()
          res({ sinceAppearMs: +(performance.now() - seen).toFixed(1), entryAnimations: anims, ...r })
        }, ms)
      }
      requestAnimationFrame(wait)
    })
    window.__probe = (sels, needle) => new Promise((res) => {
      const t0 = performance.now()
      let attach = null
      const tick = () => {
        const t = performance.now() - t0
        const el = find(sels, needle)
        if (el && attach === null) attach = t
        if (el && !moving(el)) return res({ t0, attachMs: +attach.toFixed(1), settledMs: +t.toFixed(1) })
        if (t > 3000) return res({ t0, attachMs: attach, settledMs: null })
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  })
}


const VPS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

// 장면 : prep(열기 전 준비) · open(여는 동작) · sels(대상 — 앞에서부터 처음 찾은 요소. 실제로 움직이는 요소를 앞에) · needle(글로 가릴 때)
const CARD = '[role="dialog"][aria-labelledby] > .relative'
const DELETE_C1 = '[aria-label="\'클레임 처리 절차\' 대화 삭제"]'
const SCENES = {
  confirm: {
    url: '/',
    prep: async (page, m) => { if (m) await openDrawer(page) },
    open: (page) => page.locator(DELETE_C1).filter({ visible: true }).first().click({ force: true }),
    sels: [CARD],
  },
  menu: {
    url: '/',
    prep: async (page, m) => { if (m) await openDrawer(page) },
    open: (page) => page.locator('button[aria-expanded]').filter({ visible: true }).last().click(),
    sels: ['.bottom-full'],
  },
  drawer: {
    url: '/', mobileOnly: true,
    prep: async () => {},
    open: (page) => page.click('button[aria-label="대화 목록 열기"]'),
    sels: ['[role="dialog"][aria-label="대화 목록"]'],
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
    sels: ['[role="dialog"] img'],
  },
  drop: {
    url: '/',
    prep: async () => {},
    open: (page) => page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'a.png', { type: 'image/png' }))
      window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }))
    }),
    sels: ['.fixed.inset-0.z-40.backdrop-blur-sm'],
  },
  // 첫 목록 실패로 페이지 로드와 함께 뜨는 배너 - 정지 프레임만(성능은 아래 bannerAction 으로)
  banner: {
    url: '/admin/users', usersFail: true, freezeOnly: true,
    prep: async () => {},
    open: async (page) => { await page.reload() },
    sels: ['[role="alert"]'],
  },
  // 작업 실패(비밀번호 초기화 500)로 뜨는 배너
  bannerAction: {
    url: '/admin/users', resetFail: true,
    prep: async (page) => { await page.click('button[aria-label="김사원 비밀번호 초기화"]'); await page.waitForTimeout(300) },
    open: (page) => page.getByRole('button', { name: '초기화', exact: true }).click(),
    sels: ['[role="alert"]'],
  },
  // 발급 창 열기 - 확인 창의 「초기화」 → 응답 → 발급 창
  issueOpen: {
    url: '/admin/users',
    prep: async (page) => { await page.click('button[aria-label="김사원 비밀번호 초기화"]'); await page.waitForTimeout(300) },
    open: (page) => page.getByRole('button', { name: '초기화', exact: true }).click(),
    sels: [CARD], needle: '임시 비밀번호가 발급되었습니다',
  },
  // 복사 알림 - 발급 창은 prep 에서 열어 두고 「복사」를 잰다. 후에는 안쪽 span 이 움직이고, 전에는 p 의 글만 바뀐다
  copyNote: {
    url: '/admin/users',
    prep: async (page) => {
      await page.click('button[aria-label="김사원 비밀번호 초기화"]')
      await page.getByRole('button', { name: '초기화', exact: true }).click()
      await page.waitForSelector('text=임시 비밀번호가 발급되었습니다')
      await page.waitForTimeout(400)
    },
    open: (page) => page.getByRole('button', { name: '복사', exact: true }).click(),
    sels: ['[role="dialog"] [role="status"] > span', '[role="dialog"] [role="status"]'], needle: '복사',
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

// 실제로 움직이는 요소를 박스로 표시하고, 실효 opacity(조상까지 곱) · 계산된 scale · translate 를 읽는다
const inspect = (page, sels, needle) =>
  page.evaluate(([s, n]) => {
    const el = window.__find(s, n)
    if (!el) return null
    const r = el.getBoundingClientRect()
    let op = 1
    for (let e = el; e; e = e.parentElement) op *= Number(getComputedStyle(e).opacity)
    const cs = getComputedStyle(el)
    const d = document.createElement('div')
    d.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;border:3px solid #ff2d55;border-radius:6px;pointer-events:none;z-index:2147483647`
    document.body.appendChild(d)
    return { tag: el.tagName.toLowerCase(), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), effectiveOpacity: +op.toFixed(3), scale: cs.scale, translate: cs.translate }
  }, [sels, needle ?? null])

const anims = (page) => page.evaluate(() => document.getAnimations().map((a) => ({ name: a.animationName ?? '(transition)', duration: a.effect?.getComputedTiming().duration })))
const median = (xs) => { const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
const r2 = (x) => +x.toFixed(2)

const browser = await chromium.launch()
const out = { meta: { runs: RUNS, freezeMs: T, dist: DIST, command: `RUNS=${RUNS} FREEZE_MS=${T} node e732.mjs <dist> <out> <playwright package.json>` }, scenes: {}, checks: {} }
for (const [vpName, vp] of Object.entries(VPS)) {
  const mobile = vpName === 'mobile'
  for (const [name, sc] of Object.entries(process.env.CHECKS_ONLY ? {} : SCENES)) {
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
      await sc.open(page)
      await page.waitForFunction(([s, n]) => !!window.__find(s, n), [sc.sels, sc.needle ?? null], { timeout: 5000 })
      await page.waitForTimeout(150)
      r.animations = await anims(page)
      await page.evaluate((t) => document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming().duration > 50) { a.pause(); a.currentTime = t } }), T)
      r.frame = await inspect(page, sc.sels, sc.needle)
      await page.screenshot({ path: path.join(OUT, key + '.png') })
      await context.close()
    }

    // ② 성능
    if (!sc.freezeOnly && !process.env.CHECKS_ONLY) {
      const runs = []
      for (let i = 0; i < RUNS; i++) {
        const { context, page, cdp } = await newPage(browser, vp, mobile, sc)
        await page.goto('http://app.local' + sc.url)
        await page.waitForTimeout(1000)
        await sc.prep(page, mobile)
        await cdp.send('Performance.enable')
        const a = await metrics(cdp)
        const probe = page.evaluate(([s, n]) => window.__probe(s, n), [sc.sels, sc.needle ?? null])
        await sc.open(page)
        const p = await probe
        // 열기 기준 400ms 까지 기다린다
        await page.waitForFunction((t0) => performance.now() - t0 >= 400, p.t0)
        const b = await metrics(cdp)
        const lt = await page.evaluate((t0) => window.__lt.filter((e) => e.s >= t0), p.t0)
        runs.push({
          attachMs: p.attachMs, settledMs: p.settledMs,
          layouts: b.LayoutCount - a.LayoutCount, styleRecalcs: b.RecalcStyleCount - a.RecalcStyleCount,
          layoutMs: r2((b.LayoutDuration - a.LayoutDuration) * 1000), styleMs: r2((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000),
          scriptMs: r2((b.ScriptDuration - a.ScriptDuration) * 1000), taskMs: r2((b.TaskDuration - a.TaskDuration) * 1000),
          longTasks: lt.length, longTaskMaxMs: lt.length ? r2(Math.max(...lt.map((e) => e.d))) : 0,
        })
        await context.close()
      }
      const keys = Object.keys(runs[0])
      r.median = Object.fromEntries(keys.map((k) => [k, median(runs.map((x) => x[k]))]))
      r.max = Object.fromEntries(keys.map((k) => [k, Math.max(...runs.map((x) => x[k] ?? -1))]))
      r.runs = runs
    }
  }

  // ③ 조작 : 애니메이션 도중(등장 30ms) 누름 · Esc. CDP 왕복을 빼려고 페이지 안에서 등장 시점을 rAF 로 잡고 setTimeout 으로 30ms 를 기다린다.
  //    누름 : 그 순간 취소 버튼 가운데 좌표의 hit test(elementFromPoint)가 버튼을 가리키는지 + 그 요소 click. 애니메이션 currentTime 을 함께 남긴다
  {
    const { context, page } = await newPage(browser, vp, mobile)
    await page.goto('http://app.local/')
    await page.waitForTimeout(1200)
    if (mobile) await openDrawer(page)
    const pending = page.evaluate((card) => window.__atMs([card], 30, () => {
      const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent.trim() === '취소')
      const r = b.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const ok = !!hit && (hit === b || b.contains(hit))
      hit?.click()
      return { hitIsCancelButton: ok }
    }), CARD)
    await SCENES.confirm.open(page)
    const at = await pending
    await page.waitForTimeout(50)
    out.checks[`${vpName}-cancelDuringAnimation`] = { ...at, result: (await page.locator('[role="dialog"][aria-labelledby]').count()) === 0 ? 'closed' : 'still-open' }
    if (mobile) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      const pendingEsc = page.evaluate(() => window.__atMs(['[role="dialog"][aria-label="대화 목록"]'], 30, () => {
        const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.querySelector('[role="dialog"][aria-label="대화 목록"]')
        t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        return { keyTarget: t.tagName.toLowerCase() }
      }))
      await page.click('button[aria-label="대화 목록 열기"]')
      const atEsc = await pendingEsc
      await page.waitForTimeout(50)
      out.checks[`${vpName}-drawerEscDuringAnimation`] = { ...atEsc, result: (await page.locator('[role="dialog"][aria-label="대화 목록"]').count()) === 0 ? 'closed' : 'still-open' }
    }
    await context.close()
  }

  // ④ reduced-motion : 창이 실제로 열렸는지 + 카드의 계산된 애니메이션
  {
    const { context, page } = await newPage(browser, vp, mobile, { reduce: true })
    await page.goto('http://app.local/')
    await page.waitForTimeout(1200)
    if (mobile) await openDrawer(page)
    await SCENES.confirm.open(page)
    await page.waitForTimeout(20)
    out.checks[`${vpName}-reducedMotion`] = await page.evaluate((card) => {
      const d = document.querySelectorAll('[role="dialog"][aria-labelledby]')
      const c = document.querySelector(card)
      const cs = c && getComputedStyle(c)
      return { dialogs: d.length, cardAnimationName: cs?.animationName ?? null, cardAnimationDuration: cs?.animationDuration ?? null, running: document.getAnimations().filter((a) => a.playState === 'running').length }
    }, CARD)
    await context.close()
  }
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(out, null, 1))
console.log('done', OUT)
