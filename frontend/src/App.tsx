import { Navigate, Route, Routes } from 'react-router'
import ProtectedRoute from './components/ProtectedRoute'
import ChatPage from './pages/ChatPage'
import LoginPage from './pages/LoginPage'
import AdminPage from './pages/AdminPage'
import MyPage from './pages/MyPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <ChatPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/me"
        element={
          <ProtectedRoute>
            <MyPage />
          </ProtectedRoute>
        }
      />
      {/* 관리자가 아니면 AdminPage 가 스스로 `/` 로 되돌린다(화면 처리일 뿐, 접근 제어는 Me.role 주석) */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
