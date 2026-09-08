"""surefire XML -> 읽히는 증거 텍스트. 콘솔 코드페이지(cp949)를 타지 않으려고 XML 을 원본으로 쓴다."""
import sys, xml.etree.ElementTree as ET, io
src, dst = sys.argv[1], sys.argv[2]
r = ET.parse(src).getroot()
out = ["$ ./mvnw -o test -Dtest=AdminDocumentUploadCompensationTest", "",
       "Test set: com.ragchatbot.service.AdminDocumentUploadCompensationTest",
       "Tests run: %s, Failures: %s, Errors: %s, Skipped: %s"
       % (r.get('tests'), r.get('failures'), r.get('errors'), r.get('skipped')), ""]
for tc in r.iter('testcase'):
    f = tc.find('failure')
    out.append("[%s] %s" % ("FAILED" if f is not None else "PASSED", tc.get('name')))
    if f is not None:
        msg = (f.get('message') or f.get('type') or '').strip()
        body = (f.text or '').strip().splitlines()
        detail = "\n".join("    " + l for l in body[:12])
        out.append("  " + (msg if msg else "(메시지 없음)"))
        if detail:
            out.append(detail)
    out.append("")
io.open(dst, 'w', encoding='utf-8').write("\n".join(out))
