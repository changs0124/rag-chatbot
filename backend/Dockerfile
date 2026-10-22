# 백엔드 컨테이너 - 특정 PaaS 형식(Procfile · fly.toml 등) 대신 어디서나 받는 컨테이너 하나로 둠
# (운영은 단일 서버 + docker compose, scripts/deploy.sh). 리슨 포트는 PORT 환경변수를 따름(application.yml).

# --- 빌드 ---------------------------------------------------------------
# **Maven 이 들어 있는 이미지를 쓴다.** `./mvnw` 는 빌드마다 Maven 배포판을 Central 에서 내려받아,
# 레이어 캐시로 덮이지 않고 그 요청이 거절되면 이미지 빌드가 멎는다.
#
# 버전을 정확히 고정한다 - wrapper 가 쓰던 3.9.16 과 같은 값이라 Maven 자체는 바뀌지 않는다.
# 멀티스테이지라 이 이미지는 최종 산출물에 남지 않는다(런타임은 아래 jre-alpine).
#
# `mvnw` 는 저장소에 그대로 둔다. 로컬과 CI 의 `./mvnw` 가 계속 쓰고, 여기서 끊는 것은
# **도커 빌드의** 의존뿐이다.
# **다이제스트로 고정한다(#416)** - 태그는 움직이므로 빌드마다 다른 JRE 가 들어올 수 있다. 태그는 읽는 사람을 위한 표기이고
# 실제로는 다이제스트만 쓰인다. 올리는 법은 docs/02_architecture/backend.md 의 「다이제스트 고정」 단락 참고(compose 의 db · cloudflared 와 같은 방식).
FROM maven:3.9.16-eclipse-temurin-17-alpine@sha256:b7c8d7298dbabbe750441736cd99a1d120a58083d5af8d2bd75a1624cfdd8f3a AS build
WORKDIR /build

# 의존성 레이어를 먼저 굳힘 - 소스만 바뀌면 이 레이어가 캐시에서 재사용됨
COPY pom.xml ./
# 의존성 해석은 여전히 Central 을 탄다 - 없앤 것은 배포판 다운로드 한 홉이다. 그쪽은 재시도로 덮는다.
RUN mvn -B -q dependency:go-offline || (sleep 15 && mvn -B -q dependency:go-offline) || (sleep 45 && mvn -B -q dependency:go-offline)

COPY src/ src/
# 테스트는 CI 가 Testcontainers 로 돌림. 이미지 빌드에서 도커를 또 요구하지 않으려고 건너뜀
RUN mvn -B -q -DskipTests package

# --- 실행 ---------------------------------------------------------------
# 이 이미지도 같은 이유로 다이제스트 고정(#416).
FROM eclipse-temurin:17-jre-alpine@sha256:c4a33e6ddb738fe4be0a28a613ea0940cec42d25d7263c3e2238c43354cb19b0
WORKDIR /app

# 업로드 저장 루트. 컨테이너가 갈리면 사라지므로 **영속 볼륨을 붙여야 함**
# (붙이지 않으면 재시작마다 첨부 이미지가 소실됨 - docs/02_architecture/backend.md 참고)
ENV FILE_STORAGE_ROOT=/data/uploads
VOLUME ["/data/uploads"]

# 비루트 실행
RUN addgroup -S app && adduser -S app -G app \
	&& mkdir -p /data/uploads && chown -R app:app /data/uploads
USER app

COPY --from=build /build/target/*.jar app.jar

# APP_MODE 는 기본값이 없음 - 주지 않으면 기동에 실패함(AppModeGuard). 의도된 동작임
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
