"""PDF 를 Vector Store 투입용 Markdown + 그림 크롭으로 나눈다 (FEAT-CHAT-004).

Vector Store 는 텍스트만 색인한다. PDF 를 그대로 올리면 그림은 버려지므로 그림 영역을 잘라 PNG 로 따로 두고,
본문의 그 자리에는 그림 표식 `[[그림:<key>]]` 과 그림 직전 문장을 남긴다. 모델이 표식을 답에 옮기면 화면이
그 자리를 그림으로 바꾼다.

- 그림 영역 = 표 밖의 벡터 도형 + 내장 이미지를 근접 병합한 덩어리. 매뉴얼의 그림은 대부분 벡터라
  (180쪽 중 내장 래스터 68개) 내장 이미지만 뽑으면 거의 다 빠진다
- 표는 자르지 않는다. 표는 텍스트로 색인돼야 검색에 잡힌다
- key 는 쪽 번호 + 쪽 안 위→아래 순번이라 같은 원본이면 늘 같다. 대화 기록에 남은 표식이 재전처리 뒤에도
  같은 그림을 가리켜야 하기 때문이다
- 쪽마다 목차 경로를 머리에 붙인다. 기본 청킹(800토큰)이 쪽을 자르면 청크가 어느 절인지 잃는다

산출물은 저장소에 커밋하지 않는다 - 저장소가 공개다. 반영 절차는 docs/01_specs/live-integration.md 5-1.

실행 : python scripts/doc-figures/preprocess.py <원본.pdf> <출력 폴더> --prefix tm
"""
import argparse
import collections
import json
import pathlib
import re

import pymupdf

# 병합 거리(pt). 7세그 표시와 그 아래 손가락·「1번」 라벨이 한 그림으로 묶이는 정도
GAP = 14
# 이 글자 수 이하인 줄은 그림 라벨, 넘으면 문장이다. 문장 줄은 그림 띠를 끊는다
LABEL_CHARS = 20
# 이보다 작은 덩어리는 그림이 아니다 - 「주의」 삼각형 같은 아이콘이 걸린다
MIN_W, MIN_H, MIN_AREA = 40, 25, 2500
# 덩어리 안 글자가 이보다 많으면 그림이 아니라 테두리 친 글상자다
MAX_TEXT_CHARS = 150
# 머리·꼬리 띠(쪽 높이 비율). 꼬리말 위 가로줄이 그림으로 잡히지 않게 한다
HEADER_BAND, FOOTER_BAND = 0.05, 0.06
# 그림 영역 바깥 여백(pt)과 렌더 해상도
PAD, DPI = 6, 150

RUNNING_HEADER = re.compile(r"^Part\s+\d+\s+.+\|\s*\d{3}$")
ITEM_HEAD = re.compile(r"^(\(\d+\)|\d+\)|[▶■●※-])")


def clean(s):
    return re.sub(r"[ \t ]+", " ", str(s)).strip()


def bands(rects, prose):
    """도형을 세로축으로 눕혀 가로 띠로 묶는다.

    매뉴얼의 그림은 문단 사이 가로 띠에 놓인다(「표시 ⇨ 표시」 처럼 좌우로 벌어진 조각이 한 그림이다).
    사각형끼리 거리로 묶으면 좌우 조각이 따로 잘려, 세로로 GAP 안에 이어지고 사이에 문장 줄이 없으면 한 띠로 본다.
    """
    out = []
    for r in sorted(rects, key=lambda r: r.y0):
        if out:
            last = out[-1]
            between = any(last.y1 < (b.y0 + b.y1) / 2 < r.y0 for b in prose)
            if r.y0 - last.y1 < GAP and not between:
                out[-1] = last | r  # Rect 의 |= 는 새 객체를 돌려줘 목록 안의 값이 안 바뀐다
                continue
        out.append(pymupdf.Rect(r))
    return out


