package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.storage.FileStorage;

/**
 * 용량 검사는 <b>파일을 힙에 올리기 전에</b> 한다(#402).
 *
 * <p>멀티파트 파트는 디스크 임시 파일로 받아 두므로 크기는 {@code getSize()} 로 공짜로 알 수 있다.
 * {@code getBytes()} 뒤에 재면 26MB(멀티파트 하드 한도) 파일이 거절되기 전에 힙을 잡아, 사용자 한 명의
 * 동시 업로드(분당 상한 30)만으로 힙(약 650MB)을 넘길 수 있었다. 응답 문구(400, #35)는 그대로다.
 */
class FileServiceSizeCheckTest {

	@Test
	void over_limit_rejected_without_reading_into_heap() throws Exception {
		MultipartFile file = mock(MultipartFile.class);
		when(file.isEmpty()).thenReturn(false);
		when(file.getContentType()).thenReturn("image/png");
		when(file.getSize()).thenReturn(10L * 1024 * 1024 + 1);

		var service = new FileService(null, null, null, 500);

		assertThatThrownBy(() -> service.upload(UUID.randomUUID(), file))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("용량 초과(최대 10MB)");
		verify(file, never()).getBytes();
	}

	/** 저장 한도(#418)에 닿은 사용자의 업로드도 힙에 올리기 전에 거절한다 - 크기 선검사(#402)와 같은 원칙 */
	@Test
	void over_quota_rejected_without_reading_into_heap() throws Exception {
		MultipartFile file = mock(MultipartFile.class);
		when(file.isEmpty()).thenReturn(false);
		when(file.getContentType()).thenReturn("image/png");
		when(file.getSize()).thenReturn(1024L * 1024);
		FileStorage storage = mock(FileStorage.class);
		when(storage.usedBytes(any())).thenReturn(500L * 1024 * 1024);

		var service = new FileService(storage, null, null, 500);

		assertThatThrownBy(() -> service.upload(UUID.randomUUID(), file))
				.isInstanceOf(BadRequestException.class)
				.hasMessageStartingWith("첨부 저장 한도 초과");
		verify(file, never()).getBytes();
	}
}
