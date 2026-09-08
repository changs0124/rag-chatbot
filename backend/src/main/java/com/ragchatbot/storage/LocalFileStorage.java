package com.ragchatbot.storage;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/**
 * 로컬/서버 디스크 저장 구현. 루트는 app.file.storage-root.
 * 경로 탈출(../)을 막고 루트 하위로만 접근하도록 정규화 검사함.
 */
@Component
public class LocalFileStorage implements FileStorage {

	private final Path root;

	public LocalFileStorage(@Value("${app.file.storage-root:./uploads}") String storageRoot) {
		this.root = Path.of(storageRoot).toAbsolutePath().normalize();
	}

	@Override
	public String store(UUID userId, String extension, byte[] content) {
		String relative = userId + "/" + UUID.randomUUID() + "." + extension;
		Path target = resolve(relative);
		try {
			Files.createDirectories(target.getParent());
			Files.write(target, content);
		} catch (IOException e) {
			throw new IllegalStateException("파일 저장 실패: " + relative, e);
		}
		return relative;
	}

	@Override
	public Resource load(String storagePath) {
		return new FileSystemResource(resolve(storagePath));
	}

	@Override
	public void delete(String storagePath) {
		try {
			Files.deleteIfExists(resolve(storagePath));
		} catch (IOException e) {
			throw new IllegalStateException("파일 삭제 실패: " + storagePath, e);
		}
	}

	@Override
	public List<StoredFile> listAll() {
		if (!Files.isDirectory(root)) {
			return List.of(); // 아직 업로드가 한 건도 없으면 루트가 없음 - 빈 저장소로 봄
		}
		try (Stream<Path> walk = Files.walk(root)) {
			return walk.filter(Files::isRegularFile)
					.map(p -> new StoredFile(
							root.relativize(p).toString().replace('\\', '/'), // 저장 경로는 항상 슬래시 표기
							lastModified(p)))
					.toList();
		} catch (IOException e) {
			throw new IllegalStateException("저장소 목록 조회 실패", e);
		}
	}

	private static Instant lastModified(Path p) {
		try {
			return Files.getLastModifiedTime(p).toInstant();
		} catch (IOException e) {
			// 시각을 못 읽으면 "방금 만들어진 것"으로 취급해 유예에 걸리게 함 - 지우는 쪽으로 기울지 않음
			return Instant.now();
		}
	}

	/** 루트 하위로만 해석. 경로 탈출 차단 */
	private Path resolve(String relative) {
		Path resolved = root.resolve(relative).normalize();
		if (!resolved.startsWith(root)) {
			throw new IllegalArgumentException("저장 루트를 벗어난 경로: " + relative);
		}
		return resolved;
	}
}
