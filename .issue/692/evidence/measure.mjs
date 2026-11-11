// 측정 : node measure.mjs <base url> <label> <out dir> <runs>
// 390×844 모바일 · CPU 4배 감속 · 스트림 1000 delta 동안 입력 10자 → Long Task · 스크립트 시간 · 입력 지연 · 최종 본문 길이
import { chromium } from 'playwright'
import fs from 'node:fs'
const [base, label, out, runs = '3'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const token = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
const browser = await chromium.launch()
const res = []
for (let r = 0; r < +runs; r++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await ctx.addInitScript((t) => {
    localStorage.setItem('rag_chatbot_token', t)
    window.__p = { long: [], ev: [] }
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__p.long.push(e.duration) }).observe({ type: 'longtask', buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__p.ev.push(e.duration) }).observe({ type: 'event', durationThreshold: 16, buffered: true })
  }, token)
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await page.goto(base + '/', { waitUntil: 'networkidle' })
  const box = page.getByPlaceholder('메시지를 입력하세요')
  await box.fill('AL.2144 점검 순서')
  await cdp.send('Performance.enable')
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  await page.evaluate(() => { window.__p.long = []; window.__p.ev = [] })
  const t0 = Date.now()
  await page.getByLabel('보내기').click()
  await page.getByLabel('중단').waitFor({ state: 'visible', timeout: 15000 })
  await page.waitForTimeout(1500)
  await box.click()
  await box.pressSequentially('다음질문준비중입니다', { delay: 120 })
  await page.getByLabel('중단').waitFor({ state: 'detached', timeout: 180000 })
  const total = Date.now() - t0
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  const p = await page.evaluate(() => window.__p)
  const len = await page.locator('.flex.justify-start').last().innerText().then((t) => t.length)
  res.push({ run: r + 1, totalMs: total, script: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(2), task: +(m1.TaskDuration - m0.TaskDuration).toFixed(2), layout: m1.LayoutCount - m0.LayoutCount, longN: p.long.length, longSum: Math.round(p.long.reduce((a, b) => a + b, 0)), longMax: Math.round(Math.max(0, ...p.long)), inputMax: Math.round(Math.max(0, ...p.ev)), textLen: len })
  if (r === 0) {
    await page.getByLabel('보내기').waitFor().catch(() => {})
    await page.screenshot({ path: `${out}/${label}-answer.png` })
  }
  await ctx.close()
  console.log(JSON.stringify(res.at(-1)))
}
await browser.close()
const med = (k) => { const v = res.map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] }
const summary = Object.fromEntries(Object.keys(res[0]).filter((k) => k !== 'run').map((k) => [k, med(k)]))
fs.writeFileSync(`${out}/${label}.json`, JSON.stringify({ runs: res, median: summary }, null, 1))
console.log('median', JSON.stringify(summary))
