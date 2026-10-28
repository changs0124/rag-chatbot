"""필드 클레임 엑셀을 Vector Store 투입용 Markdown 으로 바꾼다 (#266).

관리자 업로드 허용 형식이 PDF·TXT·MD·DOCX 뿐이라 xlsx 는 그대로 못 올린다. 「통합리스트」 시트를
클레임 1건 = 절 하나로 펴고, 머리에 전체 집계를 붙인다.

반출승인이 없는 자료라 사람을 알아볼 수 있는 값은 올리기 전에 지운다.
- 고객사 업체명(`업체명` 열) → `고객사-NNN` (2026-09-22 결정). 등장 순 번호라 같은 업체는 같은 가명이다
- 자유 서술(불량내용 · 분석내용 …)에 섞인 사람 이름 → `담당자-NN`, 협력사 상호 → `협력사-NN`.
  **목록은 저장소에 두지 않는다** - 저장소가 공개라 목록 자체가 유출이다. `--mask-terms` 파일로 받는다
- 전화번호 → `[연락처 삭제]`

**마스킹 뒤 남은 후보를 다시 훑고, 있으면 exit 1 로 멈춘다.** 목록은 사람이 만든 것이라 새 자료가 들어오면
빠지는 이름이 생긴다. 조용히 산출물을 쓰면 그대로 스토어에 올라간다.

산출물은 저장소에 커밋하지 않는다. 반영 절차는 docs/01_specs/live-integration.md 5-2.

실행 : python scripts/claims/preprocess.py <원본.xlsx> <출력.md> --mask-terms <목록 파일>
"""
import argparse
import collections
import datetime as dt
import pathlib
import re
import sys

import openpyxl

# 휴대폰(010-1234-5678 · 01012345678) · 유선(02-123-4567 · 055)123-4567). 품번 `300419-00035B` 를
# 잡지 않게 앞뒤에 글자·하이픈이 붙은 숫자는 뺀다 - 넓게 잡으면 품번이 전부 걸린다
PHONE = re.compile(
    r"(?<![\w-])01[016789][-. ]?\d{3,4}[-. ]?\d{4}(?!\w)"
    r"|(?<![\w-])0(?:2|[3-6]\d)[-. )]\d{3,4}[-. ]\d{4}(?!\w)"
)
# 남은 사람 이름 후보 : 한글 2~3자 + 직함. 「고객님」처럼 사람을 가리키지 않는 말은 아래에서 뺀다
TITLES = ["님", "부장", "차장", "과장", "대리", "사원", "주임", "책임", "선임", "수석", "팀장", "실장", "소장",
          "센터장", "이사", "매니저", "기사"]
NAME_LIKE = re.compile(r"(?<![가-힣])([가-힣]{2,3})\s?(?:" + "|".join(TITLES) + ")")
# 「부장님」·「책임매니저」처럼 직함이 직함에 붙은 경우도 걸리므로 직함 자체도 뺀다
NOT_A_NAME = {"고객", "센터", "담당", "업체", "본사", "현장", "지사", "영업", "창원", "부산", "서울", "협력사", *TITLES}

# 장비 알람 코드(#267). 접두 `AL` · `L`(점·공백 선택) + 4자리, 또는 접두 없는 2xxx. 접두 없는 쪽은
# 날짜(2023-06-19) · 연도(2024년) · 전압(220V) · 소수가 걸리지 않게 앞뒤를 막는다. 원본 실측으로 맞춘 규칙이다
ALARM_PREFIXED = re.compile(r"(?i)(?<![A-Za-z0-9])A?L\s*\.?\s*(\d{4})(?!\d)")
ALARM_BARE = re.compile(r"(?<![\d\-/A-Za-z])(?<!\d\.)(2\d{3})(?![\d년\-/]|\.\d|\s*년|\s*[Vv])")
# 드라이브 7세그 표시의 저전압 `UU`(AL1-UU · ALP_UU · 「드라이브 UU」 …). 표기가 제각각이라 UU 만 본다
UU = re.compile(r"(?i)(?<![A-Za-z])UU(?![A-Za-z])")


def alarm_codes(value):
    text = fmt(value)
    return sorted(set(ALARM_PREFIXED.findall(text)) | set(ALARM_BARE.findall(text)))


