# 백엔드 컨테이너 - 호스트 미정이라 특정 PaaS 형식(Procfile · fly.toml 등) 대신
# 어디서나 받는 컨테이너 하나로 둠. 리슨 포트는 PORT 환경변수를 따름(application.yml).

# --- 빌드 ---------------------------------------------------------------
# **Maven 이 들어 있는 이미지를 쓴다.** 종전에는 JDK 이미지에서 `./mvnw` 를 불렀는데, 그 베이스에는
# mvn 이 없어 빌드마다 Maven 배포판 zip 을 Central 에서 내려받았다. 의존성 해석보다 앞선 단계라
# 레이어 캐시로도 덮이지 않았고, 실제로 Central 이 403 을 돌려준 날 이미지 빌드가 통째로 멎었다.
#
# 버전을 정확히 고정한다 - wrapper 가 쓰던 3.9.16 과 같은 값이라 Maven 자체는 바뀌지 않는다.
# 멀티스테이지라 이 이미지는 최종 산출물에 남지 않는다(런타임은 아래 jre-alpine).
#
# `mvnw` 는 저장소에 그대로 둔다. 로컬과 CI 의 `./mvnw` 가 계속 쓰고, 여기서 끊는 것은
# **도커 빌드의** 의존뿐이다.
FROM maven:3.9.16-eclipse-temurin-17-alpine AS build
WORKDIR /build

# 의존성 레이어를 먼저 굳힘 - 소스만 바뀌면 이 레이어가 캐시에서 재사용됨
COPY pom.xml ./
# 의존성 해석은 여전히 Central 을 탄다 - 없앤 것은 배포판 다운로드 한 홉이다. 그쪽은 재시도로 덮는다.
# 몇 초짜리 흔들림에 모든 PR 이 막히는 것이 이 이슈의 증상이었다
RUN mvn -B -q dependency:go-offline || (sleep 15 && mvn -B -q dependency:go-offline) || (sleep 45 && mvn -B -q dependency:go-offline)

COPY src/ src/
# 테스트는 CI 가 Testcontainers 로 돌림. 이미지 빌드에서 도커를 또 요구하지 않으려고 건너뜀
RUN mvn -B -q -DskipTests package

# --- 실행 ---------------------------------------------------------------
FROM eclipse-temurin:17-jre-alpine
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
