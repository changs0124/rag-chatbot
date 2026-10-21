-- 2026-10-21 쓰지 않는 대화별 OpenAI 정리 경로의 스키마 잔재 제거 (#391)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL
--
-- conversations.vector_store_id · attachments.openai_file_id 는 삽입 때 null 로만 쓰이고 갱신하는 문이 없었다.
-- 이 둘을 읽던 대화 삭제 시 OpenAI 정리(deleteResources)는 늘 (null, []) 로 불려 한 번도 돈 적이 없다(#124).
-- citations.uri 는 매퍼가 읽지도 쓰지도 않는다. 운영 DB 에도 세 컬럼에 든 값이 없다(null 또는 빈 문자열뿐).
-- 첨부는 이미지 전용이라 file_type 의 'document' 는 들어온 적이 없다 - check 를 'image' 하나로 좁힌다.
-- rag_documents 의 같은 이름 컬럼은 관리자 문서용으로 살아 있어 건드리지 않는다.
--
-- if exists : 운영 VM DB 는 V1~V9 로 이미 만들어져 있다. 같은 파일이 빈 DB 와 기존 DB 양쪽에서 돌아야 한다
alter table conversations drop column if exists vector_store_id;
alter table attachments drop column if exists openai_file_id;
alter table citations drop column if exists uri;

alter table attachments drop constraint if exists attachments_file_type_check;
alter table attachments add constraint attachments_file_type_check check (file_type = 'image');
