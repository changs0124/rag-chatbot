package com.ragchatbot.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import com.ragchatbot.openai.OpenAiService;
import com.ragchatbot.service.ChatService.PreparedChat;

/**
 * 서버 타임아웃이 저장에 흔적을 남기는지 (#84).
 *
 * <p><b>왜 필요한가</b> : emitter 가 타임아웃으로 닫히면 그 사실이 어디에도 남지 않았고, 같은
 * 타임아웃이 마지막 토큰의 타이밍에 따라 <b>세 갈래</b>로 갈렸다. 둘은 다른 사건을 사칭했다 —
 * ①은 「사용자가 정지 버튼을 누른 것」과, ②는 「정상 완료」와, ③은 「진짜 오류」와 구분되지 않았다.
 *
 * <p><b>플래그 없이는 이 셋을 테스트로 구분할 수 없다.</b> ①의 저장 모양은
 * {@code ChatStreamAbortTest.client_disconnect_saves_partial_as_complete} 와, ③은
 * {@code upstream_failure_saves_partial_as_error} 와, ②는
 * {@code disconnect_after_save_does_not_save_twice} 와 각각 <b>완전히 동일</b>했다.
 * 그래서 이 파일의 케이스는 전부 {@code timedOut} 을 함께 단언한다.
 *
 * <p>실제 톰캣을 띄우지 않는다. 검증 대상이 「타임아웃이 났을 때 무엇을 저장하는가」이지
 * 「스프링이 언제 타임아웃을 내는가」가 아니기 때문이다. 후자는 프레임워크의 몫이고, 실 톰캣에서
 * emitter 타임아웃이 발화한다는 것은 별도 통합 케이스가 본다.
 */
class ChatStreamTimeoutTest {

	/**
	 * 타임아웃을 손으로 낼 수 있는 emitter.
	 *
	 * <p>실물의 동작을 그대로 흉내낸다 — {@code ResponseBodyEmitter$DefaultCallback.run()} 이
	 * {@code complete=true} 를 세운 <b>뒤</b> 콜백을 돌리고, 그 뒤의 {@code send()} 는
	 * {@code Assert.state(!complete, ...)} 에 걸려 {@link IllegalStateException} 을 던진다.
	 * <b>이 순서가 핵심이다</b> — 그래서 서버는 타임아웃을 클라이언트에 알릴 수단이 없다.
	 */
	private static final class TimeoutableEmitter extends SseEmitter {
		private Runnable onTimeout;
		private boolean timedOut;
		private int sends;

		@Override
		public void onTimeout(Runnable callback) {
			this.onTimeout = callback;
		}

		/** 컨테이너 스레드가 하는 일 : 먼저 닫고, 그다음 콜백을 돌린다 */
		void fireTimeout() {
			timedOut = true;
			if (onTimeout != null) {
				onTimeout.run();
			}
		}

		@Override
		public void send(SseEventBuilder builder) throws IOException {
			sends++;
			if (timedOut) {
				throw new IllegalStateException("ResponseBodyEmitter has already completed");
			}
		}

		int sends() {
			return sends;
		}
	}

	/**
	 * 지정한 토큰 수를 흘린 뒤 훅을 한 번 돌리는 OpenAI 대역.
	 *
	 * <p>훅에서 타임아웃을 내면 「스트림 도중 타임아웃」(갈래 ①)이 되고, 토큰을 다 흘린 뒤에 내면
	 * 「워커가 대기 중 타임아웃 → 뒤늦게 완료」(갈래 ②)가 된다.
	 */
	private static final class HookedOpenAi implements OpenAiService {
		private final List<String> tokens;
		private final int hookAfterTokens;
		private final Runnable hook;
		private final RuntimeException failure;

		HookedOpenAi(List<String> tokens, int hookAfterTokens, Runnable hook, RuntimeException failure) {
			this.tokens = tokens;
			this.hookAfterTokens = hookAfterTokens;
			this.hook = hook;
			this.failure = failure;
		}

		@Override
		public String stageLabel(Stage stage, List<String> sources) {
			return stage.name();
		}

		@Override
		public ChatCompletion streamChat(ChatInput input, Consumer<String> onToken,
				BiConsumer<Stage, List<String>> onStage) {
			int sent = 0;
			for (String t : tokens) {
				if (sent == hookAfterTokens) {
					hook.run();
				}
				onToken.accept(t);
				sent++;
			}
			if (sent <= hookAfterTokens) {
				hook.run();
			}
			if (failure != null) {
				throw failure;
			}
			return new ChatCompletion(String.join("", tokens),
					List.of(new CitationData(1, "이용 정책 문서", "발췌", "corpus://policy")), false, 100, 20);
		}

		@Override
		public void deleteResources(String vectorStoreId, List<String> openaiFileIds) {
		}

		@Override
		public boolean hasSharedVectorStore() {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}

