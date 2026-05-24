import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';
import { LoginPage } from '@/pages/auth/LoginPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { DashboardPage } from '@/pages/dashboard/DashboardPage';
import { InvoicesPage } from '@/pages/invoices/InvoicesPage';
import { InvoiceEditorPage } from '@/pages/invoices/InvoiceEditorPage';
import { QuotesPage } from '@/pages/quotes/QuotesPage';
import { PurchaseOrdersPage } from '@/pages/purchase-orders/PurchaseOrdersPage';
import { TemplatesPage } from '@/pages/templates/TemplatesPage';
import { BillingPage } from '@/pages/billing/BillingPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';

function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuthStore();

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const userEncoded = params.get('user');

    if (accessToken && refreshToken && userEncoded) {
      try {
        const user = JSON.parse(decodeURIComponent(userEncoded));
        login(user, accessToken, refreshToken);
        navigate('/dashboard', { replace: true });
      } catch {
        navigate('/login?error=oauth_failed', { replace: true });
      }
    } else {
      navigate('/login?error=oauth_failed', { replace: true });
    }
  }, []);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full" />
    </div>
  );
}

function AppRoutes() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected app routes */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/invoices/new" element={<InvoiceEditorPage />} />
        <Route path="/invoices/:id" element={<InvoiceEditorPage />} />
        <Route path="/quotes" element={<QuotesPage />} />
        <Route path="/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