def text_lines(page):
    """읽는 순서대로 (bbox, 글자, 블록 번호) 줄 목록"""
    lines = []
    for n, block in enumerate(page.get_text("dict")["blocks"]):
        for line in block.get("lines", []):
            text = clean("".join(span["text"] for span in line["spans"]))
            if text and not RUNNING_HEADER.match(text):
                lines.append((pymupdf.Rect(line["bbox"]), text, n))
    return lines


def caption_for(region, body, at):
    """그림 설명. 바로 아래 괄호 캡션(「(드라이브 전면)」)이 있으면 그것을, 그림 직전 문단을 함께 쓴다"""
    above = ""
    if at >= 0:
        # 줄바꿈된 문단은 PDF 안에서 줄마다 다른 블록이라 블록 번호로는 못 잇는다. 줄 간격이 촘촘한 동안
        # 거슬러 올라가되, 항목 머리(「(7)」 · 「▶」)를 만나면 거기서 멈춘다
        start = at
        while start > 0 and not ITEM_HEAD.match(body[start][1]):
            prev, cur = body[start - 1][0], body[start][0]
            if not 0 <= cur.y0 - prev.y1 < cur.height:
                break
            start -= 1
        above = " ".join(t for _, t, _ in body[start:at + 1])
    below = next((t for b, t, _ in body if 0 <= b.y0 - region.y1 < 24 and re.fullmatch(r"\(.{1,30}\)", t)), "")
    return " - ".join(x for x in (below, above) if x)


def inside_of(region, bbox):
    return region.contains((bbox.tl + bbox.br) / 2)


def figure_regions(page, lines):
    area = page.rect
    top, bottom = area.height * HEADER_BAND, area.height * (1 - FOOTER_BAND)
    tables = [pymupdf.Rect(t.bbox) for t in page.find_tables().tables]

    def keep(r):
        if r.is_empty or r.y1 < top or r.y0 > bottom:
            return False
        return not any(t.contains(r) or t.intersects(r) for t in tables)

    rects = [d["rect"] for d in page.get_drawings() if keep(d["rect"])]
    rects += [pymupdf.Rect(i["bbox"]) for i in page.get_image_info() if keep(pymupdf.Rect(i["bbox"]))]

    labels = [b for b, t, _ in lines if len(t) <= LABEL_CHARS]
    prose = [b for b, t, _ in lines if len(t) > LABEL_CHARS]
    regions = []
    for r in bands(rects, prose):
        # 그림에 붙은 짧은 라벨(「2번」 · 「SET」)은 그림의 일부로 넣는다. 걸치기만 해도 넣어야 잘린 글자가 안 남는다.
        # 그림 윗변보다 위에서 시작하는 줄은 넣지 않는다 - 줄바꿈된 앞 문장의 꼬리(「…변경합니다.」)라 본문에 남아야 한다
        near = pymupdf.Rect(r.x0 - GAP, r.y0 - GAP, r.x1 + GAP, r.y1 + GAP)
        for b in labels:
            if near.intersects(b) and b.y0 >= r.y0 - 2:
                r = r | b
        inside = sum(len(t) for b, t, _ in lines if inside_of(r, b))
        if r.width >= MIN_W and r.height >= MIN_H and r.width * r.height >= MIN_AREA and inside <= MAX_TEXT_CHARS:
            regions.append(r)
    regions.sort(key=lambda r: (round(r.y0), r.x0))
    return regions


