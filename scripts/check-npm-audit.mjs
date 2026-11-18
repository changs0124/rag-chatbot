#!/usr/bin/env node
// 프론트 의존성 취약점 게이트(#716) - `npm audit --audit-level=high` 에 기한 있는 예외를 더한 것.
//
// 고친 판이 아직 없는 경보는 lock 을 갱신해도 풀리지 않아, 그대로 두면 모든 PR 의 필수 체크가 빨갛다.
// 그런 경보만 `frontend/audit-allowlist.json` 에 **경보 id 하나 · 만료일 · 사유**로 적어 넘긴다.
// - high 이상 경보가 목록에 없거나, 목록의 만료일(until, 그날까지 유효)이 지났으면 실패
// - 목록에 있는데 더는 안 잡히는 항목은 알려 준다(지울 때가 됨) - 실패는 아니다
// 사용 : node scripts/check-npm-audit.mjs   (어디서 불러도 frontend 기준)
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const SEVERE = new Set(['high', 'critical']);

let raw;
try {
  raw = execSync('npm audit --json', { cwd: frontend, encoding: 'utf8' }); // 고정 문자열 - Windows 의 npm.cmd 도 셸이 찾는다
} catch (e) {
  raw = e.stdout; // 경보가 있으면 npm audit 는 0 이 아닌 코드로 끝난다 - 본문은 stdout 에 있다
}
const report = JSON.parse(raw);
if (!report.vulnerabilities) {
  console.error('npm audit 결과를 읽지 못했다:', raw.slice(0, 500));
  process.exit(2);
}

// 경보 원본(via 의 객체 항목)만 모은다 - 문자열 via 는 그 경보를 물려받은 상위 패키지라 원본 하나로 묶인다
const advisories = new Map();
for (const v of Object.values(report.vulnerabilities)) {
  for (const via of v.via) {
    if (typeof via === 'object' && SEVERE.has(via.severity)) {
      const id = via.url.split('/').pop();
      advisories.set(id, { id, pkg: via.name, severity: via.severity, title: via.title });
    }
  }
}

const allow = JSON.parse(readFileSync(join(frontend, 'audit-allowlist.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const byId = new Map(allow.map((a) => [a.id, a]));
let failed = false;

for (const a of advisories.values()) {
  const entry = byId.get(a.id);
  if (!entry) {
    console.error(`✗ ${a.severity} ${a.id} (${a.pkg}) ${a.title} - 허용 목록에 없음`);
    failed = true;
  } else if (entry.until < today) {
    console.error(`✗ ${a.severity} ${a.id} (${a.pkg}) - 예외 만료(${entry.until}). 고친 판을 확인하고 lock 을 갱신하거나 다시 판단해 기한을 바꾼다`);
    failed = true;
  } else {
    console.log(`· ${a.severity} ${a.id} (${a.pkg}) - 예외(~${entry.until}) : ${entry.reason}`);
  }
}
for (const entry of allow) {
  if (!advisories.has(entry.id)) {
    console.log(`! ${entry.id} 는 더는 잡히지 않는다 - audit-allowlist.json 에서 지운다`);
  }
}
if (failed) {
  process.exit(1);
}
console.log(`OK - high 이상 ${advisories.size}건, 모두 기한 안의 예외`);
