"""#653 두 건 비교 채점. 사용 : python gcmp.py <q-cmp.json> <out.json>…"""
import json, re, sys
sys.stdout.reconfigure(encoding="utf-8")
q = {x["id"]: x for x in json.load(open(sys.argv[1], encoding="utf-8"))}
norm = lambda s: re.sub(r"\s+", "", s or "")
def kd(a):
    a = re.sub(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", lambda m: f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}", a)
    return re.sub(r"(\d{4})[./](\d{1,2})[./](\d{1,2})", lambda m: f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}", a)
has = lambda a, v: norm(v) in norm(kd(a))
for f in sys.argv[2:]:
    rs = json.load(open(f, encoding="utf-8")); ok = dm = other = fab = 0; bad = []
    for r in rs:
        e = q[r["id"]]["expect"]; a = r["answer"]
        miss = [f"{s}.{k}" for s in "xy" for k in ("sn", "입고일자", "final") if not has(a, e[s][k])]
        ok += not miss; dm += any("입고" in m for m in miss); other += any("입고" not in m for m in miss)
        ds = set(re.findall(r"20\d\d-\d\d-\d\d", kd(a))) - {e["x"]["입고일자"], e["y"]["입고일자"]}
        fab += bool(ds)
        if miss or ds: bad.append((r["id"], miss, sorted(ds)))
    print(f"{f} : 전부 맞음 {ok}/{len(rs)} · 입고일자 누락 {dm} · 그 밖 누락 {other} · 기대 밖 날짜 {fab}")
    for b in bad: print("   ", b)
