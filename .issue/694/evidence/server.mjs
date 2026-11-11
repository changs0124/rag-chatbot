// 목업 서버 : dist + /api(me · conversations 각 300ms 지연). 사용 : node server.mjs <dist> <port>
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
const [dist, port] = process.argv.slice(2)
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' }
const DELAY = 300
const convs = [1, 2, 3].map((i) => ({ id: `c${i}`, title: `AL.2144 점검 순서 ${i}`, updatedAt: new Date().toISOString() }))
const json = (res, body) => setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }, DELAY)
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/api/auth/me') return json(res, { id: 'u1', email: 'qa@local.test', name: 'QA', role: 'user' })
  if (u.pathname === '/api/conversations' && req.method === 'GET') return json(res, convs)
  if (u.pathname.startsWith('/api/')) { res.writeHead(404); return res.end('{}') }
  let f = path.join(dist, decodeURIComponent(u.pathname))
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' })
  fs.createReadStream(f).pipe(res)
}).listen(+port, () => console.log('ready', port))
