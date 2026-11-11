// 사용 : node measure.mjs <base> <label> <runs> — 목록 요청 시작 − me 응답 끝, 첫 대화 항목 표시 시각(내비게이션 기준 ms)
import { chromium } from 'playwright'
import fs from 'node:fs'
const [base, label, runs = '5'] = process.argv.slice(2)
const token = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
const br = await chromium.launch()
const res = []
for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
  for (let r = 0; r < +runs; r++) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile })
    await ctx.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), token)
    const page = await ctx.newPage()
    await page.goto(base + '/', { waitUntil: 'networkidle' })
    if (mobile) await page.getByRole('button', { name: /메뉴|대화 목록|사이드바/ }).filter({ visible: true }).first().click().catch(() => {})
    await page.getByText('AL.2144 점검 순서 1').filter({ visible: true }).first().waitFor({ timeout: 10000 })
    const t = await page.evaluate(() => {
      const e = performance.getEntriesByType('resource')
      const me = e.find((x) => x.name.endsWith('/api/auth/me')), list = e.find((x) => x.name.endsWith('/api/conversations'))
      return { meStart: Math.round(me.startTime), meEnd: Math.round(me.responseEnd), listStart: Math.round(list.startTime), listEnd: Math.round(list.responseEnd) }
    })
    res.push({ w, run: r + 1, ...t, listAfterMe: t.listStart - t.meEnd, listReady: t.listEnd })
    if (r === 0) await page.screenshot({ path: `out/${label}-${w}.png` })
    await ctx.close()
  }
}
await br.close()
const med = (w, k) => { const v = res.filter((x) => x.w === w).map((x) => x[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)] }
const summary = Object.fromEntries([1440, 390].map((w) => [w, Object.fromEntries(['meStart', 'meEnd', 'listStart', 'listEnd', 'listAfterMe', 'listReady'].map((k) => [k, med(w, k)]))]))
fs.writeFileSync(`out/${label}.json`, JSON.stringify({ runs: res, median: summary }, null, 1))
console.log(label, JSON.stringify(summary))
