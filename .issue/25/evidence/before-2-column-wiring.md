# before-2 : 컬럼 결선 교란 — 잡히지 않는다

## 교란
```diff
-		select d.id, d.filename, d.byte_size, d.status, u.name as uploaded_by_name, d.created_at
+		select d.id, d.filename, 0 as byte_size, 'in_progress' as status, u.name as uploaded_by_name, u.created_at
```

byteSize 는 항상 0, status 는 항상 리터럴, createdAt 은 **문서가 아니라 올린 사람의 가입 시각**.

## 결과 — 13개 전부 통과
```
2026-09-07T15:34:15.331+09:00  INFO 4860 --- [rag-chatbot-backend] [o-auto-1-exec-1] o.s.web.servlet.DispatcherServlet        : Initializing Servlet 'dispatcherServlet'
2026-09-07T15:34:15.332+09:00  INFO 4860 --- [rag-chatbot-backend] [o-auto-1-exec-1] o.s.web.servlet.DispatcherServlet        : Completed initialization in 1 ms
[INFO] Tests run: 13, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 11.09 s -- in com.ragchatbot.controller.AdminDocumentFlowTest
[INFO] 
[INFO] Results:
[INFO] 
[INFO] Tests run: 13, Failures: 0, Errors: 0, Skipped: 0
[INFO] 
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
```
