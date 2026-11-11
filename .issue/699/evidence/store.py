"""임시 스토어 : 운영 스토어의 매뉴얼 file_id 재사용 + after.md 를 「필드클레임현황.md」 이름으로 업로드. 사용 : store.py <key> create|delete <state.json>"""
import json, sys, time, requests
key, cmd, state_f = open(sys.argv[1]).read().strip(), sys.argv[2], sys.argv[3]
H = {"Authorization": "Bearer " + key}
A = "https://api.openai.com/v1"
if cmd == "create":
    prod = sys.argv[4]
    files = requests.get(f"{A}/vector_stores/{prod}/files?limit=100", headers=H, timeout=60).json()["data"]
    names = {}
    for f in files:
        names[f["id"]] = requests.get(f"{A}/files/{f['id']}", headers=H, timeout=60).json().get("filename")
    print("prod files", list(names.values()))
    manual = [i for i, n in names.items() if n and n.startswith("TM매뉴얼")]
    up = requests.post(f"{A}/files", headers=H, files={"file": ("필드클레임현황.md", open("after.md", "rb"), "text/markdown")}, data={"purpose": "assistants"}, timeout=120).json()
    vs = requests.post(f"{A}/vector_stores", headers={**H, "Content-Type": "application/json"}, json={"name": "rag-699-temp", "file_ids": manual + [up["id"]]}, timeout=60).json()
    json.dump({"vs": vs["id"], "upload": up["id"]}, open(state_f, "w"))
    for _ in range(90):
        s = requests.get(f"{A}/vector_stores/{vs['id']}", headers=H, timeout=60).json()
        if s.get("file_counts", {}).get("in_progress", 1) == 0:
            print("ready", s["file_counts"]); break
        time.sleep(5)
else:
    st = json.load(open(state_f))
    print("del vs", requests.delete(f"{A}/vector_stores/{st['vs']}", headers=H, timeout=60).status_code)
    print("del file", requests.delete(f"{A}/files/{st['upload']}", headers=H, timeout=60).status_code)
