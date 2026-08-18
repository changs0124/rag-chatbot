import type { InputHTMLAttributes } from 'react'

/**
 * 폼 입력창. `LoginPage` · `MyPage` 가 같은 클래스 문자열을 각자 들고 있어서, 한쪽만 손보면
 * 두 화면의 입력창이 조용히 갈렸다. 문자열을 여기 한 곳에만 둔다.
 *
 * `className` 을 받지 않는 것은 의도다 - 호출부가 덮어쓰기 시작하면 갈리는 문제가 그대로 돌아온다.
 * 다른 모양이 필요해지면 그때 변형을 이 파일 안에서 정한다.
 */
export default function TextInput(props: TextInputProps) {
  return <input {...props} className={inputClass} />
}

type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>

// h-11 = 44px. 모바일 터치 대상 하한이라 데스크톱과 같은 값을 쓴다
const inputClass =
  'h-11 w-full rounded-xl border border-line bg-raised px-3.5 text-[15px] text-ink outline-none ' +
  'transition-[border-color,box-shadow] duration-150 ease-[var(--ease-out-quint)] ' +
  'placeholder:text-ink-muted focus:border-accent focus:shadow-[0_0_0_3px_var(--c-accent-soft)]'