FIELDS = ["입고일자", "품번", "품명", "업체명", "기종", "호기정보", "출하일", "고장일", "사용일",
          "S/W 버전", "S/N", "불량유형", "분석내용", "불량원인", "소손 및 불량소자", "최종원인"]


def clean(s):
    # NBSP 도 공백으로 편다 - 엑셀 셀에 섞여 있어 빼면 같은 문장이 다른 글자로 색인된다.
    # 보이지 않는 글자를 정규식에 그대로 두면 옮기다 일반 공백으로 바뀐다(실제로 그랬다) - 이스케이프로 적는다
    return re.sub(r"[ \t\u00a0]+", " ", str(s)).strip()


def fmt(v):
    if v is None:
        return ""
    if isinstance(v, dt.datetime):
        return v.date().isoformat()
    # 셀 안 줄바꿈이 목록 항목을 끊지 않게 한 줄로 편다
    return " / ".join(clean(l) for l in str(v).splitlines() if clean(l))


def load_terms(path):
    """`person <이름>` · `partner <상호>` 한 줄씩. `#` 은 주석."""
    terms = {"person": [], "partner": []}
    for no, line in enumerate(pathlib.Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        kind, _, value = line.partition(" ")
        if kind not in terms or not value.strip():
            sys.exit(f"{path}:{no} : `person <이름>` 또는 `partner <상호>` 형식이 아니다")
        terms[kind].append(value.strip())
    return terms


def build_aliases(recs, terms):
    """원문 → 가명. 등장 순으로 번호를 매긴다 - 같은 대상은 늘 같은 가명이라 대상 단위 질문이 성립한다."""
    alias = {}
    for r in recs:
        name = fmt(r["업체명"])
        if name and name not in alias:
            alias[name] = f"고객사-{sum(v.startswith('고객사-') for v in alias.values()) + 1:03d}"
    text = "\n".join(fmt(v) for r in recs for v in r.values() if isinstance(v, str))
    for kind, label in (("person", "담당자"), ("partner", "협력사")):
        # 상호는 「영남머신(주)」와 「영남머신」처럼 표기가 갈린다. 짧은 표기가 긴 표기에 들어 있으면 같은 대상이다
        found = sorted((t for t in terms[kind] if t in text), key=text.index)
        canon = {}
        for t in found:
            root = next((c for c in canon if c in t or t in c), None)
            canon[t] = canon[root] if root else f"{label}-{len(set(canon.values())) + 1:02d}"
        alias.update(canon)
    return alias


def mask(value, alias):
    # 긴 것부터 바꿔야 「영남머신(주)」가 「영남머신」 치환에 반쯤 먹히지 않는다
    for name in sorted(alias, key=len, reverse=True):
        value = value.replace(name, alias[name])
    return PHONE.sub("[연락처 삭제]", value)


def leftovers(md):
    """마스킹 뒤에도 남은 개인정보 후보."""
    found = [f"전화번호 {len(PHONE.findall(md))}건"] if PHONE.search(md) else []
    names = collections.Counter(m.group(1) for m in NAME_LIKE.finditer(md) if m.group(1) not in NOT_A_NAME)
    found += [f"이름 후보 「{n}」 {c}회" for n, c in names.items()]
    return found


def claims_to_md(xlsx, terms):
    ws = openpyxl.load_workbook(xlsx, data_only=True)["통합리스트"]
    rows = list(ws.iter_rows(values_only=True))
    header = [re.sub(r"\s+", "", str(h)) for h in rows[0]]
    recs = [dict(zip(header, r)) for r in rows[1:] if any(c is not None for c in r)]

    alias = build_aliases(recs, terms)
    for r in recs:
        for key in r:
            if isinstance(r[key], str):
                r[key] = mask(fmt(r[key]), alias)

    def count(key, top=None, nums_upto=0, label=""):
        """nums_upto 이하인 항목은 클레임 번호를 덧붙인다 - 「케이블 문제로 판명된 클레임」처럼 몇 건짜리를
        물으면 상세 절을 하나씩 검색으로 모으다 한 건을 빠뜨렸다(#521).
        label 은 줄마다 칸 이름을 붙인다 - 「21.3」 처럼 값만 짧은 줄은 「S/W 버전 21.3」 으로 묻는 검색에 안 걸렸다(#531)"""
        g = collections.defaultdict(list)
        for r in recs:
            g[fmt(r[key]) or "(비어 있음)"].append(r)
        top_items = sorted(g.items(), key=lambda kv: -len(kv[1]))[:top]
        return [f"- {label}{k} : {len(rs)}건" +(f" · 클레임 {nums(rs)}" if len(rs) <= nums_upto else "") for k, rs in top_items]

    def nums(rs):
        return "·".join(fmt(r["순번"]) for r in sorted(rs, key=lambda r: r["순번"]))

    def breakdown(groups, min_count=1, by_name=False, avg=False, with_nums=False):
        """그룹 → 최종원인 분포. 기본은 건수 순, 연도처럼 순서가 있는 그룹은 이름 순.
        avg 는 평균 사용일, with_nums 는 클레임 번호 목록을 덧붙인다 - 「평균 며칠」·「어떤 건」은 건수만으로 답이 안 된다(#321)"""
        lines = []
        order = (lambda kv: kv[0]) if by_name else (lambda kv: (-len(kv[1]), kv[0]))
        for name, rs in sorted(groups.items(), key=order):
            if len(rs) < min_count:
                continue
            fin = collections.Counter(fmt(r["최종원인"]) or "(비어 있음)" for r in rs)
            line = f"- {name} : {len(rs)}건 — " + " · ".join(f"{k} {n}" for k, n in fin.most_common())
            days = [r["사용일"] for r in rs if isinstance(r["사용일"], (int, float))]
            if avg and days:
                line += f" · 평균 사용일 {sum(days) / len(days):.1f}일"
            if with_nums:
                line += f" · 클레임 {nums(rs)}"
            lines.append(line)
        return lines

    def group(key_fn):
        g = collections.defaultdict(list)
        for r in recs:
            for k in key_fn(r):
                g[k].append(r)
        return g

    year_of = lambda r: f"{r['입고일자'].year}년" if isinstance(r["입고일자"], dt.datetime) else "(입고일자 없음)"
    # 알람 코드는 정규식 두 벌을 도는 계산이라 행마다 한 번만 뽑는다
    codes = {id(r): alarm_codes(r["불량내용"]) for r in recs}
    by_year = group(lambda r: [year_of(r)])
    by_model = group(lambda r: [fmt(r["기종"]) or "(비어 있음)"])
    by_alarm = group(lambda r: [f"AL.{c}" for c in codes[id(r)]])
    by_part = group(lambda r: [fmt(r["품번"]) or "(비어 있음)"])
    by_year_part = group(lambda r: [f"{year_of(r)} · {fmt(r['품번']) or '(비어 있음)'}"])
    by_year_model = group(lambda r: [f"{year_of(r)} · {fmt(r['기종']) or '(비어 있음)'}"])
    by_alarm_year = group(lambda r: [f"AL.{c} · {year_of(r)}" for c in codes[id(r)]])
    by_customer = group(lambda r: [fmt(r["업체명"]) or "(비어 있음)"])
    # 고장일이 날짜인 행만 호기 타임라인에 넣는다(#331) - 공란 · 텍스트가 섞이면 아래 min() · 정렬 · 뺄셈이 예외로 죽는다
    by_machine = group(lambda r: [fmt(r["호기정보"])] if fmt(r["호기정보"]) and isinstance(r["고장일"], dt.datetime) else [])
    # 뺀 건은 절 머리에 밝힌다 - 조용히 빠지면 「재발 호기 전부」라는 제목이 거짓이 된다
    undated = [r for r in recs if fmt(r["호기정보"]) and not isinstance(r["고장일"], dt.datetime)]
    with_uu = [r for r in recs if UU.search(fmt(r["불량내용"]))]
    # 두 집합의 합 - recs 순서를 지키고 겹치는 건은 한 번만
    either = {id(r) for r in by_alarm.get("AL.2144", []) + with_uu}
    with_2144_or_uu = [r for r in recs if id(r) in either]

    dates = sorted(r["입고일자"] for r in recs if isinstance(r["입고일자"], dt.datetime))
    usage = [r["사용일"] for r in recs if isinstance(r["사용일"], (int, float))]

    def customer_lines():
        lines = []
        for name, rs in sorted(by_customer.items(), key=lambda kv: (-len(kv[1]), kv[0])):
            if len(rs) < 2:
                continue
            models = collections.Counter(fmt(r["기종"]) or "(비어 있음)" for r in rs)
            lines.append(f"- {name} : {len(rs)}건 — 클레임 {nums(rs)} · 기종 " +
                         " · ".join(f"{k} {n}" for k, n in models.most_common()))
        return lines

    def machine_lines():
        """같은 호기에서 2건 이상. 간격은 고장일 차이 - 「재발까지 며칠」을 매 턴 날짜 계산으로 미루지 않는다"""
        lines = []
        for name, rs in sorted(by_machine.items(), key=lambda kv: min(r["고장일"] for r in kv[1] if r["고장일"])):
            if len(rs) < 2:
                continue
            rs = sorted(rs, key=lambda r: r["고장일"])
            gaps = [(b["고장일"] - a["고장일"]).days for a, b in zip(rs, rs[1:])]
            customers = list(dict.fromkeys(fmt(r["업체명"]) for r in rs))
            lines.append(f"- 호기 {name} · {' / '.join(customers)} · {fmt(rs[0]['기종'])} : {len(rs)}건 — " +
                         " → ".join(f"클레임 {fmt(r['순번'])}({fmt(r['고장일'])})" for r in rs) +
                         " · 간격 " + " · ".join(f"{g}일" for g in gaps))
        return lines

    def usage_lines():
        bands = [(0, 30), (31, 90), (91, 180), (181, 365), (366, 730), (731, None)]
        lines = []
        for lo, hi in bands:
            rs = [r for r in recs if isinstance(r["사용일"], (int, float)) and r["사용일"] >= lo and (hi is None or r["사용일"] <= hi)]
            label = f"{lo}~{hi}일" if hi else f"{lo}일 이상"
            # 짧은 구간은 건마다 사용일까지 - 「제일 빨리 고장 난 건」을 바로 답하게
            detail = (" · ".join(f"클레임 {fmt(r['순번'])}({r['사용일']}일)" for r in sorted(rs, key=lambda r: r["사용일"]))
                      if hi and hi <= 90 else f"클레임 {nums(rs)}")
            lines.append(f"- {label} : {len(rs)}건 — {detail}")
        return lines

    def month_lines(key, label):
        """연도마다 한 줄 - 반기 · 분기 · 월 합계까지 미리 센다. 표에 없는 「2023년 1월 출하」 · 「2023년 4분기 고장」 건수를
        상세 절을 검색으로 세다 일부만 세고 단정했다(#532). 칸 이름을 줄마다 붙이는 이유는 #531 과 같다"""
        g = collections.defaultdict(collections.Counter)
        for r in recs:
            if isinstance(r[key], dt.datetime):
                g[r[key].year][r[key].month] += 1
        lines = []
        for y, m in sorted(g.items()):
            q = [sum(m[i] for i in range(s, s + 3)) for s in (1, 4, 7, 10)]
            lines.append(f"- {label} {y}년 : {sum(m.values())}건 · {y}년 상반기(1~6월) {q[0] + q[1]}건 · {y}년 하반기(7~12월) {q[2] + q[3]}건 · "
                         + " · ".join(f"{y}년 {i + 1}분기 {n}건" for i, n in enumerate(q)) + " · "
                         + " · ".join(f"{y}년 {i}월 {m[i]}건" for i in range(1, 13)))
        undated_n = sum(not isinstance(r[key], dt.datetime) for r in recs)
        return lines + ([f"- {label} 값이 날짜가 아닌 클레임 {undated_n}건은 위 줄에서 뺐다"] if undated_n else [])

    machines = machine_lines()
    out = [
        "# 필드 클레임 현황 (서보 드라이브 불량 분석 통합리스트)",
        "",
        "원본 : 필드클레임현황.xlsx 「통합리스트」 시트. 현장에서 고장 난 서보 드라이브를 회수해 분석한 결과다.",
        "고객사 업체명은 「고객사-001」, 협력사 상호는 「협력사-01」, 사람 이름은 「담당자-01」 형식의 가명으로 바꿔 두었다.",
        "같은 번호는 같은 대상이다. 전화번호는 지웠다.",
        "한 건 = 한 클레임. 「불량 내용」은 현장 서비스 기록, 「분석내용·불량원인·최종원인」은 회수품 분석 결과다.",
        "",
        "## 전체 요약 (집계)",
        "",
        f"아래 표는 {len(recs)}건 전체를 미리 센 값이다. 건수 · 「전부」 · 평균 · 재발 질문은 상세 절을 세지 말고 이 표로 답한다.",
        "",
        f"- 총 {len(recs)}건 · 입고일자 {dates[0].date()} ~ {dates[-1].date()}",
        f"- 출하 후 고장까지 사용일 : 평균 {sum(usage) / len(usage):.0f}일 · 최소 {min(usage)}일 · 최대 {max(usage)}일",
        "",
        "### 최종원인별 건수 (5건 이하는 클레임 번호도)", "", *count("최종원인", nums_upto=5), "",
        "### 불량원인별 건수 (회수품 분석 결과, 5건 이하는 클레임 번호도)", "", *count("불량원인", nums_upto=5), "",
        "### 불량유형별 건수 (5건 이하는 클레임 번호도)", "", *count("불량유형", nums_upto=5), "",
        # S/W 버전은 상세 끝 한 줄에만 있어 「21.3」 같은 짧은 값으로는 그 클레임 조각이 검색에 안 걸렸다(#531)
        "### S/W 버전별 건수 (10건 이하는 클레임 번호도)", "", *count("S/W버전", nums_upto=10, label="S/W 버전 "), "",
        "### 소손 및 불량소자별 건수 (상위 15)", "", *count("소손및불량소자", 15), "",
        "### 품번별 건수와 최종원인 · 평균 사용일", "", *breakdown(by_part, avg=True), "",
        "### 입고 연도별 건수와 최종원인 (입고일자의 연도 기준)", "", *breakdown(by_year, by_name=True, avg=True), "",
        "### 입고 연도 × 품번별 건수와 최종원인", "", *breakdown(by_year_part, by_name=True, avg=True), "",
        "### 기종별 건수와 최종원인 (전체 기종, 기종 이름이 조금만 달라도 다른 기종 — 예 : T 4000 과 T 4000L)", "",
        *breakdown(by_model, avg=True), "",
        "### 입고 연도 × 기종별 건수와 최종원인 (기종 이름이 조금만 달라도 다른 기종)", "",
        *breakdown(by_year_model, by_name=True, with_nums=True), "",
        "### 알람 코드별 건수와 최종원인 (불량 내용 기준)", "",
        "집계 기준 : 「불량 내용」에 그 코드가 한 번이라도 나온 클레임 수. `AL.2144` · `AL2144` · `L.2144` · `al2144` · 접두 없는 `2144`",
        "같은 표기 변형은 하나로 셌다. 한 클레임에 코드가 여럿이면 각 코드에 하나씩 센다(합이 총 건수보다 크다).", "",
        *breakdown(by_alarm, min_count=2), "",
        # 번호 목록은 따로 둔다 - 위 표 줄을 바꾸면 그 표로 답하던 질문이 받는 검색 조각이 바뀌고,
        # 표에 붙이면 흔한 코드 한 줄에 번호가 백 개를 넘는다(#321)
        "### 알람 코드별 클레임 번호 (위 알람 표의 각 줄이 어느 클레임인지)", "",
        *[f"- {k} : 클레임 {nums(rs)}" for k, rs in sorted(by_alarm.items(), key=lambda kv: (-len(kv[1]), kv[0]))
          if len(rs) >= 2], "",
        "### 알람 코드 × 입고 연도별 건수와 최종원인 (위 알람 표를 입고일자의 연도로 나눈 것)", "",
        *breakdown({k: v for k, v in by_alarm_year.items() if len(by_alarm[k.split(" · ")[0]]) >= 2},
                   by_name=True, with_nums=True), "",
        f"### 고객사별 건수 (2건 이상인 고객사 전부 · 전체 고객사 {len(by_customer)}곳 중 "
        f"{sum(len(rs) >= 2 for rs in by_customer.values())}곳, 나머지는 1건씩)", "", *customer_lines(), "",
        f"### 같은 호기 재발 (호기정보가 같은 클레임이 2건 이상인 장비 전부 · {len(machines)}대)", "",
        *([f"고장일이 날짜가 아닌 클레임 {len(undated)}건(클레임 {nums(undated)})은 이 표에서 뺐다", ""] if undated else []),
        "고객사가 둘로 적힌 호기는 원본에 그렇게 기록된 것이다.", "", *machines, "",
        "### 출하 후 고장까지 사용일 구간별 건수", "", *usage_lines(), "",
        "### 출하일 · 고장일 · 입고일자 연월별 건수 (연도 · 반기 · 분기 · 월)", "",
        *month_lines("출하일", "출하일"), *month_lines("고장일", "고장일"), *month_lines("입고일자", "입고일자"), "",
        "### 드라이브 표시 UU (저전압) 언급 건수", "",
        # 분포까지 함께 둔다 - 건수만 있으면 모델이 이 숫자를 들고 최종원인 분포를 지어냈다(#267)
        # AL.2144 만의 줄을 합집합 바로 곁에 둔다 - 이 절만 검색되면 모델이 합집합 건수를 AL.2144 건수로 읽었다(#267)
        *breakdown({"장비 알람 `AL.2144` 만(드라이브 표시 UU 제외)": by_alarm.get("AL.2144", [])}),
        *breakdown({"드라이브 표시 `UU`(`AL1-UU` · `ALP-UU` · `AL 1_UU` 등 표기 무관)가 나온 클레임": with_uu,
                    "저전압 계열 전체 — 장비 알람 `AL.2144` 와 드라이브 표시 `UU` 중 하나라도 나온 클레임(합집합). `AL.2144` 만의 건수는 위 알람 코드 표": with_2144_or_uu}, by_name=True), "",
        "## 클레임 상세", "",
        "각 줄 앞의 `[클레임 N]` 은 그 줄이 어느 클레임의 것인지다. 검색 조각이 클레임 중간에서 잘려도 줄마다 출처가 남게 붙였다.", "",
    ]
    for r in recs:
        tag = f"[클레임 {fmt(r['순번'])}]"
        out.append(f"### 클레임 {fmt(r['순번'])} · 서비스번호 {fmt(r['서비스번호'])}")
        out.append("")
        # **결론을 머리 바로 밑에 한 줄로 둔다.** 「불량 내용」이 길면 분석 · 최종원인 줄은 다음 검색 조각으로 넘어가,
        # 서비스번호로 찾은 조각에는 원인이 없다 - 모델은 이웃 클레임의 흔한 원인(R64)으로 메꿨다(#267)
        # S/N · 불량유형도 요약에 둔다 - 조각이 상세의 `S/W 버전` 줄에서 끊기면 바로 뒤 두 줄이 안 잡혀 「S/N 확인 불가」로 답했다(#468)
        in_summary = ("S/N", "기종", "호기정보", "불량유형", "분석내용", "불량원인", "최종원인")
        summary = [f"서비스번호 {fmt(r['서비스번호'])}"] + [f"{f} {fmt(r[f])}" for f in in_summary if fmt(r[f])]
        out.append(f"- {tag} 요약 : " + " · ".join(summary))
        out.append(f"- {tag} 불량 내용 : {fmt(r['불량내용'])}")
        for f in FIELDS:
            # 요약에 있는 값은 상세에 다시 적지 않는다 - 같은 말이 두 번 들어가 「원인」 같은 단어의 키워드 점수가 부풀면
            # 매뉴얼 · 클레임 복합 질문에서 매뉴얼 조각이 검색 상위 20 밖으로 밀렸다(#467)
            if f in in_summary:
                continue
            v = fmt(r[re.sub(r'\s+', '', f)])
            if v:
                out.append(f"- {tag} {f} : {v}")
        out.append("")
    return "\n".join(out), len(recs), alias


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("xlsx")
    ap.add_argument("out")
    ap.add_argument("--mask-terms", required=True, help="person/partner 목록 파일 (저장소 밖)")
    args = ap.parse_args()

    md, n, alias = claims_to_md(args.xlsx, load_terms(args.mask_terms))
    left = leftovers(md)
    if left:
        # 산출물을 쓰지 않는다 - 쓰면 누군가 그대로 올린다
        print("마스킹 뒤에도 개인정보 후보가 남았다. 목록에 넣거나, 사람이 아니면 NOT_A_NAME 에 더한 뒤 다시 돌린다 :",
              *left, sep="\n  ", file=sys.stderr)
        sys.exit(1)
    pathlib.Path(args.out).write_text(md, encoding="utf-8")
    kinds = collections.Counter(v.split("-")[0] for v in set(alias.values()))
    print(f"클레임 : {n}건 · {len(md):,}자 · 가명 {dict(kinds)}")


if __name__ == "__main__":
    main()
