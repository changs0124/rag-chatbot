package com.ragchatbot.storage;

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
}
