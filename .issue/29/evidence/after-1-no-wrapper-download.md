# after : Maven 배포판 다운로드가 사라졌다

## 1. 같은 교란을 다시 걸었다 — 이번엔 통과한다

```
$ docker run --rm --network none maven:3.9.16-eclipse-temurin-17-alpine mvn -B -N -version
Apache Maven 3.9.16 (2bdd9fddda4b155ebf8000e807eb73fd829a51d5)
Maven home: /usr/share/maven
Java version: 17.0.20, vendor: Eclipse Adoptium
```

before 에서는 같은 명령이 `wget: Failed to fetch …apache-maven-3.9.16-bin.zip` 으로 끊겼다.
`Maven home` 이 `/root/.m2/wrapper/dists/…`(내려받은 자리)에서 `/usr/share/maven`(이미지 안)으로
옮겨간 것이 이 변경의 전부다. **버전은 3.9.16 그대로다.**

## 2. 크기와 시간 (`--no-cache`, 같은 기계)

| | before | after | 차이 |
|---|---|---|---|
| 최종 이미지 크기 | 96,652,924 B (92.2 MB) | 96,652,969 B (92.2 MB) | **+45 B** |
| 빌드 시간 | 196s | 209s | +13s |
| wrapper zip 다운로드 | 매 빌드 1회 | **0회** | — |
| 캐시 있는 재빌드 | — | 2s | — |

**이슈가 이 안에 달아 둔 「베이스 이미지가 커진다」는 비용은 실측에서 45바이트였다.**
멀티스테이지라 `maven:*` 은 build 스테이지에서만 쓰이고 최종 이미지는 `eclipse-temurin:17-jre-alpine`
그대로다. 45B 는 jar 안 타임스탬프 수준의 노이즈다.

빌드 시간 +13s 는 Maven 이미지를 **처음 받아오는** 비용이다. 대신 매 빌드 반복되던 wrapper
다운로드가 사라졌고, 캐시가 남는 환경에서는 재빌드가 2초다.

## 3. 남는 노출 — 정직하게

**의존성 해석은 여전히 Central 을 탄다.** 없앤 것은 배포판 다운로드라는 별도의 한 홉이고,
그 홉이 이번에 실제로 터진 자리다. 남는 쪽은 재시도 2회(15초 · 45초)로 덮었다 —
몇 초짜리 흔들림에 모든 PR 이 막히는 것이 이 이슈의 증상이었다.

완전히 끊으려면 사내 미러나 Nexus 같은 프록시가 필요한데, 단일 인스턴스 사내 도구에는 과하다.
