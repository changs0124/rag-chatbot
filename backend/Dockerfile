# 백엔드 컨테이너 - 호스트 미정이라 특정 PaaS 형식(Procfile · fly.toml 등) 대신
# 어디서나 받는 컨테이너 하나로 둠. 리슨 포트는 PORT 환경변수를 따름(application.yml).

# --- 빌드 ---------------------------------------------------------------
FROM eclipse-temurin:17-jdk-alpine AS build
WORKDIR /build

# 의존성 레이어를 먼저 굳힘 - 소스만 바뀌면 이 레이어가 캐시에서 재사용됨
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN ./mvnw -B -q dependency:go-offline

COPY src/ src/
# 테스트는 CI 가 Testcontainers 로 돌림. 이미지 빌드에서 도커를 또 요구하지 않으려고 건너뜀
RUN ./mvnw -B -q -DskipTests package

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
