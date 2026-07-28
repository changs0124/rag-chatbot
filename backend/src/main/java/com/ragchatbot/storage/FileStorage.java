package com.ragchatbot.storage;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.core.io.Resource;

/**
 * 파일 저장 경계(P-7). 로컬 디스크 구현이 기본이며 S3 등으로 교체 가능.
 * 경로는 서버가 소유하고 소유권 검증 후에만 서빙함.
 */
public interface FileStorage {

	/** 저장 후 상대 저장 경로를 반환(예: {userId}/{uuid}.jpg) */
	String store(UUID userId, String extension, byte[] content);

	Resource load(String storagePath);

	void delete(String storagePath);

	/**
	 * 저장소에 실재하는 파일 전부(상대 경로 + 최종 수정 시각).
	 *
	 * <p>DB 행이 사라진 뒤 남은 파일은 행 기준 회수({@code findOrphans})가 볼 수 없어, 저장소 쪽에서
	 * 훑어야만 찾힘(2026-07-28 결정). 수정 시각은 <b>작성 중인 파일을 지우지 않기 위한 유예 판정용</b>임.
	 */
	List<StoredFile> listAll();

	record StoredFile(String storagePath, Instant lastModified) {
	}
}
