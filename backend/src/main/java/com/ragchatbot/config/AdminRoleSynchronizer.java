package com.ragchatbot.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.ragchatbot.mapper.UserMapper;

/**
 * 관리자 명단 동기화(FEAT-ADMIN-001 · REQ-ADMIN-004).
 *
 * <p>기동 시 {@code ADMIN_EMAILS} 명단에 있는 계정을 {@code admin} 으로 올리고,
 * <b>명단에서 빠진 계정은 {@code user} 로 내린다.</b> 승격만 하면 명단에서 지운 계정이
 * 영구히 관리자로 남아 명단이 통제 수단이 되지 못한다.
 *
 * <p><b>왜 환경변수인가</b>(2026-08-19 결정) : 앱 안에 권한 상승 API 를 두지 않으므로 공격면이
 * 늘지 않고, 통제권이 배포 설정에 남는다. "첫 가입자 자동 승격"은 DB 초기화 시점에 외부인이 먼저
 * 가입하면 그가 관리자가 되어 기각했다. 대가로 명단 변경에 재기동이 필요하며, 사내 소규모에서
 * 관리자 교체는 드물어 감수한다.
 *
 * <p>명단에 있으나 아직 가입하지 않은 이메일은 아무 일도 하지 않는다 - 가입 시점에
 * {@code AuthService} 가 같은 명단을 보고 역할을 정한다.
 */
@Configuration
public class AdminRoleSynchronizer {

	private static final Logger log = LoggerFactory.getLogger(AdminRoleSynchronizer.class);

	/**
	 * 명단을 소문자로 정규화해 돌려준다. 비교가 {@code lower(email)} 기준이므로
	 * <b>앱의 이메일 정규화와 같은 눈금</b>이어야 대소문자만 다른 명단도 맞는다.
	 */
	public static List<String> parse(String raw) {
		if (raw == null || raw.isBlank()) {
			return List.of();
		}
		return Arrays.stream(raw.split(","))
				.map(s -> s.trim().toLowerCase(Locale.ROOT))
				.filter(s -> !s.isEmpty())
				.distinct()
				.toList();
	}

	@Bean
	ApplicationRunner syncAdminRoles(UserMapper userMapper,
			@Value("${app.admin.emails:}") String adminEmails) {
		return args -> {
			List<String> emails = parse(adminEmails);
			// 강등을 먼저 한다. 명단이 비어도 돌려야 "명단을 통째로 비워 관리자를 없앤다"가 성립함
			int demoted = userMapper.demoteAdminsNotIn(emails);
			// in () 은 유효한 SQL 이 아니므로 빈 명단에서는 부르지 않는다
			int promoted = emails.isEmpty() ? 0 : userMapper.promoteAdmins(emails);
			log.info("관리자 명단 동기화 : 명단 {}건 · 승격 {}건 · 강등 {}건", emails.size(), promoted, demoted);
		};
	}
}
