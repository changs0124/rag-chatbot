# before-1 : <constructor> arg ìˆœì„œ êµí™˜ (status <-> uploaded_by_name)

## êµë€
```diff
@@ -26 +25,0 @@
-			<arg column="status" javaType="java.lang.String"/>
@@ -27,0 +27 @@
+			<arg column="status" javaType="java.lang.String"/>
```

## ê²°ê³¼ â€” ì´ë¯¸ ì‹¤íŒ¨í•œë‹¤
```
Expecting any element of:
  [{"byteSize"=22, "createdAt"="2026-09-07T06:33:24.96044Z", "filename"="Ãë¾÷±ÔÄ¢.pdf", "id"="ba784850-7255-4318-b1c7-ca6409ad918c", "status"="»ç¿ëÀÚ", "uploadedByName"="completed"},
    {"byteSize"=22, "createdAt"="2026-09-07T06:33:24.634527Z", "filename"="ÀÌ·Âº¸Á¸.pdf", "id"="e16beaad-a76d-47bd-afe4-9fb4a9764195", "status"="»ç¿ëÀÚ", "uploadedByName"="completed"}]
to satisfy the given assertions requirements but none did:

{"byteSize"=22, "createdAt"="2026-09-07T06:33:24.96044Z", "filename"="Ãë¾÷±ÔÄ¢.pdf", "id"="ba784850-7255-4318-b1c7-ca6409ad918c", "status"="»ç¿ëÀÚ", "uploadedByName"="completed"}
error: org.opentest4j.AssertionFailedError: 
expected: "»ç¿ëÀÚ"
 but was: "completed"
	at com.ragchatbot.controller.AdminDocumentFlowTest.lambda$admin_uploads_pdf_and_sees_it_in_list$0(AdminDocumentFlowTest.java:92)
	at com.ragchatbot.controller.AdminDocumentFlowTest.admin_uploads_pdf_and_sees_it_in_list(AdminDocumentFlowTest.java:89)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	...(76 remaining lines not displayed - this can be changed with Assertions.setMaxStackTraceElementsDisplayed)

{"byteSize"=22, "createdAt"="2026-09-07T06:33:24.634527Z", "filename"="ÀÌ·Âº¸Á¸.pdf", "id"="e16beaad-a76d-47bd-afe4-9fb4a9764195", "status"="»ç¿ëÀÚ", "uploadedByName"="completed"}
error: org.opentest4j.AssertionFailedError: 
expected: "Ãë¾÷±ÔÄ¢.pdf"
 but was: "ÀÌ·Âº¸Á¸.pdf"
	at com.ragchatbot.controller.AdminDocumentFlowTest.lambda$admin_uploads_pdf_and_sees_it_in_list$0(AdminDocumentFlowTest.java:90)
	at com.ragchatbot.controller.AdminDocumentFlowTest.admin_uploads_pdf_and_sees_it_in_list(AdminDocumentFlowTest.java:89)
	at java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke0(Native Method)
	...(76 remaining lines not displayed - this can be changed with Assertions.setMaxStackTraceElementsDisplayed)
[INFO] 
[ERROR] Tests run: 13, Failures: 1, Errors: 0, Skipped: 0
[INFO] 
[INFO] ------------------------------------------------------------------------
[INFO] BUILD FAILURE
```
