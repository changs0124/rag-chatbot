#!/bin/sh
# #653 측정 : 운영 스토어로 두 건 비교 60 → 임시 스토어(새 클레임 판 + 운영 매뉴얼)로 비교 60 · 배터리 31 x 4 → 임시 스토어 지우기. 끝나면 m653.done
cd /tmp/m653 || exit 1
python3 qprobe5.py instr-full.json - q-cmp.json 1 > base-cmp.json 2> base-cmp.err
python3 vs468.py make new.md > vsmake.json 2> vsmake.err || { touch m653.done; exit 1; }
ST=$(python3 -c "import json;print(json.load(open('vsmake.json'))['store'])")
FI=$(python3 -c "import json;print(json.load(open('vsmake.json'))['file'])")
VS_OVERRIDE="$ST" python3 qprobe5.py instr-full.json - q-cmp.json 1 > new-cmp.json 2> new-cmp.err
VS_OVERRIDE="$ST" python3 qprobe5.py instr-full.json - q-battery.json 4 > new-bat.json 2> new-bat.err
python3 vs468.py drop "$ST" "$FI" > vsdrop.json 2>&1
touch m653.done
