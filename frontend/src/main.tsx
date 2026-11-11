import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import { prefetchConversations } from './lib/conversationPrefetch'

// 대화 목록을 me 와 함께 받기 시작한다(#694) - 기다리면 me 응답 → 채팅 화면 마운트 뒤로 왕복이 하나 더 붙는다
prefetchConversations()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
