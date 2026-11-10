// #682 iOS 키보드 열림 · 닫힘 흉내 측정. 사용 : node m682.mjs <dist 폴더> <출력 폴더(json · png)>
// 가상 키보드는 헤드리스로 못 띄우므로 visualViewport 를 가짜로 끼우고(k668 와 같은 방식), 입력칸 포커스 · 포커스 잃기 순간의
// 루트 높이를 잰다 — 닫힐 때 resize 를 기다리지 않고 바로 늘어나는지, 두 번째 열림에서 포커스 순간 미리 줄어드는지.
// React 커밋 수는 DevTools 전역 훅으로 센다. Safari 의 화면 밀기(pan)는 재현되지 않는다(실기기 확인 필요)
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
const rootH = (page) => page.evaluate(() => document.querySelector('header')?.closest('div.flex-col')?.parentElement?.style.height || '(비어 있음)')
for (const [name, w, h] of [['mobile', 390, 844], ['desktop', 1440, 900]]) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: name === 'mobile' })
  await setup(context)
  const page = await context.newPage()
  await page.goto('http://app.local/')
  await page.getByRole('textbox', { name: '메시지 입력' }).waitFor()
  await page.waitForTimeout(800)
  const r = {}
  const input = page.getByRole('textbox', { name: '메시지 입력' })
  const kb = (vh) => page.evaluate((v) => { visualViewport.height = v; visualViewport.dispatchEvent(new Event('resize')) }, vh)
  const blur = () => page.evaluate(() => document.activeElement?.blur())
  await page.evaluate(() => { window.__commits = 0 })
  await input.focus(); r.firstFocus = await rootH(page)
  if (name === 'mobile') { await kb(h - 300); r.keyboardOpen = await rootH(page) }
  await blur(); r.rightAfterBlur = await rootH(page)
  if (name === 'mobile') { await kb(h); r.afterKeyboardGone = await rootH(page) }
  await input.focus(); r.secondFocus = await rootH(page)
  if (name === 'mobile') { await kb(h - 300); r.secondOpen = await rootH(page) }
  r.reactCommits = await page.evaluate(() => window.__commits)
  r.docScrollTop = await page.evaluate(() => document.scrollingElement.scrollTop)
  await page.screenshot({ path: path.join(OUT, `${name}-keyboard.png`) })
  out[name] = r
  await context.close()
}
fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(out, null, 1))
console.log(JSON.stringify(out))
await browser.close()
