package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.ragchatbot.exception.ApiExceptions.NotFoundException;

/** 루트 디렉터리 · 모드 분기(FEAT-CHAT-004). 통합 경로는 DocFigureFlowTest */
class DocFigureServiceTest {

	@TempDir
	Path dir;

	@Test
	void serves_png_from_root() throws Exception {
		Files.write(dir.resolve("tm-p061-f1.png"), new byte[] { 1, 2, 3 });
		var res = new DocFigureService(dir.toString(), "live").load("tm-p061-f1");
		assertThat(res.getContentAsByteArray()).containsExactly(1, 2, 3);
	}

	@Test
	void root_wins_over_mock_sample() {
		// 루트를 줬으면 목업이어도 견본으로 새지 않는다 - 로컬에서 실제 그림으로 확인할 때 견본이 섞이면 안 된다
		assertThatThrownBy(() -> new DocFigureService(dir.toString(), "mock").load("mock-sample"))
				.isInstanceOf(NotFoundException.class);
	}

	@Test
	void live_without_root_has_no_figures() {
		assertThatThrownBy(() -> new DocFigureService("", "live").load("mock-sample"))
				.isInstanceOf(NotFoundException.class);
	}

	@Test
	void traversal_key_never_reaches_filesystem() throws Exception {
		Path inner = Files.createDirectory(dir.resolve("figs"));
		Files.write(dir.resolve("secret.png"), new byte[] { 9 });
		var service = new DocFigureService(inner.toString(), "live");
		assertThatThrownBy(() -> service.load("../secret")).isInstanceOf(NotFoundException.class);
		assertThatThrownBy(() -> service.load("..")).isInstanceOf(NotFoundException.class);
	}

	@Test
	void directory_named_like_key_is_not_a_figure() throws Exception {
		Files.createDirectory(dir.resolve("tm-p001-f1.png"));
		assertThatThrownBy(() -> new DocFigureService(dir.toString(), "live").load("tm-p001-f1"))
				.isInstanceOf(NotFoundException.class);
	}
}
