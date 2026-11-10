#!/bin/sh
# #653 재측정 : 새 판 실패 2문항만 운영 스토어 x5 · 임시 스토어(새 판) x5. 끝나면 re.done
cd /tmp/m653 || exit 1
python3 qprobe5.py instr-full.json - q-cmp2.json 5 > base-cmp2.json 2> base-cmp2.err
python3 vs468.py make new.md > vsmake2.json 2> vsmake2.err || { touch re.done; exit 1; }
ST=$(python3 -c "import json;print(json.load(open('vsmake2.json'))['store'])")
FI=$(python3 -c "import json;print(json.load(open('vsmake2.json'))['file'])")
VS_OVERRIDE="$ST" python3 qprobe5.py instr-full.json - q-cmp2.json 5 > new-cmp2.json 2> new-cmp2.err
python3 vs468.py drop "$ST" "$FI" > vsdrop2.json 2>&1
touch re.done
