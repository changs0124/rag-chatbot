"""#699 전후 측정 : 같은 Responses 본문(배포 지시문 + 날짜 줄 · file_search · include results)으로 스토어만 바꿔 잰다.
축 : SW(소수부 있는 클레임 20 × 3, #695 탐침) · BAT(배터리 31 × 2 — 기대 출처 인용 · 근거 문항 인용 0) · B1(세 건 비교 20 — S/N · 입고일자, #653 회귀)
사용 : python -X utf8 m699.py <key파일> <model> <vector_store_id> <label> <out.jsonl>"""
import json, sys, time, random, datetime, re, concurrent.futures as cf, requests
sys.stdout.reconfigure(encoding="utf-8")
key_f, model, vs, label, out_f = sys.argv[1:]
key = open(key_f).read().strip()
instr = json.load(open("instr.json", encoding="utf-8"))
today = datetime.date.today()
instr += "- 오늘은 %s(%s, 한국 시간)이다. 「이번 달 · 지난달 · 최근 N개월 · 올해」 같은 상대 시점은 이 날짜를 기준으로 풀고, 어느 기간으로 풀었는지 답에 밝힌다.\n" % (today.isoformat(), "월화수목금토일"[today.weekday()])
claims = json.load(open("claims.json", encoding="utf-8"))
sw = {c["svc"]: c["S/W 버전"] for c in claims}
must = json.load(open("must.json", encoding="utf-8"))
rest = [c["svc"] for c in claims if "." in c["S/W 버전"] and c["svc"] not in must]
random.Random(695).shuffle(rest)  # #695 와 같은 20건
svcs = must + rest[:17]
bat = json.load(open("qa-questions.json", encoding="utf-8"))["questions"]
b1 = json.load(open("b1.json", encoding="utf-8"))
jobs = [("SW", s, r, f"서비스번호 {s} 클레임의 사용일, S/W 버전, 품번 알려줘") for r in range(3) for s in svcs]
jobs += [("BAT", q["id"], r, q["question"]) for r in range(2) for q in bat]
jobs += [("B1", j["id"], 0, j["turns"][0]) for j in b1]
H = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}
FILECITE = re.compile("filecite(.*?)")
REF = re.compile(r"turn(\d+)file(\d+)")


def run(job):
    axis, jid, rep, q = job
    body = {"model": model, "input": q, "stream": True, "tools": [{"type": "file_search", "vector_store_ids": [vs]}],
            "include": ["file_search_call.results"], "instructions": instr}
    err = None
    for _ in range(3):
        try:
            resp = requests.post("https://api.openai.com/v1/responses", headers=H, json=body, stream=True, timeout=240)
            if resp.status_code >= 500:
                time.sleep(3); continue
            deltas, searches, ann, usage = [], [], set(), None
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                ev = json.loads(line[5:]); t = ev.get("type")
                if t == "response.output_text.delta":
                    deltas.append(ev["delta"])
                elif t == "response.output_item.done" and ev.get("item", {}).get("type") == "file_search_call":
                    searches.append([(x.get("filename"), x.get("text", "")) for x in ev["item"].get("results") or []])
                elif t == "response.output_text.annotation.added":
                    a = ev.get("annotation") or {}
                    if a.get("filename"): ann.add(a["filename"])
                elif t == "response.completed":
                    usage = ev["response"].get("usage")
            raw = "".join(deltas)
            cites = set(ann)
            for m in FILECITE.finditer(raw):
                for tn, fn in REF.findall(m.group(1)):
                    tn, fn = int(tn), int(fn)
                    if tn < len(searches) and fn < len(searches[tn]): cites.add(searches[tn][fn][0])
            text = FILECITE.sub("", raw)
            return {"axis": axis, "id": jid, "rep": rep, "text": text, "cites": sorted(c for c in cites if c), "usage": usage, "http": resp.status_code}
        except requests.RequestException as e:
            err = repr(e); time.sleep(3)
    return {"axis": axis, "id": jid, "rep": rep, "error": err}


with open(out_f, "w", encoding="utf-8") as f, cf.ThreadPoolExecutor(6) as ex:
    for res in ex.map(run, jobs):
        f.write(json.dumps(res, ensure_ascii=False) + "\n"); f.flush()
print(label, "done", len(jobs))
