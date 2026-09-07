## 무엇을 했나

도커 build 스테이지 베이스를 `eclipse-temurin:17-jdk-alpine` → **`maven:3.9.16-eclipse-temurin-17-alpine`** 으로 바꾸고 `./mvnw` 를 `mvn` 으로 돌렸다. **Maven 배포판 다운로드가 통째로 사라진다.**

## 원인을 실물로 확인했다

종전 베이스에 `mvn` 이 없다.

```
$ docker run --rm eclipse-temurin:17-jdk-alpine sh -c "command -v mvn || echo mvn 없음"
mvn 없음
```

그래서 `Dockerfile:11`·`:15` 의 `./mvnw` 가 **매 빌드마다** Maven 배포판을 내려받았다. 네트워크를 끊어 장애를 흉내내니 CI 로그와 **같은 주소에서 같은 모양으로** 끊긴다.

```
$ docker run --rm --network none -v <backend>:/b -w /b eclipse-temurin:17-jdk-alpine ./mvnw -B -N -version
wget: bad address 'repo.maven.apache.org'
wget: Failed to fetch https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.16/apache-maven-3.9.16-bin.zip
```

이슈에 붙인 CI 실패 로그의 두 번째 줄과 주소가 같다. 그쪽은 403(레이트리밋), 이쪽은 이름 해석 실패로 **원인만 다르고 끊기는 지점이 같다.**

## 고친 뒤 같은 교란을 다시 걸었다

```
$ docker run --rm --network none maven:3.9.16-eclipse-temurin-17-alpine mvn -B -N -version
Apache Maven 3.9.16 (2bdd9fddda4b155ebf8000e807eb73fd829a51d5)
Maven home: /usr/share/maven
Java version: 17.0.20, vendor: Eclipse Adoptium
```

`Maven home` 이 `/root/.m2/wrapper/dists/…`(내려받는 자리)에서 `/usr/share/maven`(이미지 안)으로 옮겨간 것이 이 변경의 전부다. **버전은 3.9.16 그대로**라 로컬·CI 와 갈리지 않는다.

## 이슈의 전제 하나가 실측에서 뒤집혔다

> **Maven 이 들어 있는 베이스 이미지로 교체** — … 가장 단순하나 **베이스 이미지가 커진다**

| | before | after | 차이 |
|---|---|---|---|
| 최종 이미지 크기 | 96,652,924 B (92.2 MB) | 96,652,969 B (92.2 MB) | **+45 B** |
| `--no-cache` 빌드 시간 | 196s | 209s | +13s |
| 캐시 있는 재빌드 | — | **2s** | — |
| wrapper zip 다운로드 | 매 빌드 1회 | **0회** | — |

**커지지 않는다.** 이 `Dockerfile` 은 멀티스테이지라 `maven:*` 은 build 스테이지에서만 쓰이고 최종 이미지는 `eclipse-temurin:17-jre-alpine` 그대로다. 45B 는 jar 안 타임스탬프 수준의 노이즈다. 빌드 시간 +13s 는 Maven 이미지를 **처음 받아오는** 비용이고, 그 대신 매 빌드 반복되던 wrapper 다운로드가 없어졌다.

## 남는 노출 — 정직하게

**의존성 해석은 여전히 Maven Central 을 탄다.** 없앤 것은 배포판 다운로드라는 별도의 한 홉이고, 그 홉이 이번에 실제로 터진 자리다. 남는 쪽은 `dependency:go-offline` 에 재시도 두 번(15초 · 45초)을 겹쳐 덮었다 — 완료 조건이 말한 "적어도 재시도로 자동 복구"가 이쪽이다.

완전히 끊으려면 사내 미러나 Nexus 같은 프록시가 필요한데, 단일 인스턴스 사내 도구에는 과하다.

## 하지 않은 것

**`mvnw` 를 지우지 않았다.** 로컬과 CI 의 `./mvnw` 가 그대로 쓰고 `check-runtime-versions.sh` 도 그것을 본다. 이번에 끊은 것은 **도커 빌드의** 의존뿐이다.

나머지 후보 셋(레이어 캐시 · `--mount=type=cache` · 재시도만)은 전부 **완화**에 그친다. 특히 BuildKit 캐시 마운트는 CI 러너가 매번 새로 뜨므로 캐시 백엔드를 따로 붙이지 않으면 CI 에서는 효과가 없다.

## 검증

```
docker build --no-cache   before 196s / 92.2 MB · after 209s / 92.2 MB
docker build (캐시)        after 2s
mvn -version (--network none)   before 실패 · after 통과
check-doc-refs            184건 통과
```

문서는 `README.md`(툴체인 표 각주) · `backend.md`(배포 절) · `CHANGELOG.md` 를 맞췄다.
