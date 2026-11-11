// #701 재현 목업 : 첫 /api/auth/me · 첫 /api/conversations 는 503(배포 재시작 순간), 그 뒤는 정상. 사용 : node server.mjs <dist> <port>
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'
const [dist, port] = process.argv.slice(2)
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }
let n = { me: 0, list: 0 }
const convs = [1, 2, 3].map((i) => ({ id: `c${i}`, title: `AL.2144 점검 순서 ${i}`, updatedAt: new Date().toISOString() }))
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/__reset') { n = { me: 0, list: 0 }; return send(res, 200, {}) }
  if (u.pathname === '/__count') return send(res, 200, n)
  if (u.pathname === '/api/auth/me') return ++n.me === 1 ? send(res, 503, { message: 'restarting' }) : send(res, 200, { id: 'u1', email: 'qa@local.test', name: 'QA', role: 'user' })
  if (u.pathname === '/api/conversations' && req.method === 'GET') return ++n.list === 1 ? send(res, 503, { message: 'restarting' }) : send(res, 200, convs)
  if (u.pathname.startsWith('/api/')) return send(res, 404, {})
  let f = path.join(dist, decodeURIComponent(u.pathname))
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html')
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res)
}).listen(+port, () => console.log('ready', port))
