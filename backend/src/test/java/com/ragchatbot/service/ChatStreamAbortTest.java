package com.ragchatbot.service;

import static com.ragchatbot.service.ChatStreamTestSupport.chatService;
import static com.ragchatbot.service.ChatStreamTestSupport.prepared;
import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ragchatbot.service.ChatStreamTestSupport.ChatOnlyOpenAi;
import com.ragchatbot.service.ChatStreamTestSupport.RecordingPersistence;

/**
 * 중단 상태 정책(REQ-CHAT-006) - <b>사용자가 멈춘 것은 실패가 아님</b>.
 *
 * <p>서버가 중단을 {@code error}로 저장하지 않고, 프론트가 같은 상황을 {@code complete}로 표시하는 것과 맞춘다.
 * 화면과 재조회가 어긋나지 않는다는 점을 고정함.
 *
 * <p>SSE 전송 실패(= 클라이언트가 연결을 끊음)를 실제 오류와 구분하는 것이 핵심이라,
 * 전송이 깨지는 순간을 직접 만들 수 있도록 emitter 와 OpenAI 경계를 손으로 만든 대역으로 세움.
 */
class ChatStreamAbortTest {

	/** n번째 send 부터 IOException 을 던지는 emitter - 클라이언트가 사라진 상태를 재현함 */
	private static final class BrokenEmitter extends SseEmitter {
		private final int failFrom;
		private int sends;

		BrokenEmitter(int failFrom) {
			this.failFrom = failFrom;
		}

		@Override
		public void send(SseEventBuilder builder) throws IOException {
			if (++sends >= failFrom) {
				throw new IOException("broken pipe");
			}
		}
	}

	/** 토큰을 흘리다가 지시하면 예외를 던지는 OpenAI 대역 */
	private static final class StubOpenAi extends ChatOnlyOpenAi {
		private final List<String> tokens;
		private final RuntimeException failure;

		StubOpenAi(List<String> tokens, RuntimeException failure) {
			this.tokens = tokens;
			this.failure = failure;
		}

		@Override
		public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken,
				BiConsumer<Stage, List<String>> onStage) {
			for (String t : tokens) {
				onToken.accept(t);
			}
			if (failure != null) {
				throw failure;
			}
			return new ChatCompletion(String.join("", tokens), List.of(), true, 100, 20);
		}
	}

	@Test
	void client_disconnect_saves_partial_as_complete() {
		var persistence = new RecordingPersistence();
		// meta(1) → stage(2) → token(3)에서 끊김 : 첫 토큰이 화면에 닿은 뒤 사용자가 정지한 모양
		var service = chatService(new StubOpenAi(List.of("부분", "답변"), null), persistence);

		service.stream(UUID.randomUUID(), prepared(), new BrokenEmitter(4));

		assertThat(persistence.saves).hasSize(1);
		assertThat(persistence.saves.get(0).status()).isEqualTo("complete");
		assertThat(persistence.saves.get(0).content()).isEqualTo("부분");
		assertThat(persistence.retracted).isEmpty(); // 토큰을 보냈으면 질문은 그대로(#489)
		// 인용은 스트림 끝에 오므로 여기서는 늘 0건임 - stopped 를 남기지 않으면 화면이
		// "자료 없음"을 거짓으로 붙임
		assertThat(persistence.saves.get(0).stopped()).isTrue();
	}

	/**
	 * 받은 것이 없으면 빈 답변을 남기지 않음 - 프론트도 빈 버블을 지우므로 화면과 재조회가 같아짐.
	 * 질문도 걷는다(#489) - 서버는 끊긴 뒤 답을 만들지 않으므로 두면 답 없는 질문이 영구히 남는다
	 */
	@Test
	void client_disconnect_before_any_token_saves_nothing() {
		var persistence = new RecordingPersistence();
		var service = chatService(new StubOpenAi(List.of("답변"), null), persistence);
		var prepared = prepared();

		service.stream(UUID.randomUUID(), prepared, new BrokenEmitter(1)); // meta 부터 실패

		assertThat(persistence.saves).isEmpty();
		assertThat(persistence.retracted).containsExactly(prepared.userMessageId());
	}

	/** 구분이 핵심임 - 진짜 오류는 여전히 error 로 남아야 함 */
	@Test
	void upstream_failure_saves_partial_as_error() {
		var persistence = new RecordingPersistence();
		var service = chatService(
				new StubOpenAi(List.of("일부"), new IllegalStateException("upstream 5xx")), persistence);

		service.stream(UUID.randomUUID(), prepared(), new BrokenEmitter(Integer.MAX_VALUE));

		assertThat(persistence.saves).hasSize(1);
		assertThat(persistence.saves.get(0).status()).isEqualTo("error");
		assertThat(persistence.saves.get(0).content()).isEqualTo("일부");
		assertThat(persistence.saves.get(0).stopped()).isFalse(); // 오류는 중단이 아님
	}

	/**
	 * 응답 커밋이 깨진 모양(#515) - emitter 는 send 의 비 I/O 예외를 IllegalState 로 감싸고, complete 도 flush 에서
	 * 던진다. 그래도 비동기 요청은 끝나야 한다 - 안 끝내면 헤더 0바이트인 채 SSE 타임아웃(10분)까지 열려 있었다
	 */
	@Test
	void commit_failure_still_ends_the_request() {
		var persistence = new RecordingPersistence();
		var service = chatService(new StubOpenAi(List.of("답변"), null), persistence);
		var completeFailure = new IllegalStateException("flush", new NullPointerException("MimeHeaders.setValue"));
		var emitter = new SseEmitter() {
			Throwable endedWith;

			@Override
			public void send(SseEventBuilder builder) {
				throw new IllegalStateException("Failed to send", new NullPointerException("MimeHeaders.setValue"));
			}

			@Override
			public void complete() {
				throw completeFailure;
			}

			@Override
			public void completeWithError(Throwable ex) {
				endedWith = ex;
			}
		};

		service.stream(UUID.randomUUID(), prepared(), emitter);

		assertThat(emitter.endedWith).isSameAs(completeFailure);
	}

	/** 끊김과 서버 쪽 고장을 가르는 기준(#515) - 감싼 예외까지 끊김으로 보면 커밋 NPE 가 다시 숨는다 */
	@Test
	void disconnect_is_io_error_or_closed_emitter_only() {
		assertThat(ChatService.isDisconnect(new IOException("broken pipe"))).isTrue();
		assertThat(ChatService.isDisconnect(new IllegalStateException("ResponseBodyEmitter has already completed")))
				.isTrue();
		assertThat(ChatService.isDisconnect(new IllegalStateException("Failed to send", new NullPointerException())))
				.isFalse();
	}

	/** 정상 종료는 한 번만 저장함 - 저장 뒤 전송이 깨져도 같은 id 로 다시 넣지 않음 */
	@Test
	void disconnect_after_save_does_not_save_twice() {
		var persistence = new RecordingPersistence();
		// meta(1) stage(2) token(3) citations(4) 까지 보내고 done(5)에서 끊김 - 저장은 그 앞에서 끝남
		var service = chatService(new StubOpenAi(List.of("답변"), null), persistence);

		service.stream(UUID.randomUUID(), prepared(), new BrokenEmitter(5));

		assertThat(persistence.saves).hasSize(1);
		assertThat(persistence.saves.get(0).status()).isEqualTo("complete");
	}
}
