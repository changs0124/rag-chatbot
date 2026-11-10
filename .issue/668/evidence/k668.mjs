// #668 키보드 열고 닫힘 흉내 측정. 사용 : node k668.mjs <dist 폴더> <출력 폴더(json · png)>
// 가상 키보드는 헤드리스로 못 띄우므로 visualViewport 를 가짜(EventTarget)로 바꿔 끼우고, height 를 844 → 500 → 844 로
// 바꾸며 resize · scroll 이벤트를 프레임마다 보낸다(iOS 키보드 애니메이션이 내는 모양). 운영 코드는 건드리지 않는다 :
// React 커밋 수는 DevTools 전역 훅(__REACT_DEVTOOLS_GLOBAL_HOOK__)을 미리 심어 세고, 작업 시간은 longtask · 이벤트 처리 시간으로 잰다
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
const { chromium } = createRequire('C:/Users/User/AppData/Local/Temp/claude/cc19ec6eeab1f0fc/4a16aa4c-6f47-4da6-997b-0871147ba147/scratchpad/design/package.json')('playwright')

const [DIST, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT, { recursive: true })
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
const json = (route, body, status = 200) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
const iso = (ms) => new Date(ms).toISOString()
const now = Date.now()
const admin = { id: 'u1', email: 'admin@local.test', name: '관리자홍길동', role: 'admin' }
const conversations = [{ id: 'c1', title: '긴 대화', updatedAt: iso(now) }]
// 20턴 · 답마다 마크다운 표 · 목록 · 코드 — 다시 그리는 비용이 드러나게
const answer = (i) => `## 항목 ${i}\n\n**요약** : 클레임 ${i}의 처리 경과입니다 [1].\n\n| 구분 | 내용 | 담당 | 기한 |\n|---|---|---|---|\n| 접수 | 서비스번호 4038${String(i).padStart(5, '0')} 접수 | 품질보증팀 | 2일 |\n| 분석 | R64 저항 소손 확인 | 설계팀 | 7일 |\n| 대책 | 부품 사양 변경 | 구매팀 | 14일 |\n\n1. 첫째\n2. 둘째\n3. 셋째\n\n\`\`\`\nAL.2144 Servo Drive Under Voltage\n\`\`\`\n`
const messages = Array.from({ length: 20 }, (_, i) => [
  { id: `q${i}`, role: 'user', content: `${i}번째 질문입니다. 처리 경과를 표로 알려 주세요.`, status: 'complete', citations: [] },
  { id: `a${i}`, role: 'assistant', content: answer(i), status: 'complete', citations: [{ seq: 1, sourceName: '필드클레임현황.md', snippet: '요약' }] },
]).flat()
const TOKEN = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'

async function setup(context) {
  await context.route('http://app.local/**', (route) => {
    const u = new URL(route.request().url())
    let p = path.join(DIST, decodeURIComponent(u.pathname))
    if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, 'index.html')
    const ct = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[path.extname(p)] ?? 'application/octet-stream'
    route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(p) })
  })
  await context.route('http://mock.local/**', (route) => {
    const r = route.request(); const p = new URL(r.url()).pathname
    if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (p === '/api/auth/me') return json(route, admin)
    if (p === '/api/conversations') return json(route, conversations)
    if (p === '/api/conversations/c1/messages') return json(route, messages)
    return json(route, {})
  })
  await context.addInitScript((t) => {
    localStorage.setItem('rag_chatbot_token', t)
    // React 는 시작할 때 이 훅이 있으면 커밋마다 onCommitFiberRoot 를 부른다(운영 빌드 포함)
    window.__commits = 0
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), inject() { return 1 }, checkDCE() {},
      onCommitFiberRoot() { window.__commits++ }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {},
    }
    // 가짜 visualViewport — 페이지가 읽는 height · scale 과 resize · scroll 이벤트만 흉내 낸다
    const vv = new EventTarget()
    Object.assign(vv, { height: innerHeight, width: innerWidth, scale: 1, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0 })
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
    window.__lt = 0
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt += e.duration }).observe({ type: 'longtask', buffered: true }) } catch { /* 없음 */ }
  }, TOKEN)
}

const browser = await chromium.launch()
const out = {}
for (const [vp, viewport] of Object.entries({ mobile: { width: 390, height: 844 }, desktop: { width: 1440, height: 900 } })) {
  const isMobile = vp === 'mobile'
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile, hasTouch: isMobile, locale: 'ko-KR' })
  await setup(ctx)
  const page = await ctx.newPage()
  await page.goto('http://app.local/')
  await page.waitForTimeout(800)
  if (isMobile) { await page.click('button[aria-label="대화 목록 열기"]'); await page.waitForTimeout(300) }
  await page.getByText('긴 대화').filter({ visible: true }).first().click()
  await page.waitForTimeout(1500)
  // 휴대폰 성능 흉내 : CPU 6배 느리게(Chrome DevTools 「저사양 모바일」과 같은 배율)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  // 키보드가 열렸다 닫히는 애니메이션 흉내 : 15프레임 줄고 15프레임 늘어남, 프레임마다 resize + scroll
  const H = viewport.height
  const res = await page.evaluate(async (H) => {
    const vv = window.visualViewport
    const steps = [...Array.from({ length: 15 }, (_, i) => Math.round(H - ((H - 500) * (i + 1)) / 15)), ...Array.from({ length: 15 }, (_, i) => Math.round(500 + ((H - 500) * (i + 1)) / 15))]
    const root = document.getElementById('root').firstElementChild
    const c0 = window.__commits, lt0 = window.__lt
    let handler = 0
    const heights = []
    const frameMs = []
    for (const h of steps) {
      vv.height = h
      const t = performance.now()
      vv.dispatchEvent(new Event('resize'))
      vv.dispatchEvent(new Event('scroll'))
      handler += performance.now() - t
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      // 이벤트를 보낸 뒤 두 프레임이 그려질 때까지 걸린 시간 - 다시 그리기가 무거우면 길어진다(60Hz 두 프레임 ≈ 33ms)
      frameMs.push(performance.now() - t)
      heights.push([h, Math.round(root.getBoundingClientRect().height)])
    }
    await new Promise((r) => setTimeout(r, 300))
    const t1 = performance.now()
    return {
      events: steps.length * 2, frames: steps.length,
      reactCommits: window.__commits - c0,
      handlerMsSync: Math.round(handler * 10) / 10,
      totalMs: Math.round(frameMs.reduce((a, b) => a + b, 0)),
      maxFrameMs: Math.round(Math.max(...frameMs)),
      medianFrameMs: Math.round([...frameMs].sort((a, b) => a - b)[Math.floor(frameMs.length / 2)]),
      longTaskMs: Math.round((window.__lt - lt0) * 10) / 10,
      rootFollows: heights.every(([h, rh]) => Math.abs(h - rh) <= 1),
      rootAtMin: heights[14], rootAtEnd: heights[heights.length - 1],
      docScrollTop: document.scrollingElement.scrollTop,
      _t: Math.round(t1),
    }
  }, H)
  delete res._t
  out[vp] = res
  await page.screenshot({ path: path.join(OUT, `${vp}-thread.png`) })
  await ctx.close()
}
await browser.close()
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