def convert(pdf_path, out_dir, prefix):
    doc = pymupdf.open(pdf_path)
    fig_dir = out_dir / "figures"
    fig_dir.mkdir(parents=True, exist_ok=True)
    for old in fig_dir.glob(f"{prefix}-p*.png"):
        old.unlink()  # 재전처리 때 사라진 그림이 옛 파일로 남지 않게

    toc = [(lvl, clean(title), page) for lvl, title, page in doc.get_toc()]
    first_body = min((p for _, _, p in toc), default=1)
    starts = collections.defaultdict(list)
    for entry in toc:
        starts[entry[2]].append(entry)
    parts = [t for lvl, t, _ in toc if lvl == 1]

    out = [
        f"# {pdf_path.stem}",
        "",
        f"원본 : {pdf_path.name} · {doc.page_count}쪽. 각 절 앞의 「PDF n쪽」은 원본 PDF 의 쪽 번호다.",
        *([f"구성 : {' / '.join(parts)}.", "제목이 비슷한 절이 여러 Part 에 있으면 제목의 Part 를 함께 확인할 것."] if parts else []),
        "본문의 `[[그림:<key>]]` 은 원본의 그림 자리다. 바로 뒤 괄호가 그 그림이 무엇인지 알려 준다.",
        "",
    ]
    manifest = []
    path = {}
    for i, page in enumerate(doc):
        no = i + 1
        lines = text_lines(page)
        if not lines or 3 < no < first_body:
            continue  # 빈 쪽 · 목차
        for lvl, title, _ in starts.get(no, []):
            path = {k: v for k, v in path.items() if k < lvl}
            path[lvl] = title
        heading = " > ".join(path[k] for k in sorted(path)) or ("표지" if no == 1 else "머리말")

        regions = figure_regions(page, lines)
        body = [line for line in lines if not any(inside_of(r, line[0]) for r in regions)]
        # 그림 위치 = 그림 윗변보다 위에 있는 마지막 줄의 다음. 그 줄이 곧 그림 설명이다
        slots = collections.defaultdict(list)
        for k, r in enumerate(regions, start=1):
            key = f"{prefix}-p{no:03d}-f{k}"
            above = [j for j, (b, _, _) in enumerate(body) if (b.y0 + b.y1) / 2 < r.y0]
            at = above[-1] if above else -1
            caption = caption_for(r, body, at) or heading
            clip = pymupdf.Rect(r.x0 - PAD, r.y0 - PAD, r.x1 + PAD, r.y1 + PAD) & page.rect
            # 본문에 남는 줄이 여백에 걸리면 그 줄 앞에서 자른다 - 반쯤 잘린 글자가 그림에 남지 않게
            for b, _, _ in body:
                if clip.intersects(b) and b.y1 <= r.y0 + 4:
                    clip.y0 = max(clip.y0, b.y1 + 1)
                elif clip.intersects(b) and b.y0 >= r.y1 - 4:
                    clip.y1 = min(clip.y1, b.y0 - 1)
            page.get_pixmap(dpi=DPI, clip=clip).save(fig_dir / f"{key}.png")
            # 그림 속 글자(「상태표시모드」 등)는 본문에서 빠지므로 여기 남겨야 검색에 걸린다
            words = [t for b, t, _ in lines if inside_of(r, b) and not re.fullmatch(r"\d+번", t)]
            note = f"(그림 설명: {caption[:120]}" + (f" · 그림 속 글자: {', '.join(words)}" if words else "") + ")"
            slots[at].append(f"[[그림:{key}]] {note}")
            manifest.append({"key": key, "page": no, "bbox": [round(v, 1) for v in r], "caption": caption})

        out += [f"## {heading} (PDF {no}쪽)", ""]
        if len(starts.get(no, [])) > 1:
            out += ["이 쪽에서 시작하는 절 : " + " · ".join(t for _, t, _ in starts[no]), ""]
        out += slots.get(-1, [])
        for j, (_, text, _) in enumerate(body):
            out.append(text)
            out += slots.get(j, [])
        out.append("")

    (out_dir / f"{pdf_path.stem}.md").write_text("\n".join(out), encoding="utf-8")
    (fig_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    return doc.page_count, len(manifest)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pdf", type=pathlib.Path)
    ap.add_argument("out", type=pathlib.Path)
    ap.add_argument("--prefix", required=True, help="그림 키 접두. 소문자·숫자·하이픈 (예 : tm)")
    a = ap.parse_args()
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", a.prefix):
        ap.error("--prefix 는 소문자·숫자·하이픈만 쓴다 - 서버가 그 밖의 키를 404 로 막는다")
    a.out.mkdir(parents=True, exist_ok=True)
    pages, figures = convert(a.pdf, a.out, a.prefix)
    print(f"{a.pdf.name} : {pages}쪽 · 그림 {figures}개 → {a.out}")
