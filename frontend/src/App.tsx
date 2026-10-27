import { Navigate, Route, Routes } from 'react-router'
import ProtectedRoute from './components/ProtectedRoute'
import ChatPage from './pages/ChatPage'
import LoginPage from './pages/LoginPage'
import AdminDocumentsPage from './pages/AdminDocumentsPage'
import AdminUsersPage from './pages/AdminUsersPage'
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
      {/* 관리자가 아니면 두 관리 화면이 스스로 `/` 로 되돌린다(화면 처리일 뿐, 접근 제어는 Me.role 주석) */}
      <Route
        path="/admin/documents"
        element={
          <ProtectedRoute>
            <AdminDocumentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <AdminUsersPage />
          </ProtectedRoute>
        }
      />
      {/* 화면을 둘로 나누기 전(#513)의 경로 - 북마크가 404 대신 문서 관리로 간다 */}
      <Route path="/admin" element={<Navigate to="/admin/documents" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
