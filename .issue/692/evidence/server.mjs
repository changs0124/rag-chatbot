// 목업 서버 : dist + /api. 사용 : node server.mjs <dist> <port>
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const [dist, port] = process.argv.slice(2)
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
const row = (i) => `| ${i} | 서비스번호 4038${String(70000 + i)} | DA22F0${String(300 + i)} | 설계불량(부품선정오류) |`
let answer = '## 점검 순서\n\n'
for (let i = 1; i <= 12; i++) answer += `${i}. **${i}단계 확인 항목입니다.** 드라이브 입력 전원과 모터 파워 케이블의 단선 여부를 확인하고, 알람 이력과 함께 기록을 남깁니다. 반복 발생 시 담당자에게 점검을 요청하세요.\n`
answer += '\n| 번호 | 서비스번호 | S/N | 최종원인 |\n|---|---|---|---|\n'
for (let i = 1; i <= 30; i++) answer += row(i) + '\n'
while (answer.length < 4000) answer += '\n매뉴얼은 원인 해결 후 서보 드라이브 전원을 OFF 했다가 ON 하면 재운전할 수 있다고 안내합니다. **상세 조치는 유지 보수 설명서를 참조**하세요.'
answer = answer.slice(0, 4000)
// 운영 실측(11-11, 1,248 이벤트 · 2,196자 · 간격 중앙 5.75ms · 58% 가 8ms 미만)을 따라 2자 delta · 간격 순환
const deltas = Array.from(answer.matchAll(/[\s\S]{1,2}/g), (m) => m[0])
const GAPS = [0, 3, 5, 6, 6, 8, 12, 22]
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/api/auth/me') return json(res, 200, { id: 'u1', email: 'qa@local.test', name: 'QA', role: 'user' })
  if (u.pathname === '/api/conversations' && req.method === 'GET') return json(res, 200, [])
  if (u.pathname === '/api/conversations' && req.method === 'POST') return json(res, 200, { id: 'c1', title: '측정', updatedAt: new Date().toISOString() })
  if (u.pathname.startsWith('/api/conversations/')) return json(res, 200, [])
  if (u.pathname === '/api/chat') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    res.write('event:meta\ndata:{"messageId":"m1","conversationId":"c1"}\n\n')
    let i = 0
    const tick = () => {
      if (i >= deltas.length) {
        res.write('event:done\ndata:{"finishReason":"stop","noSource":false}\n\n')
        return res.end()
      }
      res.write(`event:token\ndata:${JSON.stringify({ delta: deltas[i] })}\n\n`)
      const until = performance.now() + GAPS[i++ % GAPS.length]
      // Windows setTimeout 해상도(≈15.6ms)를 피해 setImmediate 로 기다림 - 이벤트마다 따로 도착하게
      const wait = () => (performance.now() >= until ? tick() : setImmediate(wait))
      wait()
    }
    return tick()
  }
  if (u.pathname.startsWith('/api/')) return json(res, 404, {})
  let f = path.join(dist, decodeURIComponent(u.pathname))
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  fs.createReadStream(f).pipe(res)
}).listen(+port, () => console.log('ready', port, 'deltas', deltas.length))
