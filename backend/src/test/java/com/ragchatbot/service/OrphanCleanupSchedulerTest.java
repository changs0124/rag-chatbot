package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.OffsetDateTime;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * 고아 회수 스케줄러. 통합 테스트는 크론을 꺼 두므로(AbstractPgIntegrationTest) 스케줄러의 계약은
 * 여기서 결정적으로 검증함 - 정각을 기다리는 검증은 실행 시각에 따라 결과가 갈려 게이트가 되지 못함.
 */
class OrphanCleanupSchedulerTest {

	@Test
	void runs_both_passes() {
		FileService fileService = mock(FileService.class);
		when(fileService.cleanupOrphans(any())).thenReturn(1);
		when(fileService.cleanupUnreferencedFiles(any())).thenReturn(2);

		new OrphanCleanupScheduler(fileService, 60).cleanup();

		verify(fileService).cleanupOrphans(any());
		verify(fileService).cleanupUnreferencedFiles(any());
	}

	/**
	 * 두 패스는 <b>서로 다른 잔류</b>를 지움 - 1차(행 기준)가 실패했다고 2차(저장소 스캔)를 건너뛰면
	 * 행이 사라진 뒤 남은 파일이 영영 회수되지 않음.
	 */
	@Test
	void second_pass_runs_even_if_first_fails() {
		FileService fileService = mock(FileService.class);
		when(fileService.cleanupOrphans(any())).thenThrow(new IllegalStateException("1차 실패"));

		assertThatCode(() -> new OrphanCleanupScheduler(fileService, 60).cleanup())
				.doesNotThrowAnyException(); // 예외가 새면 다음 주기까지 스케줄러가 죽음

		verify(fileService).cleanupUnreferencedFiles(any());
	}

	/**
	 * cutoff 는 "지금부터 ttl 분 전"이어야 함 - 미래나 현재를 넘기면 작성 중인 첨부가 회수 대상이 됨.
	 *
	 * <p>호출 <b>전후로 시각을 재서 그 구간 안</b>인지만 봄. 스케줄러가 자기 {@code now()} 를 따로
	 * 부르므로 한쪽 기준으로 등호를 걸면 두 {@code now()} 가 나노초까지 같을 때만 통과함 -
	 * 시계 해상도가 거친 OS 에서는 우연히 통과하고 해상도가 높은 OS 에서는 늘 실패한다.
	 */
	@Test
	void cutoff_is_ttl_minutes_ago() {
		FileService fileService = mock(FileService.class);
		OffsetDateTime before = OffsetDateTime.now();

		new OrphanCleanupScheduler(fileService, 60).cleanup();

		OffsetDateTime after = OffsetDateTime.now();
		ArgumentCaptor<OffsetDateTime> cutoff = ArgumentCaptor.forClass(OffsetDateTime.class);
		verify(fileService).cleanupOrphans(cutoff.capture());
		assertThat(cutoff.getValue()).isBetween(before.minusMinutes(60), after.minusMinutes(60));
	}
}
