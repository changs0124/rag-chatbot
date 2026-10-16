import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { primaryButtonClass } from './primaryButton'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/**
 * 렌더 예외를 잡아 복구 UI를 노출함. 백지 화면 방지.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 관측 도구 미연결 - 콘솔 기록만
    console.error('ErrorBoundary caught', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid h-[100dvh] place-items-center bg-canvas p-6 text-center">
          <div>
            <p className="mb-4 text-[15px] leading-relaxed text-ink">
              문제가 발생했습니다. 페이지를 새로고침해 주세요.
            </p>
            <button
              onClick={() => window.location.reload()}
              className={primaryButtonClass}
            >
              새로고침
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
