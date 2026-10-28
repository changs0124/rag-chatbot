"""매퍼 XML 의 문장마다 <include> 를 펼치고 공백을 정규화해 'ns.id<TAB>SQL' 로 출력한다. 사용 : python sqldump.py <mapper 폴더>"""
import sys, glob, os, re, copy
import xml.etree.ElementTree as ET
STMT = {"select", "insert", "update", "delete"}
def render(el, sqls):
    out = [el.text or ""]
    for c in el:
        if c.tag == "include":
            out.append(render(sqls[c.get("refid")], sqls))
        else:
            attrs = " ".join(f'{k}="{v}"' for k, v in sorted(c.attrib.items()))
            out.append(f"<{c.tag} {attrs}>" + render(c, sqls) + f"</{c.tag}>")
        out.append(c.tail or "")
    return "".join(out)
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*.xml"))):
    root = ET.parse(f).getroot()
    ns = root.get("namespace").rsplit(".", 1)[-1]
    sqls = {s.get("id"): s for s in root if s.tag == "sql"}
    for s in root:
        if s.tag in STMT:
            attrs = " ".join(f'{k}="{v}"' for k, v in sorted(s.attrib.items()) if k != "id")
            sql = re.sub(r"\s+", " ", render(s, sqls)).strip()
            sql = re.sub(r"\s*,\s*", ", ", sql)
            print(f"{ns}.{s.get('id')}\t[{s.tag} {attrs}]\t{sql}")
