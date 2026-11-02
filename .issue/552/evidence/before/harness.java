package com.ragchatbot.openai;

import java.io.InputStream;
import java.io.OutputStream;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;

import com.ragchatbot.openai.OpenAiService.AttachmentRef;
import com.ragchatbot.openai.OpenAiService.ChatInput;
import com.ragchatbot.storage.FileStorage;
import com.sun.net.httpserver.HttpServer;

/**
 * #552 측정 하네스(커밋하지 않음). N 개 동시 스트림이 각각 10MB x 5장을 보내고, 가짜 서버가 첫 토큰을 흘린 뒤
 * 스트림을 열어 둔 상태에서 GC 후 힙 사용량을 잰다. -Dn=N -Dmb=10 -Dimages=5
 */
class AttachmentHeapMeasureHarness {

	@Test
	void measure() throws Exception {
		int n = Integer.getInteger("n", 4);
		int mb = Integer.getInteger("mb", 10);
		int images = Integer.getInteger("images", 5);
		byte[] image = new byte[mb * 1024 * 1024];
		new Random(552).nextBytes(image);

		FileStorage storage = new FileStorage() {
			public String store(UUID u, String e, byte[] c) { throw new UnsupportedOperationException(); }
			public Resource load(String p) { return new ByteArrayResource(image); }
			public void delete(String p) { }
			public List<StoredFile> listAll() { return List.of(); }
			public long usedBytes(UUID u) { return 0; }
		};

		CountDownLatch allStreaming = new CountDownLatch(n);
		CountDownLatch releaseServer = new CountDownLatch(1);
		AtomicLong requestBytes = new AtomicLong();
		HttpServer server = HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/responses", ex -> {
			long count = 0;
			byte[] buf = new byte[64 * 1024];
			try (InputStream in = ex.getRequestBody()) {
				for (int r; (r = in.read(buf)) > 0;) {
					count += r;
				}
			}
			requestBytes.compareAndSet(0, count);
			System.out.println("REQ-HEADERS CL=" + ex.getRequestHeaders().getFirst("Content-Length") + " TE=" + ex.getRequestHeaders().getFirst("Transfer-encoding"));
			ex.getResponseHeaders().add("Content-Type", "text/event-stream");
			ex.sendResponseHeaders(200, 0);
			try (OutputStream out = ex.getResponseBody()) {
				out.write("data:{\"type\":\"response.output_text.delta\",\"delta\":\"a\"}\n\n".getBytes(StandardCharsets.UTF_8));
				out.flush();
				releaseServer.await(120, TimeUnit.SECONDS);
				out.write("data:{\"type\":\"response.completed\",\"response\":{\"output\":[]}}\n\n".getBytes(StandardCharsets.UTF_8));
				out.flush();
			} catch (InterruptedException e) {
				Thread.currentThread().interrupt();
			}
		});
		server.setExecutor(Executors.newFixedThreadPool(n + 2));
		server.start();

		var service = new OpenAiRealService("k", "m", "", OpenAiRealTestSupport.baseUrl(server), 540_000, 30_000,
				600_000, storage);
		List<AttachmentRef> refs = new ArrayList<>();
		for (int i = 0; i < images; i++) {
			refs.add(new AttachmentRef("p" + i, "image/png"));
		}

		var mem = ManagementFactory.getMemoryMXBean();
		long baseline = settledUsed();
		long max = Runtime.getRuntime().maxMemory();
		ExecutorService pool = Executors.newFixedThreadPool(n);
		List<Future<?>> futures = new ArrayList<>();
		for (int i = 0; i < n; i++) {
			futures.add(pool.submit(() -> service.streamChat(new ChatInput("q", refs, List.of()),
					t -> allStreaming.countDown(), (s, src) -> { })));
		}
		boolean reached = allStreaming.await(120, TimeUnit.SECONDS);
		long during = settledUsed();
		releaseServer.countDown();
		String outcome = "ok";
		for (Future<?> f : futures) {
			try {
				f.get(120, TimeUnit.SECONDS);
			} catch (Exception e) {
				outcome = "FAILED: " + e.getCause();
			}
		}
		long after = settledUsed();
		pool.shutdown();
		server.stop(0);

		String report = String.format("""
				time=%s java=%s maxHeap=%dMB
				n=%d images=%d x %dMB  allStreamingReached=%s outcome=%s
				requestBodyBytes(one request, measured at fake server)=%d (%.1fMB)
				heapUsed baseline(after GC)=%.1fMB
				heapUsed while all %d streams open (after GC)=%.1fMB
				retained while streaming = %.1fMB total, %.1fMB per request
				heapUsed after streams finished (after GC)=%.1fMB
				peak (MemoryMXBean heap used, current)=%.1fMB
				""", Instant.now(), System.getProperty("java.version"), max >> 20, n, images, mb, reached, outcome,
				requestBytes.get(), requestBytes.get() / 1048576.0, baseline / 1048576.0, n, during / 1048576.0,
				(during - baseline) / 1048576.0, (during - baseline) / 1048576.0 / n, after / 1048576.0,
				mem.getHeapMemoryUsage().getUsed() / 1048576.0);
		System.out.println("=== #552 MEASURE ===\n" + report);
	}

	private static long settledUsed() throws InterruptedException {
		for (int i = 0; i < 3; i++) {
			System.gc();
			Thread.sleep(200);
		}
		Runtime rt = Runtime.getRuntime();
		return rt.totalMemory() - rt.freeMemory();
	}
}
