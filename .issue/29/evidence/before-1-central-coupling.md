# before : 도커 빌드가 Maven Central 없이는 시작조차 못 한다

## 1. build 스테이지 베이스에 Maven 이 없다

```
$ docker run --rm eclipse-temurin:17-jdk-alpine sh -c "command -v mvn || echo mvn 없음"
mvn 없음
```

그래서 `Dockerfile:11` · `:15` 의 `./mvnw` 가 **매 빌드마다 Maven 배포판을 내려받는다.**
의존성 해석보다 앞선 단계라 `dependency:go-offline` 레이어 캐시로도 덮이지 않는다.

## 2. Central 에 못 붙으면 CI 와 같은 줄이 나온다

네트워크를 끊어 장애를 흉내냈다.

```
$ docker run --rm --network none -v <backend>:/b -w /b eclipse-temurin:17-jdk-alpine ./mvnw -B -N -version
wget: bad address 'repo.maven.apache.org'
wget: Failed to fetch https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.16/apache-maven-3.9.16-bin.zip
```

이슈에 붙은 CI 실패 로그의 두 번째 줄과 **주소가 같다.** 그쪽은 403(레이트리밋), 이쪽은 이름 해석 실패로
원인만 다를 뿐 **끊기는 지점이 같다.**

## 3. 기준 측정 (`--no-cache`)

```
빌드 시간        196s
  그중 dependency:go-offline 레이어  173.4s
  package 레이어                       7.6s
최종 이미지 크기  96652924 bytes (92.2 MB)
```

`distributionUrl` 은 `backend/.mvn/wrapper/maven-wrapper.properties:3` 에 있다.
