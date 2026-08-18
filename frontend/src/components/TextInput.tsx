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

const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100'
