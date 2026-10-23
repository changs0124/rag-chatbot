// 이름 입력 상한(마이페이지 · 관리자 계정 추가). 서버 상한(USER_MAX_NAME_CHARS 기본값)과 같은 값. 정본은 서버라 넘긴 요청은 400 이다(#413).
// maxLength 는 UTF-16 단위라 이모지가 섞이면 서버(코드 포인트)보다 먼저 막는다 - 더 엄격한 쪽이라 둔다
export const MAX_NAME_CHARS = 50
