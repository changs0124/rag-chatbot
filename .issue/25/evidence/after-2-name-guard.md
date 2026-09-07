# after-2 : 가드 스크립트가 네 곳의 이름 표류를 잡는다

## 무교란
```
AdminDtos.DocumentResponse   id filename byteSize status uploadedByName createdAt
summaryResult <arg column>   id filename byteSize status uploadedByName createdAt
types.ts RagDocument         id filename byteSize status uploadedByName createdAt
AdminPage.test.tsx doc()     id filename byteSize status uploadedByName createdAt
✓ 응답 계약 4곳 일치 (6필드)
```

## 각 출처를 하나씩 어긋뜨린다
```
$ # A. resultMap 의 arg 순서 교환
어긋남 : record 와 resultMap 의 필드가 순서까지 같아야 한다(MyBatis 가 위치로 생성자를 찾음)
$ # B. types.ts 에서 byteSize 개명
AdminDtos.DocumentResponse   id filename byteSize status uploadedByName createdAt
summaryResult <arg column>   id filename byteSize status uploadedByName createdAt
types.ts RagDocument         id filename size status uploadedByName createdAt
AdminPage.test.tsx doc()     id filename byteSize status uploadedByName createdAt
어긋남 : record 와 types.ts 쪽 필드 이름 집합이 다르다
  record : byteSize createdAt filename id status uploadedByName
  types.ts : createdAt filename id size status uploadedByName
$ # C. doc() 픽스처에서 byteSize 삭제
AdminDtos.DocumentResponse   id filename byteSize status uploadedByName createdAt
summaryResult <arg column>   id filename byteSize status uploadedByName createdAt
types.ts RagDocument         id filename byteSize status uploadedByName createdAt
AdminPage.test.tsx doc()     id filename status uploadedByName createdAt
어긋남 : record 와 AdminPage.test.tsx doc() 쪽 필드 이름 집합이 다르다
  record : byteSize createdAt filename id status uploadedByName
  AdminPage.test.tsx doc() : createdAt filename id status uploadedByName
$ # D. record 에 필드 추가
어긋남 3건 (세 대조가 모두 걸림)
$ # E. 추출이 깨지면 조용히 통과하지 않는다
대조 실패 : AdminPage.test.tsx doc() 에서 필드를 한 개도 못 뽑음
```