		@Override
		public UploadedDocument uploadDocument(String filename, byte[] content, String contentType) {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}

		@Override
		public String documentStatus(String vectorStoreId, String openaiFileId) {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}

		@Override
		public void deleteDocument(String vectorStoreId, String openaiFileId) {
			throw new UnsupportedOperationException("채팅 전용 대역");
		}
	}

	private record Saved(String content, String status, boolean stopped, boolean timedOut,
			List<OpenAiService.CitationData> citations, Integer inputTokens, Integer outputTokens) {
	}

	private static final class RecordingPersistence extends ChatPersistenceService {
		private final List<Saved> saves = new ArrayList<>();
		/** 첫 저장을 던지게 함 - 스트림 완주 뒤 저장 실패 경로를 만드는 데 씀(#97) */
		private int failFirst;

		RecordingPersistence() {
			super(null, null, null);
		}

		RecordingPersistence failingFirstSave() {
			this.failFirst = 1;
			return this;
		}

		@Override
		public void saveAssistant(UUID conversationId, UUID userId, UUID assistantMsgId, String content, String status,
				boolean stopped, boolean timedOut, List<OpenAiService.CitationData> citations, Integer inputTokens,
				Integer outputTokens) {
			if (failFirst > 0) {
				failFirst--;
				throw new IllegalStateException("DB 커넥션 끊김");
			}
			saves.add(new Saved(content, status, stopped, timedOut, citations, inputTokens, outputTokens));
		}
	}

	private static PreparedChat prepared() {
		return new PreparedChat(UUID.randomUUID(), "질문", List.of(), null, List.of());
	}

	private static ChatService chatService(OpenAiService openAi, ChatPersistenceService persistence) {
		return new ChatService(null, null, null, openAi, persistence, 6000);
	}

	/**
	 * 갈래 ① — 토큰이 흐르는 중 타임아웃.
	 *
	 * <p>다음 {@code send} 가 {@link IllegalStateException} 을 던지고 {@code sendQuietly} 가 그것을
	 * {@code ClientGoneException} 으로 승격해 <b>중단 분기</b>로 합류한다.
	 * {@code stopped=true} 는 그대로지만 {@code timedOut} 이 사용자 정지와 갈라 준다.
	 */
	@Test
	void timeout_while_streaming_is_marked_and_not_confused_with_user_stop() {
		var persistence = new RecordingPersistence();
		var emitter = new TimeoutableEmitter();
		var service = chatService(
				new HookedOpenAi(List.of("부분", "답변"), 1, emitter::fireTimeout, null), persistence);

		service.stream(UUID.randomUUID(), prepared(), emitter);

		assertThat(persistence.saves).hasSize(1);
		Saved saved = persistence.saves.get(0);
		assertThat(saved.status()).isEqualTo("complete");
		assertThat(saved.stopped()).isTrue();
		assertThat(saved.timedOut()).isTrue(); // ← 이것이 없으면 사용자 정지와 구분 불가
		assertThat(saved.content()).isEqualTo("부분"); // 타임아웃 뒤 토큰은 화면에 닿지 못했으므로 안 담김
	}

	/**
	 * 갈래 ② — 워커가 대기 중 타임아웃, 업스트림이 뒤늦게 정상 응답.
	 *
	 * <p>{@code send} 호출이 없어 예외가 안 나므로 <b>정상 저장 경로가 그대로 돈다</b> —
	 * 전문 · 인용 · 사용량이 전부 저장된다. 화면은 끊긴 채인데 새로고침하면 완전한 답변이 나타난다.
	 * {@code stopped=false} 라 「정상 완료」와 저장 모양이 같으므로 {@code timedOut} 만이 이를 가른다.
	 */
	@Test
	void timeout_before_completion_still_saves_full_text_but_marks_it() {
		var persistence = new RecordingPersistence();
		var emitter = new TimeoutableEmitter();
		// 토큰을 다 흘린 뒤 타임아웃 - 그 뒤로 send 가 없으므로 예외 없이 완료됨
		var service = chatService(
				new HookedOpenAi(List.of("완전한", "답변"), 2, emitter::fireTimeout, null), persistence);

		service.stream(UUID.randomUUID(), prepared(), emitter);

		assertThat(persistence.saves).hasSize(1);
		Saved saved = persistence.saves.get(0);
		assertThat(saved.status()).isEqualTo("complete");
		assertThat(saved.stopped()).isFalse(); // 잘리지 않았다 - 전문이다
		assertThat(saved.timedOut()).isTrue(); // ← 정상 완료와 구분하는 유일한 축
		assertThat(saved.content()).isEqualTo("완전한답변");
		// 손에 쥔 것을 버리지 않는다 - 인용과 사용량이 그대로 남아야 한다
		assertThat(saved.citations()).hasSize(1);
		assertThat(saved.inputTokens()).isEqualTo(100);
		assertThat(saved.outputTokens()).isEqualTo(20);
	}

