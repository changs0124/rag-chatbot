"""#699 채점 : python -X utf8 g699.py before.jsonl after.jsonl"""
import json, re, sys, collections
sys.stdout.reconfigure(encoding="utf-8")
claims = json.load(open("claims.json", encoding="utf-8"))
sw = {c["svc"]: c["S/W 버전"] for c in claims}
must = set(json.load(open("must.json", encoding="utf-8")))
bat = {q["id"]: q.get("sources") or [] for q in json.load(open("qa-questions.json", encoding="utf-8"))["questions"]}
b1 = {j["id"]: j["expect"]["rows"] for j in json.load(open("b1.json", encoding="utf-8"))}
norm = lambda s: re.sub(r"\s+", "", s or "")


def kdate(a):
    a = re.sub(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", lambda m: f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}", a or "")
    return re.sub(r"(\d{4})[./](\d{1,2})[./](\d{1,2})", lambda m: f"{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}", a)


has = lambda a, v: norm(str(v)) in norm(kdate(a))


def grade(f):
    rs = [json.loads(l) for l in open(f, encoding="utf-8")]
    c = collections.Counter(); fails = []
    for r in rs:
        if "error" in r:
            c["error"] += 1; continue
        a = r["text"]
        if r["axis"] == "SW":
            # 소수부까지 그대로 - 「21.2」 뒤에 숫자가 붙어 다른 값이 되는 경우는 없다(값 목록 확인)
            ok = bool(re.search(re.escape(sw[r["id"]]) + r"(?!\d)", a))
            c["SW"] += 1; c["SW ok"] += ok
            if r["id"] in must: c["SW must"] += 1; c["SW must ok"] += ok
            if not ok: fails.append(("SW", r["id"][-3:], sw[r["id"]], re.findall(r"S/W[^,\n]{0,25}", a)[:1]))
        elif r["axis"] == "BAT":
            exp = bat[r["id"]]; cs = set(r["cites"])
            ok = all(e in cs for e in exp) if exp else not cs
            c["BAT"] += 1; c["BAT ok"] += ok
            if exp and not cs: c["BAT 근거 문항 인용 0"] += 1
            if not ok: fails.append(("BAT", r["id"], exp, sorted(cs)))
        elif r["axis"] == "B1":
            miss = [f"{x['svc'][-3:]}.{k}" for x in b1[r["id"]] for k in ("sn", "입고일자") if not has(a, x[k])]
            c["B1"] += 1; c["B1 ok"] += not miss
            if miss: fails.append(("B1", r["id"][:20], miss))
        u = r.get("usage") or {}
        c["in_tok"] += u.get("input_tokens", 0)
    return c, fails


for f in sys.argv[1:]:
    c, fails = grade(f)
    print(f"== {f} : SW {c['SW ok']}/{c['SW']} (QA 세 건 {c['SW must ok']}/{c['SW must']}) · BAT {c['BAT ok']}/{c['BAT']} (근거 문항 인용 0 : {c['BAT 근거 문항 인용 0']}) · B1 {c['B1 ok']}/{c['B1']} · error {c['error']} · 입력 {c['in_tok']:,} 토큰 ≈ ${c['in_tok'] * 1.84 / 1e6:.2f}")
    for x in fails:
        print("   ", x)
