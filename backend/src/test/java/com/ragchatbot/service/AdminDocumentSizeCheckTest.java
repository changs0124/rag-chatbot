package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.web.multipart.MultipartFile;

import com.ragchatbot.exception.ApiExceptions.BadRequestException;
import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.repository.RagDocumentRepository;

/**
 * 관리자 문서 업로드도 용량 검사를 <b>파일을 힙에 올리기 전에</b> 한다(#453, {@code FileService} 의 #402 와 같은 원칙).
 * 변경 전에는 {@code getBytes()} 로 다 읽은 뒤에 25MB 를 비교해, 멀티파트 한도(26MB)까지의 파일이 거절되기 전에 힙을 잡았다.
 */
class AdminDocumentSizeCheckTest {

	@Test
	void over_limit_rejected_without_reading_into_heap() throws Exception {
		OpenAiService openAi = mock(OpenAiService.class);
		when(openAi.hasSharedVectorStore()).thenReturn(true);
		MultipartFile file = mock(MultipartFile.class);
		when(file.isEmpty()).thenReturn(false);
		when(file.getOriginalFilename()).thenReturn("규정.pdf");
		when(file.getContentType()).thenReturn("application/pdf");
		when(file.getSize()).thenReturn(25L * 1024 * 1024 + 1);

		var service = new AdminDocumentService(mock(RagDocumentRepository.class), openAi);

		assertThatThrownBy(() -> service.upload(UUID.randomUUID(), file))
				.isInstanceOf(BadRequestException.class)
				.hasMessage("용량 초과(최대 25MB)");
		verify(file, never()).getBytes();
	}
}
