import { describe, it, expect } from 'vitest'
import { MAX_ATTACHMENTS, MAX_MESSAGE_CHARS, MAX_NAME_CHARS, MAX_TITLE_CHARS } from './limits'

// #483 F14 : 서버 상한의 사본은 이 파일 한 곳에 둔다(frontend.md 폴더 표). 값은 서버 기본값과 같아야 한다
describe('입력 상한', () => {
  it('서버 기본값과 같은 값을 한 곳에서 내보낸다', () => {
    expect({ MAX_ATTACHMENTS, MAX_MESSAGE_CHARS, MAX_TITLE_CHARS, MAX_NAME_CHARS }).toEqual({
      MAX_ATTACHMENTS: 5,
      MAX_MESSAGE_CHARS: 4000,
      MAX_TITLE_CHARS: 100,
      MAX_NAME_CHARS: 50,
    })
  })
})
