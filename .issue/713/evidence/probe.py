"""#713 측정 : 오래 생각하는 질문의 SSE 이벤트 도착 시각표(운영).
사용 : python probe.py <base> <jwt_secret_file> <admin_id> <n> <out.json>
시험 사용자 qa-713-<k> 를 n 명 만들어 같은 질문을 병렬로 1회씩 보내고 끝나면 지운다.
답 원문은 남기지 않는다(시각 · 이벤트 종류 · 글자 수만)."""
import base64, hashlib, hmac, json, sys, time
import concurrent.futures as cf
import requests

base, secret_file, admin_id, n, out = sys.argv[1:]
n = int(n)
Q = "품번이 300419-00036B 인 필드 클레임은 몇 건이야? 서비스번호도 빠짐없이 알려줘."
UA = {"User-Agent": "rag-chatbot-qa/713-probe"}
secret = open(secret_file, encoding="utf-8").read().strip()
b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def tok(sub, email):
    now = int(time.time()) - 5
    h = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = b64(json.dumps({"aud": "auth", "sub": sub, "email": email, "iat": now, "auth_time": now, "exp": now + 3600}).encode())
    return f"{h}.{p}.{b64(hmac.new(secret.encode(), f'{h}.{p}'.encode(), hashlib.sha256).digest())}"


hdr = lambda sub, email: {**UA, "Authorization": "Bearer " + tok(sub, email)}
ADM = hdr(admin_id, "admin@local.test")


def users():
    get = lambda: {u["email"]: u["id"] for u in requests.get(base + "/api/admin/users", headers=ADM, timeout=30).json()}
    for k in range(1, n + 1):
        requests.post(base + "/api/admin/users", headers=ADM, json={"email": f"qa-713-{k}@local.test", "name": f"QA713 {k}"}, timeout=30)
    time.sleep(8)
    m = get()
    return [(f"qa-713-{k}@local.test", m[f"qa-713-{k}@local.test"]) for k in range(1, n + 1)]


def run(u):
    email, uid = u
    h = hdr(uid, email)
    conv = requests.post(base + "/api/conversations", headers=h, json={"title": "QA713"}, timeout=30).json()["id"]
    t0 = time.time()
    ev, buf, chars, err = [], "", 0, None
    try:
        r = requests.post(base + "/api/chat", headers={**h, "Accept": "text/event-stream"}, stream=True,
                          json={"conversationId": conv, "message": Q, "attachmentIds": []}, timeout=700)
        for chunk in r.iter_content(chunk_size=None):
            buf += chunk.decode("utf-8", "replace")
            while "\n\n" in buf:
                raw, buf = buf.split("\n\n", 1)
                t = round(time.time() - t0, 1)
                lines = raw.splitlines()
                if lines and all(l.startswith(":") for l in lines):
                    ev.append([t, "comment"])
                    continue
                name = next((l[6:].strip() for l in lines if l.startswith("event:")), "message")
                data = "\n".join(l[5:].lstrip() for l in lines if l.startswith("data:"))
                if name == "token":
                    chars += len(json.loads(data).get("delta", ""))
                    if not ev or ev[-1][1] != "token":
                        ev.append([t, "token"])
                    else:
                        ev[-1].append(t)
                elif name == "stage":
                    ev.append([t, "stage:" + json.loads(data)["stage"]])
                else:
                    ev.append([t, name])
    except Exception as e:
        err = repr(e)[:200]
    end = round(time.time() - t0, 1)
    tokens = [e for e in ev if e[1] == "token"]
    stages = [e for e in ev if e[1].startswith("stage")]
    first = tokens[0][0] if tokens else None
    last_before = max([e[0] for e in ev if first is None or e[0] < first] or [0])
    comments = [e[0] for e in ev if e[1] == "comment"]
    return {"user": email[-12:], "conv": conv, "end": end, "error": err, "done": any(e[1] == "done" for e in ev),
            "last_stage": stages[-1] if stages else None, "first_token": first, "chars": chars,
            "max_silence_before_first_token": round((first if first else end) - last_before, 1) if ev else None,
            "comments": len(comments), "comment_gaps": [round(b - a, 1) for a, b in zip(comments, comments[1:])][:20],
            "events": [e[:2] for e in ev if e[1] != "token"] + ([tokens[0][:2]] if tokens else [])}


us = users()
try:
    with cf.ThreadPoolExecutor(n) as ex:
        res = list(ex.map(run, us))
finally:
    for _, uid in us:
        requests.delete(base + f"/api/admin/users/{uid}", headers=ADM, timeout=60)
json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for r in res:
    print(r["user"], "end", r["end"], "done", r["done"], "err", (r["error"] or "")[:60], "last", r["last_stage"],
          "first", r["first_token"], "silence", r["max_silence_before_first_token"], "comments", r["comments"])
