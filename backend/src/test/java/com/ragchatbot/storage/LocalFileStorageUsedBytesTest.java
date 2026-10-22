package com.ragchatbot.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** 사용자 폴더의 일반 파일 크기 합(#418). 다른 사용자 폴더는 세지 않고, 폴더가 없으면 0 이다 */
class LocalFileStorageUsedBytesTest {

	@TempDir
	Path root;

	@Test
	void sums_only_that_users_files() {
		var storage = new LocalFileStorage(root.toString());
		UUID me = UUID.randomUUID();
		UUID other = UUID.randomUUID();
		storage.store(me, "png", new byte[100]);
		storage.store(me, "jpg", new byte[250]);
		storage.store(other, "png", new byte[1000]);

		assertThat(storage.usedBytes(me)).isEqualTo(350);
		assertThat(storage.usedBytes(other)).isEqualTo(1000);
	}

	@Test
	void missing_user_dir_is_zero() throws Exception {
		var storage = new LocalFileStorage(root.resolve("not-yet").toString());
		assertThat(storage.usedBytes(UUID.randomUUID())).isZero();

		Files.createDirectories(root.resolve("not-yet"));
		assertThat(storage.usedBytes(UUID.randomUUID())).isZero();
	}
}
