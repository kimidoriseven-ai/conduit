import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Toaster } from './components/Toast';

// ルートごとにチャンクを分割（クライアント確認ページに管理画面のコードを配信しない）
const ConfirmPage            = lazy(() => import('./pages/ConfirmPage'));
const CompletePage           = lazy(() => import('./pages/CompletePage'));
const InvalidTokenPage       = lazy(() => import('./pages/InvalidTokenPage'));
const InstagramCallbackPage  = lazy(() => import('./pages/InstagramCallbackPage'));

const LoginPage         = lazy(() => import('./pages/admin/LoginPage'));
const DashboardPage     = lazy(() => import('./pages/admin/DashboardPage'));
const ProjectCreatePage = lazy(() => import('./pages/admin/ProjectCreatePage'));
const ProjectDetailPage = lazy(() => import('./pages/admin/ProjectDetailPage'));
const FeedbackPage      = lazy(() => import('./pages/admin/FeedbackPage'));
const SettingsPage      = lazy(() => import('./pages/admin/SettingsPage'));

function Loading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888', fontSize: '14px', fontFamily: '-apple-system, "Hiragino Sans", sans-serif' }}>
      読み込み中...
    </div>
  );
}

// 認証ガード：ログインしていない場合はログインページへ
function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  return user ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* クライアント確認ページ（URLを知っていればアクセス可） */}
          <Route path="/confirm/:token" element={<ConfirmPage />} />
          <Route path="/confirm/:token/complete" element={<CompletePage />} />
          <Route path="/invalid-url" element={<InvalidTokenPage />} />
          <Route path="/instagram/callback" element={<InstagramCallbackPage />} />

          {/* 業者管理画面（要ログイン） */}
          <Route path="/admin/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminRoute><DashboardPage /></AdminRoute>} />
          <Route path="/admin/projects/new" element={<AdminRoute><ProjectCreatePage /></AdminRoute>} />
          <Route path="/admin/projects/:id" element={<AdminRoute><ProjectDetailPage /></AdminRoute>} />
          <Route path="/admin/projects/:id/feedback" element={<AdminRoute><FeedbackPage /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />

          {/* ルート → 管理画面へ */}
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="*" element={<InvalidTokenPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
