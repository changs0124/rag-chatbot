# rag-chatbot

> OpenAI API(GPT-4o) + OpenAI 플랫폼 Store(VectorDB) 기반 RAG 챗봇. 출처를 항상 표기하고, 자료가 없으면 그 사실을 밝힌 뒤 추론함.

**유형** : 신규 · **규모** : 정식(1주~1개월) · **착수일** : 2026-07-24

이 저장소는 [[프로젝트 진행 가이드]](볼트 `10_Dev/Architecture`)의 0-A~8단계를 따라 진행함. 실행 규칙 요약과 게이트 상태는 `docs/00_계획.md`에 있음.

## 구조 (모노레포)

- `frontend/` - React + Vite + TypeScript. 반응형 웹(PC + 모바일 브라우저). Claude/GPT 류 채팅 UI
- `backend/` - Spring Boot + Java 17 + Maven(Wrapper) + MyBatis
- `docs/` - 계획 · 기술선택 · 운영 · PR 로그 · 런칭 문서

## 툴체인 (0-A에서 고정 · 확인일 2026-07-24)

| 도구 | 버전 | 고정 위치 |
|------|------|-----------|
| Node.js | 22.23.1 | `.nvmrc` (major 22) |
| npm | 10.9.8 | Node 동봉 |
| Java(JDK) | 17.0.19 LTS | `backend/pom.xml`의 `java.version` (백엔드 스캐폴딩 시) |
| Maven | Wrapper로 부트스트랩 | `backend/.mvn/wrapper/maven-wrapper.properties` (전역 `mvn` 미설치 대응) |
| Git | 2.54 | - |

> 전역 `mvn`이 설치되어 있지 않아 **Maven Wrapper(`mvnw`)** 로 Maven 버전을 저장소에 고정함. CI도 `mvnw`를 호출해 로컬과 버전이 갈리지 않게 함.

## 핵심 요구 (요약)

- 입력 4종 : 파일 첨부 · 카메라 촬영 · 사진 업로드 · 텍스트 질문
- 이미지는 GPT-4o 비전으로 전달 + 대화에 저장
- 사용자별 로그인(자체 이메일/비밀번호) + 마이페이지(이름 · 비밀번호 · 테마 변경)
- 사용자별 대화 저장/조회
- 답변에 항상 출처 표기. VectorDB에 없으면 "자료 없음 + 추론" 접두
- API KEY · VectorDB 미구축 → 인터페이스 완성 + 응답만 목업

## 현재 상태

- 0-A(저장소 개통) 진행 중. 상세 진행 로그는 `docs/00_계획.md`.
