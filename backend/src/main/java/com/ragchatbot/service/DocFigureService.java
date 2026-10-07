package com.ragchatbot.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import com.ragchatbot.exception.ApiExceptions.NotFoundException;

/**
 * 답변 본문의 그림 표식 {@code [[그림:<key>]]} 이 가리키는 문서 그림(FEAT-CHAT-004).
 *
 * <p><b>DB 행이 없다</b> - 그림은 오프라인 전처리({@code scripts/doc-figures/preprocess.py})가 만들고 배포자가
 * 루트 디렉터리에 복사한다. 파일이 있으면 그림이 있는 것이다. 매니페스트는 읽지 않는다 - 읽으면 파일과
 * 매니페스트가 어긋나는 상태가 하나 더 생긴다.
 *
 * <p>루트가 비면 live 는 모든 키가 404 이고 mock 은 classpath 견본을 쓴다. 기동은 막지 않는다 -
 * 그림은 보조 정보라 빠져도 답변은 성립한다.
 */
@Service
public class DocFigureService {

	/**
	 * 키는 이 형식만 받는다. 경로 조각을 그대로 붙이지 않으므로 {@code ..} 같은 탈출은 여기서 끝난다.
	 * 형식 오류도 「없음」(404)으로 답한다 - 키 공간을 더듬어 볼 단서를 주지 않는다
	 */
	private static final Pattern KEY = Pattern.compile("[a-z0-9-]{1,64}");

	private static final String MOCK_ROOT = "mock-figures/";

	private final Path root;
	private final boolean mock;

	public DocFigureService(
			@Value("${app.doc-figures.dir:}") String dir,
			@Value("${app.mode:}") String mode) {
		this.root = dir == null || dir.isBlank() ? null : Path.of(dir).toAbsolutePath().normalize();
		this.mock = "mock".equals(mode);
	}

	public Resource load(String key) {
		if (key == null || !KEY.matcher(key).matches()) {
			throw new NotFoundException("그림 없음");
		}
		if (root != null) {
			Path file = root.resolve(key + ".png");
			if (Files.isRegularFile(file)) {
				return new FileSystemResource(file);
			}
		} else if (mock) {
			Resource sample = new ClassPathResource(MOCK_ROOT + key + ".png");
			if (sample.exists()) {
				return sample;
			}
		}
		throw new NotFoundException("그림 없음");
	}
}
