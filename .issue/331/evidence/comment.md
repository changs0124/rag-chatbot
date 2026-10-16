## 작업 요약

스크립트 · CI 결함 넷을 고치고(커밋 1), 중복과 안 쓰는 설정을 걷었다(커밋 2). 리뷰 후속 정리는 커밋 3.

**결함**
- **I1** CI · `check-all.sh` 의 프론트 테스트가 JSON 리포터만 써서, 실패해도 로그에 「JSON report written」 한 줄만 남았다. 이제 `--reporter=default --reporter=json --outputFile.json=…` 로 화면 출력과 하한 검사용 JSON 을 함께 남긴다
- **I2** `check-doc-sections.sh` 의 실패 힌트가 `paste -sd' · '` 로 2바이트 `·` 를 쪼개 깨졌다. `awk` 로 바꿨다
- **I3** 서버에 `.env` · `backend/.env` 가 없으면 `deploy.sh` 가 경고만 하고 빌드 · 전송 · `:previous` 재태깅까지 간 뒤 `compose up` 에서 죽었다. 그 상태에서 다시 돌리면, 한 번도 돌지 않은 이미지가 `:previous` 를 덮어써 롤백 이미지를 잃는다. 이제 사전 확인에서 exit 3 으로 멈춘다
- **I6** 클레임 전처리가 고장일이 비거나 문자인 호기에서 `ValueError` · `TypeError` 로 죽을 수 있었다. 날짜인 행만 재발 표에 넣고, 뺀 클레임이 있으면 표 머리에 한 줄로 밝힌다

**정리**
- I4 `deps-frontend` 의 불필요한 `npm ci` 제거
- I13 `setup-node` 가 `.nvmrc` 를 읽는다
- I7 · I8 전처리 중복 계산 제거
- I9 · I10 쓰이지 않는 `DOC_PATHS` · `M2_REPO` · `grep` 가드 제거
- I11 `.gitignore` 중복 3줄 제거
- I12 `deploy.sh` 의 `PREV` 변수 하나로
- I14 NBSP 리터럴을 ` ` 로

## 검증

| 항목 | 전 | 후 |
| --- | --- | --- |
| I1 실패 테스트 로그 | JSON 한 줄 | **파일:줄 · diff · 요약 출력**, JSON 도 같은 경로에 생성 |
| I2 실패 힌트 | `iconv` 실패(깨진 UTF-8) | **`a · b · c`, `iconv` exit 0** |
| I3 `.env` 없음(가짜 ssh · docker 로 모의, 서버 접속 없음) | 빌드 · 전송 · 재태깅 후 실패 | **사전 확인 exit 3, 빌드 0 · 재태깅 0** |
| I6 합성 xlsx(가짜 값만) | `ValueError` · `TypeError` | **exit 0**, 뺀 클레임 한 줄 표시 |
| 실데이터 전처리 산출물 | — | 운영 스토어판과 **바이트 동일**(`cmp`) |
| I4 패키지 파일만으로 `npm audit` | — | exit 0, 설치 없음 |
| `check-all.sh` 전체 · `quick` · `docs`(shellcheck 0.11.0 포함) | — | 통과 |

- `.gitignore` 정리 뒤에도 `git check-ignore -v` 로 uploads · `*-secret*` 이 계속 무시됨을 확인했다
- 리뷰 : APPROVE. 제안을 반영했다
  - CHANGELOG 의 NBSP 원문자를 ` ` 로
  - 뺀 클레임 표시 줄
  - CI 스텝 이름 `Set up Node (.nvmrc)`
- 원본 : `.issue/331/evidence/`

## 남은 이슈

- 리뷰 제안(이번 범위 밖) : `.env` 누락 말고 다른 실패(compose 오류 · 헬스 실패) 뒤에 다시 돌려도 `:previous` 를 덮어쓸 수 있다. 후속 이슈 후보로 둔다
