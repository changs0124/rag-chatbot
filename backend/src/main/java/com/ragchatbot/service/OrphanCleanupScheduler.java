package com.ragchatbot.service;

import java.time.OffsetDateTime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 고아 첨부 정기 회수(AC-13).
 *
 * <p>회수 로직은 있었지만 <b>부르는 곳이 없어</b> 실제로는 한 번도 돌지 않았음(2026-07-28 리뷰).
 * 대화 삭제 시 파일 정리가 실패하면 경고 로그만 남기고 이 회수에 의존하므로, 기동해 두지 않으면
 * 디스크에 남은 파일이 영영 회수되지 않음.
 */
@Component
public class OrphanCleanupScheduler {

	private static final Logger log = LoggerFactory.getLogger(OrphanCleanupScheduler.class);

	private final FileService fileService;
	private final long ttlMinutes;

	public OrphanCleanupScheduler(FileService fileService,
			@Value("${app.file.orphan-ttl-minutes:60}") long ttlMinutes) {
		this.fileService = fileService;
		this.ttlMinutes = ttlMinutes;
	}

	/** 기본 매시 정각. 실패해도 다음 주기가 다시 시도하므로 예외를 밖으로 내보내지 않음 */
	@Scheduled(cron = "${app.file.orphan-cleanup-cron:0 0 * * * *}")
	public void cleanup() {
		try {
			int removed = fileService.cleanupOrphans(OffsetDateTime.now().minusMinutes(ttlMinutes));
			if (removed > 0) {
				log.info("고아 첨부 {}건 회수(유예 {}분)", removed, ttlMinutes);
			}
		} catch (Exception e) {
			log.warn("고아 첨부 회수 실패 - 다음 주기에 재시도", e);
		}
	}
}