	/**
	 * 갈래 ③ — 타임아웃 뒤 업스트림이 끝내 무응답(읽기 타임아웃).
	 *
	 * <p>{@code error} 로 저장되는데, 이는 <b>진짜 오류와 저장 모양이 같다</b>.
	 */
	@Test
	void timeout_then_upstream_failure_is_marked_error_but_distinguishable() {
		var persistence = new RecordingPersistence();
		var emitter = new TimeoutableEmitter();
		var service = chatService(
				new HookedOpenAi(List.of("일부"), 1, emitter::fireTimeout,
						new IllegalStateException("OpenAI 스트림 읽기 오류")),
				persistence);

		service.stream(UUID.randomUUID(), prepared(), emitter);

		assertThat(persistence.saves).hasSize(1);
		Saved saved = persistence.saves.get(0);
		assertThat(saved.status()).isEqualTo("error");
		assertThat(saved.stopped()).isFalse();
		assertThat(saved.timedOut()).isTrue(); // ← 진짜 오류와 구분하는 유일한 축
	}

	/**
	 * 스트림이 완주한 뒤 저장이 실패하면 <b>손에 쥔 인용과 사용량을 재시도가 그대로 싣는다</b>(#97).
	 *
	 * <p>첫 저장이 던지면 {@code @Transactional} 이라 롤백되고 같은 id 로 재시도가 돈다. 종전에는 그
	 * 재시도가 {@code List.of(), null, null} 을 고정으로 넘겨 <b>알고 있는 값을 버렸다</b> - 재조회하면
	 * 본문에는 각주 [1][2] 가 남았는데 출처 목록만 비어 있었고 사용량 합계도 조용히 낮아졌다.
	 * 「모르면 null」(FEAT-OPS-001)의 취지와 정반대다.
	 */
	@Test
	void save_failure_after_full_stream_keeps_citations_and_usage() {
		var persistence = new RecordingPersistence().failingFirstSave();
		var emitter = new TimeoutableEmitter();
		var service = chatService(
				new HookedOpenAi(List.of("완전한", "답변"), Integer.MAX_VALUE, () -> {
				}, null), persistence);

		service.stream(UUID.randomUUID(), prepared(), emitter);

		assertThat(persistence.saves).hasSize(1); // 첫 시도는 던졌으므로 기록이 없다
		Saved saved = persistence.saves.get(0);
		assertThat(saved.status()).isEqualTo("error"); // 저장이 실제로 실패했고 화면에도 오류가 나갔다
		assertThat(saved.content()).isEqualTo("완전한답변");
		assertThat(saved.citations()).hasSize(1);
		assertThat(saved.inputTokens()).isEqualTo(100);
		assertThat(saved.outputTokens()).isEqualTo(20);
	}

	/**
	 * 반대편 — <b>중단 경로는 정말로 모르므로</b> 비운다.
	 *
	 * <p>이 케이스가 없으면 「무조건 completion 을 싣는 구현」이 위 케이스를 통과한다. 중단은 인용이
	 * 도착하기 전에 끝나므로 지어내면 거짓이 된다.
	 */
	@Test
	void aborted_stream_still_saves_empty_citations_and_null_usage() {
		var persistence = new RecordingPersistence();
		var emitter = new TimeoutableEmitter();
		var service = chatService(
				new HookedOpenAi(List.of("부분", "답변"), 1, emitter::fireTimeout, null), persistence);

		service.stream(UUID.randomUUID(), prepared(), emitter);

		Saved saved = persistence.saves.get(0);
		assertThat(saved.citations()).isEmpty();
		assertThat(saved.inputTokens()).isNull();
		assertThat(saved.outputTokens()).isNull();
	}

	/**
	 * 반대편 — 타임아웃이 없으면 플래그도 서지 않는다.
	 *
	 * <p>이 케이스가 없으면 「무조건 {@code true} 를 넣는 구현」이 위 셋을 전부 통과한다.
	 */
	@Test
	void normal_completion_is_not_marked_timed_out() {
		var persistence = new RecordingPersistence();
		var emitter = new TimeoutableEmitter();
		var service = chatService(
				new HookedOpenAi(List.of("정상", "답변"), Integer.MAX_VALUE, () -> {
				}, null), persistence);

		service.stream(UUID.randomUUID(), prepared(), emitter);

		assertThat(persistence.saves).hasSize(1);
		assertThat(persistence.saves.get(0).timedOut()).isFalse();
		assertThat(persistence.saves.get(0).stopped()).isFalse();
		assertThat(persistence.saves.get(0).status()).isEqualTo("complete");
		// done 까지 정상 전송됨 : meta · stage · token×2 · citations · done
		assertThat(emitter.sends()).isEqualTo(6);
	}
}
