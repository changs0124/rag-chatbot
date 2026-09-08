"""surefire XML -> 읽히는 증거 텍스트. 콘솔 코드페이지(cp949)를 타지 않으려고 XML 을 원본으로 쓴다."""
import re, sys, xml.etree.ElementTree as ET

src, dst = sys.argv[1], sys.argv[2]
r = ET.parse(src).getroot()
out = ["$ ./mvnw -o test -Dtest=OpenAiRealBetaHeaderTest", "",
       "Test set: com.ragchatbot.openai.OpenAiRealBetaHeaderTest",
       "Tests run: %s, Failures: %s, Errors: %s, Skipped: %s"
       % (r.get('tests'), r.get('failures'), r.get('errors'), r.get('skipped')), ""]
for tc in r.iter('testcase'):
    f = tc.find('failure')
    out.append("[%s] %s" % ("FAILED" if f is not None else "PASSED", tc.get('name')))
    if f is not None:
        msg = (f.get('message') or '').strip()
        m = re.search(r'\[(.*)\]', msg, re.S)
        if m:
            items = re.split(r',\s+(?=POST |GET |DELETE )', m.group(1))
            msg = msg[:m.start()].rstrip() + "\n" + "\n".join("    - " + i.strip() for i in items)
        out.append("  " + msg.replace("\n", "\n  "))
    out.append("")
so = r.find('.//system-out')
if so is not None and (so.text or '').strip():
    out += ["나간 요청 (로컬 서버가 받은 것)", so.text.rstrip(), ""]
open(dst, 'w', encoding='utf-8').write("\n".join(out))
