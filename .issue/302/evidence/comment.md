## 작업 리포트 — README 재작성

브랜치 `docs/302-readme-rewrite` · README 64 → 169줄(구성 개편)

- 구성 : 무엇인지 · 주요 기능(사용자 · 관리자 · 운영) · 구조(+ 구성도) · 기술 스택 · 로컬 실행(mock / live, mvnw 와 compose 의 차이, prod 프로필) · 테스트와 CI(7잡 표 · 주간 스케줄) · 배포 개요 · 문서 안내
- 사실 대조 : 버전은 `package.json` · `pom.xml` · `.nvmrc` · Maven wrapper · Boot BOM, 기본값은 `application.yml`(동시 16/1 · 분당 20/30/5/10 · 모델 gpt-6-sol · CORS 5173), 허용 형식은 `FileService`, CI 는 `ci.yml`
- 고친 낡은 서술 : 「카메라 촬영」(#289 이후 OS 선택창) · 「기본 gpt-4o」 · 운영 서버 이름 노출
- **민감 정보 제외** : 서버 이름 · IP · SSH 별칭 · 백엔드 API 도메인 · 스토어/파일 ID · 계정 이메일 · 키 · 고객/업체명 grep 0건. 공개 데모 주소(Vercel)만 남김
- `check-doc-refs` · `check-doc-sections` · `check-doc-versions`(README 버전 주장 9건 포함) 통과
