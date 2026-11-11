// 사용 : node cap.mjs <base> <label> — 503 한 번 뒤 화면 : 목록 · 오류 배너 · 요청 횟수
import { chromium } from 'playwright'
import fs from 'node:fs'
const [base, label] = process.argv.slice(2)
const token = 'h.' + Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url') + '.s'
const br = await chromium.launch(); const out = {}
for (const [w, h] of [[1440, 900], [390, 844]]) {
  await fetch(base + '/__reset')
  const ctx = await br.newContext({ viewport: { width: w, height: h }, isMobile: w < 768, hasTouch: w < 768 })
  await ctx.addInitScript((t) => localStorage.setItem('rag_chatbot_token', t), token)
  const pg = await ctx.newPage(); await pg.goto(base + '/'); await pg.waitForTimeout(5500)
  if (w < 768) await pg.getByRole('button', { name: /메뉴|대화 목록|사이드바/ }).filter({ visible: true }).first().click().catch(() => {})
  await pg.waitForTimeout(500)
  const body = await pg.locator('body').innerText()
  out[w] = { listShown: body.includes('AL.2144 점검 순서 1'), errorShown: body.includes('불러오지 못했습니다'), counts: await (await fetch(base + '/__count')).json() }
  await pg.screenshot({ path: `${label}-${w}.png` }); await ctx.close()
}
await br.close(); fs.writeFileSync(`${label}.json`, JSON.stringify(out, null, 1)); console.log(label, JSON.stringify(out))
