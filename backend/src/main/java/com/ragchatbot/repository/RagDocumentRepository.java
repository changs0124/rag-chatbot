package com.ragchatbot.repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.ragchatbot.entity.RagDocument;
import com.ragchatbot.dto.AdminDtos.DocumentResponse;

/**
 * RAG 문서 매퍼(FEAT-ADMIN-002). SQL은 mapper/RagDocumentRepository.xml.
 *
 * <p>소유권 개념이 없다 - 문서는 공용 Vector Store 의 것이고 관리자면 누구나 다룬다.
 * 권한 검사는 서비스 계층이 한다.
 */
@Mapper
public interface RagDocumentRepository {

	void insert(RagDocument document);

	/**
	 * 살아 있는 문서만 최신순. 지워진 것(deleted_at not null)은 목록에 넣지 않음.
	 *
	 * <p>올린 사람 이름을 <b>조인으로 함께</b> 가져옴 - 문서마다 따로 조회하면 N+1 이 됨
	 */
	List<DocumentResponse> listAlive();

	/** 아직 인덱싱 중인 문서의 id. 이 행만 OpenAI 에 상태를 다시 물음(완료·실패는 더 바뀌지 않음) */
	List<UUID> findInProgressIds();

	/** 살아 있는 것만 찾음 - 이미 지운 문서를 또 지우려는 요청은 404 로 귀결되어야 함 */
	Optional<RagDocument> findAliveById(UUID id);

	/** 인덱싱 상태 갱신. in_progress 인 행만 다시 물어보므로 그 행만 대상 */
	int updateStatus(@Param("id") UUID id, @Param("status") String status);

	/** 소프트 삭제. 시각은 호출자가 넘김 - 다른 시각 기록과 같은 시계를 쓰게 함 */
	int softDelete(@Param("id") UUID id, @Param("deletedAt") OffsetDateTime deletedAt);
}
