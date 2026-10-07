package com.ragchatbot.controller;

import java.util.concurrent.TimeUnit;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.ragchatbot.service.DocFigureService;

@RestController
@RequestMapping("/api/doc-figures")
public class DocFigureController {

	private final DocFigureService docFigureService;

	public DocFigureController(DocFigureService docFigureService) {
		this.docFigureService = docFigureService;
	}

	/**
	 * 문서 그림 서빙(인증 필요, API-GET-009). 첨부와 달리 서명 쿼리 토큰을 쓰지 않는다 -
	 * 프론트가 Bearer 로 fetch 해 Blob 으로 그린다. 그림은 재전처리 때만 바뀌므로 하루 캐시한다.
	 * 사용자 단위 권한은 없다 - 그림이 나온 공용 문서를 로그인한 모두가 검색하므로 볼 수 있는 범위가 같다
	 */
	@GetMapping("/{key}")
	public ResponseEntity<Resource> serve(@PathVariable String key) {
		return ResponseEntity.ok()
				.contentType(MediaType.IMAGE_PNG)
				.cacheControl(CacheControl.maxAge(1, TimeUnit.DAYS).cachePrivate())
				.body(docFigureService.load(key));
	}
}
