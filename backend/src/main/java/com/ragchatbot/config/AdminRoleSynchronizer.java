package com.ragchatbot.config;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

import com.ragchatbot.entity.User;
import com.ragchatbot.repository.UserRepository;
import com.ragchatbot.service.TemporaryPasswordGenerator;

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
 * <p><b>명단에 있는데 계정이 없으면 여기서 만든다</b>(2026-09-07). 회원가입이 있던 시절에는
 * 관리자도 스스로 가입해 태어났고 {@code AuthService.signup()} 이 명단을 보고 역할을 정했다.
 * 가입을 없애면 그 자리가 사라져 <b>빈 DB 에서 관리자가 영영 0명</b>이 되고, 계정 발급 API 는
 * 관리자만 부를 수 있으므로 아무도 첫 계정을 만들지 못한다.
 *
 * <p>임시 비밀번호는 <b>기동 로그에 한 번만</b> 찍고 저장하지 않는다. 환경변수로 받지 않는 이유는
 * 그 값을 바꾸지 않으면 계속 유효한 비밀번호로 남기 때문이고, 마이그레이션으로 심지 않는 이유는
 * 해시가 저장소에 박혀 모든 배포가 같은 초기 비밀번호를 갖기 때문이다.
 *
 * <p><b>이미 계정이 있으면 손대지 않는다.</b> 매 기동마다 비밀번호를 갈아엎으면 재기동이 곧
 * 계정 잠금이 된다.
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
	ApplicationRunner syncAdminRoles(UserRepository userRepository, PasswordEncoder passwordEncoder,
			TemporaryPasswordGenerator temporaryPasswords,
			@Value("${app.admin.emails:}") String adminEmails) {
		return args -> {
			List<String> emails = parse(adminEmails);
			// 계정이 없는 관리자를 먼저 만든다. 뒤의 승격이 그 계정까지 한 번에 훑도록 순서를 이렇게 둔다
			int created = 0;
			for (String email : emails) {
				if (userRepository.findByEmail(email).isPresent()) {
					continue;
				}
				String temporary = temporaryPasswords.generate();
				userRepository.insert(new User(UUID.randomUUID(), email, passwordEncoder.encode(temporary),
						email, "system", "admin", null, null));
				created++;
				// 이 한 줄이 첫 로그인의 유일한 통로다. 로그를 지우기 전에 옮겨 적어야 한다
				log.warn("관리자 계정 발급 : {} · 임시 비밀번호 {} (최초 로그인 후 마이페이지에서 변경할 것)",
						email, temporary);
			}
			// 강등을 먼저 한다. 명단이 비어도 돌려야 "명단을 통째로 비워 관리자를 없앤다"가 성립함
			int demoted = userRepository.demoteAdminsNotIn(emails);
			// in () 은 유효한 SQL 이 아니므로 빈 명단에서는 부르지 않는다
			int promoted = emails.isEmpty() ? 0 : userRepository.promoteAdmins(emails);
			log.info("관리자 명단 동기화 : 명단 {}건 · 생성 {}건 · 승격 {}건 · 강등 {}건",
					emails.size(), created, promoted, demoted);
		};
	}
}
