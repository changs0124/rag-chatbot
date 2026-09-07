package com.ragchatbot.service;

import java.security.SecureRandom;

import org.springframework.stereotype.Component;

/**
 * 사람이 눈으로 읽어 옮기는 임시 비밀번호를 만든다(FEAT-ADMIN-003 · FEAT-AUTH-001).
 *
 * <p>계정 발급과 비밀번호 초기화가 <b>같은 생성기를 쓴다.</b> 두 곳이 각자 만들면 한쪽만 규칙이
 * 바뀌어도 사용자가 받는 문자열의 성질이 갈리는데, 그 차이는 아무도 눈치채지 못한다.
 */
@Component
public class TemporaryPasswordGenerator {

	/**
	 * 혼동하기 쉬운 글자를 뺀 문자 집합. 임시 비밀번호는 사람이 눈으로 읽어 옮기므로
	 * {@code 0/O} · {@code 1/l/I} 가 섞이면 "안 된다"는 문의가 그만큼 늘어난다.
	 */
	private static final String ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

	private static final int SEGMENTS = 3;
	private static final int SEGMENT_LENGTH = 4;

	private final SecureRandom random = new SecureRandom();

	/** {@code Xk7m-Qp29-Vr4t} 꼴. 구분자를 넣는 이유는 사람이 옮겨 적을 때 자리를 잃지 않게 하려는 것 */
	public String generate() {
		StringBuilder sb = new StringBuilder();
		for (int s = 0; s < SEGMENTS; s++) {
			if (s > 0) {
				sb.append('-');
			}
			for (int i = 0; i < SEGMENT_LENGTH; i++) {
				sb.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
			}
		}
		return sb.toString();
	}
}
