-- 2026-10-06 스토어 동기화 (#193 · FEAT-ADMIN-002)
-- P-4 : 스키마의 소유자는 마이그레이션 SQL
--
-- 동기화는 「살아 있는 행이 없는 스토어 파일」만 넣는다. 서비스가 먼저 조회하고 넣는 것만으로는
-- 동시에 두 번 실행될 때 같은 파일이 두 행이 될 수 있어, 그 불변식을 스키마가 지킨다.
-- **지운 행(deleted_at not null)은 제외한다** - 삭제 이력이고, 같은 파일이 스토어에 남아 있으면
-- 동기화가 새 행으로 다시 등록하기 때문이다(검색에 잡히는 문서는 목록에 보여야 다시 지울 수 있다)
create unique index if not exists uq_rag_documents_alive_file
    on rag_documents (openai_file_id)
    where deleted_at is null;
