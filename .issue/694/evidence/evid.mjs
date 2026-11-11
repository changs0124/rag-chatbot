import { chromium } from 'playwright'
import fs from 'node:fs'
const B = JSON.parse(fs.readFileSync('out/before.json', 'utf8')).median, A = JSON.parse(fs.readFileSync('out/after.json', 'utf8')).median
const rows = [['me 요청 시작', 'meStart'], ['me 응답 끝', 'meEnd'], ['목록 요청 시작', 'listStart'], ['목록 도착(사이드바 표시 가능)', 'listEnd']]
const page = (side) => `<!doctype html><meta charset=utf-8><style>body{font:15px Pretendard,system-ui,sans-serif;margin:24px;background:#fff;color:#111}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px 12px;text-align:right}td:first-child,th:first-child{text-align:left}.hl{outline:3px solid #ff2d55;outline-offset:-2px}</style>
<h2>#694 ${side} — 새로고침 요청 타이밍(ms, 내비게이션 기준 · 5회 중앙값)</h2><p>목업 : me · 대화 목록 각 300ms 지연</p>
<table><tr><th>지점</th><th>1440 before</th><th>1440 after</th><th>390 before</th><th>390 after</th></tr>
${rows.map(([n, k]) => { const hl = side === 'after' && (k === 'listStart' || k === 'listEnd') ? 'hl' : ''; return `<tr><td>${n}</td><td>${B[1440][k]}</td><td class="${hl}">${side === 'after' ? A[1440][k] : '—'}</td><td>${B[390][k]}</td><td class="${hl}">${side === 'after' ? A[390][k] : '—'}</td></tr>` }).join('')}</table>
<p>${side === 'before' ? '목록 요청이 me 응답이 끝난 뒤에야 시작 — 왕복 둘이 직렬' : '목록 요청이 me 와 함께 시작 — 왕복이 겹쳐 목록 도착이 약 330ms 당겨짐'}</p>`
const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 820, height: 330 } })
for (const s of ['before', 'after']) { await pg.setContent(page(s)); await pg.screenshot({ path: `out/t-${s}.png`, fullPage: true }) }
await br.close()
