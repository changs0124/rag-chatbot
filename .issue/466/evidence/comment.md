## 작업 요약

`backend/pom.xml` 7행 주석 : 「3.5 는 OSS 지원이 2026-06-30 에 끝나 올렸다(#48).」 → 「3.5 의 OSS 지원이 2026-06-30 에 끝나 **4.1 로** 올렸다(#48).」
- 8행(4.0 이 아니라 4.1 인 이유)과 #48 인용은 그대로 뒀다

## 완료 기준

- [x] pom.xml 주석 한 줄만 바뀜(`backend/pom.xml | 2 +-`)
- [x] `./mvnw -q -DskipTests compile` 통과
- [x] CHANGELOG 반영 — #465 가 `[Unreleased]` 를 배포 구획으로 옮기므로, #465 merge 뒤 새 `[Unreleased]` 로 옮겨 적는다

원본 기록 : [전](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/466/evidence/before/pom-comment.txt) · [후](https://raw.githubusercontent.com/changs0124/rag-chatbot/main/.issue/466/evidence/after/pom-comment.txt)

주석만 바꿨다. 빌드 결과와 운영은 같고, 배포도 필요 없다. 커밋 `0e3ec15` · 브랜치 `chore/466-pom-boot-comment`
