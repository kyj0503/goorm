import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ReactNode } from 'react'
import GitHubLogin from './components/GitHubLogin'
import Callback from './components/Callback'
import Chat from './components/Chat'
import './App.css'

// 인증 상태 검사 함수
const isAuthenticated = () => {
  const token = localStorage.getItem('accessToken');
  if (!token) return false;
  
  // 토큰이 만료되었는지 간단히 확인 (JWT의 만료시간을 체크하는 로직을 추가할 수 있음)
  try {
    // JWT 토큰은 'header.payload.signature' 형식
    // payload 부분을 디코딩하여 만료 시간 확인
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      // 토큰이 만료됨
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userInfo');
      return false;
    }
    return true;
  } catch (e) {
    console.error('Invalid token format:', e);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userInfo');
    return false;
  }
};

// 인증 필요한 라우트를 위한 래퍼 컴포넌트
function ProtectedRoute({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  const location = useLocation();
  
  console.log('현재 경로:', location.pathname);
  
  // Callback 페이지에서는 리다이렉트하지 않음
  if (location.pathname === '/callback' || location.pathname === '/simple-chat/callback') {
    return <Callback />;
  }

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          isAuthenticated() ? (
            <Navigate to="/chat" replace />
          ) : (
            <GitHubLogin />
          )
        } 
      />
      <Route path="/callback" element={<Callback />} />
      <Route 
        path="/chat" 
        element={
          <ProtectedRoute>
            <Chat />
          </ProtectedRoute>
        } 
      />
      {/* 알 수 없는 경로는 홈으로 리디렉션 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  // GitHub Pages 배포 시 basename을 설정
  const basename = import.meta.env.MODE === 'production' ? '/simple-chat' : '';
  
  return (
    <Router basename={basename}>
      <AppRoutes />
    </Router>
  );
}

export default App;
