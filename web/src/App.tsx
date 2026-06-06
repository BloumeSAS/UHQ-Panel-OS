import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';
import { Layout } from '@/components/Layout';
import DatabaseSetup from '@/pages/DatabaseSetup';
import Setup from '@/pages/Setup';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import Dashboard from '@/pages/admin/Dashboard';
import SubUsers from '@/pages/admin/SubUsers';
import Users from '@/pages/admin/Users';
import Pool from '@/pages/admin/Pool';
import Logs from '@/pages/admin/Logs';
import Scraper from '@/pages/admin/Scraper';
import Settings from '@/pages/admin/Settings';
import Reports from '@/pages/admin/Reports';
import About from '@/pages/admin/About';
import Checker from '@/pages/admin/Checker';
import Audit from '@/pages/admin/Audit';
import MyProxies from '@/pages/user/MyProxies';
import SecurityPage from '@/pages/user/Security';
import ApiKeysPage from '@/pages/user/ApiKeys';
import Addons from '@/pages/admin/Addons';
import AddonDocs from '@/pages/admin/AddonDocs';
import AddonIframe from '@/pages/AddonIframe';

import Maintenance from '@/pages/Maintenance';

function Loader() {
  const t = useT();
  return <div className="flex min-h-screen items-center justify-center text-muted-foreground">{t('app.loading')}</div>;
}

/** Garde : exige une session ; sinon redirige au login. */
function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { db, status, loading: siteLoading } = useSite();
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();

  if (siteLoading || authLoading) return <Loader />;

  // 1. Base non configurée : tout redirige vers l'écran de configuration base.
  if (db && !db.configured) {
    if (location.pathname !== '/setup/database') {
      return <Navigate to="/setup/database" replace />;
    }
    return <DatabaseSetup />;
  }

  // 2. Première installation : tout redirige vers le wizard.
  if (status && !status.setupCompleted) {
    if (location.pathname !== '/setup') {
      return <Navigate to="/setup" replace />;
    }
    return <Setup />;
  }

  // 3. Mode maintenance actif & non admin & pas sur les pages publiques -> écran maintenance
  const isAdmin = user?.role === 'ADMIN';
  const isPublicPage =
    location.pathname === '/login' ||
    location.pathname === '/forgot-password' ||
    location.pathname === '/reset-password';

  if (status?.maintenanceModeEnabled && !isAdmin && !isPublicPage) {
    return <Maintenance />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/" element={<HomeRouter />} />

      {/* Admin routes */}
      <Route path="/subusers" element={<Protected admin><SubUsers /></Protected>} />
      <Route path="/users" element={<Protected admin><Users /></Protected>} />
      <Route path="/pool" element={<Protected admin><Pool /></Protected>} />
      <Route path="/scraper" element={<Protected admin><Scraper /></Protected>} />
      <Route path="/checker" element={<Protected admin><Checker /></Protected>} />
      <Route path="/logs" element={<Protected admin><Logs /></Protected>} />
      <Route path="/settings" element={<Protected admin><Settings /></Protected>} />
      <Route path="/reports" element={<Protected admin><Reports /></Protected>} />
      <Route path="/audit" element={<Protected admin><Audit /></Protected>} />
      <Route path="/addons-manage" element={<Protected admin><Addons /></Protected>} />
      <Route path="/addon-docs" element={<Protected admin><AddonDocs /></Protected>} />

      {/* User routes (any authenticated) */}
      <Route path="/security" element={<Protected><SecurityPage /></Protected>} />
      <Route path="/api-keys" element={<Protected><ApiKeysPage /></Protected>} />
      <Route path="/addons/:id/:pagePath" element={<Protected><AddonIframe /></Protected>} />
      <Route path="/about" element={<Protected><About /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
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

/** L'accueil dépend du rôle : admin → dashboard, user → ses proxies. */
function HomeRouter() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Protected>{user.role === 'ADMIN' ? <Dashboard /> : <MyProxies />}</Protected>;
}
