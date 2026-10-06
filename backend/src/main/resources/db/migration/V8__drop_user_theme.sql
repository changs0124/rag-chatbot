-- 2026-10-06 테마 전환 제거 (#191)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL
--
-- 화면이 라이트 하나가 되어(회사 홈페이지가 테마를 걷은 것에 맞춤) 계정별로 저장할 테마가 없다.
-- 컬럼을 남겨 두면 읽는 코드가 없는 값이 쌓이고, check 제약(light|dark|system)이 없는 기능을 문서처럼 말한다.
--
-- if exists : 운영 VM DB 는 V1~V7 로 이미 만들어져 있다. 같은 파일이 빈 DB 와 기존 DB 양쪽에서 돌아야 한다
alter table users drop column if exists theme;
