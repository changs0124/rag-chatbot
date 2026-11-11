import { chromium } from 'playwright'
import fs from 'node:fs'
const J = (l) => JSON.parse(fs.readFileSync(`out/${l}.json`, 'utf8'))
const B = J('before-real'), A = J('after-real'), B0 = J('before'), A0 = J('after')
const rows = [['스크립트 시간(초)', 'script'], ['메인 스레드 작업(초)', 'task'], ['Long Task 수', 'longN'], ['Long Task 합(ms)', 'longSum'], ['입력 지연 최대(ms)', 'inputMax'], ['레이아웃 횟수', 'layout'], ['최종 본문 길이(자)', 'textLen']]
const page = (side) => `<!doctype html><meta charset=utf-8><style>body{font:15px Pretendard,system-ui,sans-serif;margin:24px;color:#111;background:#fff}h1{font-size:18px}table{border-collapse:collapse;margin:8px 0 20px}td,th{border:1px solid #ccc;padding:6px 12px;text-align:right}th:first-child,td:first-child{text-align:left}.hl{outline:3px solid #ff2d55;outline-offset:-2px}.runs{color:#666;font-size:12px}</style>
<h1>#692 ${side} — 스트리밍 1회 측정(390×844 모바일 · CPU 4배 감속 · 중앙값)</h1>
<p>운영 실측 간격(2자 delta 2,000개 · 간격 0~22ms 순환, 5회)</p>
<table><tr><th>지표</th><th class="${side === 'before' ? 'hl' : ''}">before</th><th class="${side === 'after' ? 'hl' : ''}">after</th></tr>
${rows.map(([n, k]) => `<tr><td>${n}</td><td class="${side === 'before' ? 'hl' : ''}">${B.median[k]}</td><td class="${side === 'after' ? 'hl' : ''}">${side === 'after' ? A.median[k] : '—'}</td></tr>`).join('')}</table>
<p class=runs>스크립트 시간 회차별 : before ${B.runs.map((r) => r.script).join(' · ')}${side === 'after' ? ' / after ' + A.runs.map((r) => r.script).join(' · ') : ''}</p>
<p>참고 : 프레임 간격(≈16ms)으로 1개씩 오는 목업(4자 delta 1,000개, 3회)에서는 묶을 delta 가 없어 차이 없음 — before ${B0.median.script}초${side === 'after' ? ' / after ' + A0.median.script + '초' : ''}</p>`
const br = await chromium.launch()
const p = await br.newPage({ viewport: { width: 760, height: 520 } })
for (const s of ['before', 'after']) { await p.setContent(page(s)); await p.screenshot({ path: `out/metrics-${s}.png`, fullPage: true }) }
await br.close()
