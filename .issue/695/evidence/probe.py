"""#695 탐침 : 운영과 같은 Responses 요청(모델 · 지시문 + 날짜 줄 · file_search · include)을 직접 보내 모델 원문 delta 를 저장.
사용 : python -X utf8 probe.py <instr.json> <key파일> <model> <vector_store_id> <claims.json> <out.jsonl> <reps>"""
import json, sys, time, random, datetime, concurrent.futures as cf, requests
sys.stdout.reconfigure(encoding="utf-8")
instr_f, key_f, model, vs, claims_f, out_f, reps = sys.argv[1:]
instr = json.load(open(instr_f, encoding="utf-8"))
key = open(key_f).read().strip()
today = datetime.date.today()
instr += "- 오늘은 %s(%s, 한국 시간)이다. 「이번 달 · 지난달 · 최근 N개월 · 올해」 같은 상대 시점은 이 날짜를 기준으로 풀고, 어느 기간으로 풀었는지 답에 밝힌다.\n" % (today.isoformat(), "월화수목금토일"[today.weekday()])
claims = json.load(open(claims_f, encoding="utf-8"))
must = json.load(open("must.json", encoding="utf-8"))  # 11-11 QA 누락 세 건 - 식별값은 저장소 밖(QA 폴더)에 둔다
rest = [c["svc"] for c in claims if "." in c["S/W 버전"] and c["svc"] not in must]
random.Random(695).shuffle(rest)
svcs = must + rest[:17]
sw = {c["svc"]: c["S/W 버전"] for c in claims}
jobs = [(s, r) for r in range(int(reps)) for s in svcs]
H = {"Authorization": "Bearer " + key, "Content-Type": "application/json"}

def run(job):
    s, r = job
    body = {"model": model, "input": f"서비스번호 {s} 클레임의 사용일, S/W 버전, 품번 알려줘", "stream": True,
            "tools": [{"type": "file_search", "vector_store_ids": [vs]}], "include": ["file_search_call.results"], "instructions": instr}
    for attempt in range(3):
        try:
            resp = requests.post("https://api.openai.com/v1/responses", headers=H, json=body, stream=True, timeout=180)
            if resp.status_code >= 500:
                time.sleep(3); continue
            deltas, results, usage = [], [], None
            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                ev = json.loads(line[5:])
                t = ev.get("type")
                if t == "response.output_text.delta":
                    deltas.append(ev["delta"])
                elif t == "response.output_item.done" and ev.get("item", {}).get("type") == "file_search_call":
                    results = [x.get("text", "") for x in ev["item"].get("results") or []]
                elif t == "response.completed":
                    usage = ev["response"].get("usage")
            raw = "".join(deltas)
            hit = [x for x in results if s in x]
            return {"svc": s, "rep": r, "expect": sw[s], "raw": raw, "deltas": deltas, "ok": sw[s] in raw,
                    "chunk_has": any(f"S/W 버전 : {sw[s]}" in x for x in hit), "chunks_with_svc": len(hit), "usage": usage, "http": resp.status_code}
        except requests.RequestException as e:
            err = repr(e)
            time.sleep(3)
    return {"svc": s, "rep": r, "error": err}

with open(out_f, "w", encoding="utf-8") as f, cf.ThreadPoolExecutor(6) as ex:
    for res in ex.map(run, jobs):
        f.write(json.dumps(res, ensure_ascii=False) + "\n"); f.flush()
        print(res["svc"], res.get("rep"), res.get("ok"), res.get("chunk_has"), (res.get("raw") or res.get("error", ""))[:0], flush=True)
