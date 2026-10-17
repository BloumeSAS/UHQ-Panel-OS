import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useSite } from '@/lib/site';
import { useT } from '@/lib/i18n';
import { Layout } from '@/components/Layout';
import { TourProvider } from '@/components/GuidedTour';
import DatabaseSetup from '@/pages/DatabaseSetup';
import Setup from '@/pages/Setup';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
const Dashboard = lazy(() => import('@/pages/admin/Dashboard'));
const Analytics = lazy(() => import('@/pages/admin/Analytics'));
const SubUsers = lazy(() => import('@/pages/admin/SubUsers'));
const Users = lazy(() => import('@/pages/admin/Users'));
const Pool = lazy(() => import('@/pages/admin/Pool'));
const Logs = lazy(() => import('@/pages/admin/Logs'));
const Scraper = lazy(() => import('@/pages/admin/Scraper'));
const Settings = lazy(() => import('@/pages/admin/Settings'));
const Reports = lazy(() => import('@/pages/admin/Reports'));
const About = lazy(() => import('@/pages/admin/About'));
const Checker = lazy(() => import('@/pages/admin/Checker'));
const Audit = lazy(() => import('@/pages/admin/Audit'));
const BannedIps = lazy(() => import('@/pages/admin/BannedIps'));
import MyProxies from '@/pages/user/MyProxies';
import SecurityPage from '@/pages/user/Security';
import ApiKeysPage from '@/pages/user/ApiKeys';
import ProfilePage from '@/pages/Profile';
const ProxyPools = lazy(() => import('@/pages/admin/ProxyPools'));
const Addons = lazy(() => import('@/pages/admin/Addons'));
const AddonDocs = lazy(() => import('@/pages/admin/AddonDocs'));
import AddonIframe from '@/pages/AddonIframe';
const Diagnostics = lazy(() => import('@/pages/admin/Diagnostics'));
const ErrorCodes = lazy(() => import('@/pages/admin/ErrorCodes'));
import Status from '@/pages/Status';
import Help from '@/pages/Help';

import Maintenance from '@/pages/Maintenance';
import ShareLinkView from '@/pages/ShareLinkView';

function Loader() {
  const t = useT();
  return <div className="flex min-h-screen items-center justify-center text-muted-foreground">{t('app.loading')}</div>;
}

/**
 * Garde : exige une session ; sinon redirige au login.
 * `admin` = raccourci pour roles=['ADMIN']. `roles` permet d'autoriser aussi
 * SUPPORT (lecture seule) sur les pages qui le supportent (dashboard, pool,
 * logs, audit, about) sans lui donner accès aux pages de gestion.
 */
// Pages accessibles même quand la 2FA admin obligatoire n'est pas encore
// configurée — sinon l'admin n'aurait aucun moyen d'aller l'activer.
const TWO_FA_SETUP_ALLOWED_PATHS = ['/security', '/profile', '/about'];

function Protected({ children, admin, roles }: { children: React.ReactNode; admin?: boolean; roles?: Array<'ADMIN' | 'SUPPORT'> }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  const allowed = roles ?? (admin ? ['ADMIN'] : null);
  if (allowed && !allowed.includes(user.role as any)) return <Navigate to="/" replace />;
  if (user.mustSetup2fa && !TWO_FA_SETUP_ALLOWED_PATHS.includes(location.pathname)) {
    return <Navigate to="/security" replace />;
  }
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
    location.pathname === '/reset-password' ||
    location.pathname === '/status' ||
    location.pathname.startsWith('/share/');

  if (status?.maintenanceModeEnabled && !isAdmin && !isPublicPage) {
    return <Maintenance />;
  }

  return (
    <Suspense fallback={<Loader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/share/:token" element={<ShareLinkView />} />
      <Route path="/status" element={<Status />} />

      <Route path="/" element={<HomeRouter />} />

      {/* Admin routes */}
      <Route path="/subusers" element={<Protected admin><SubUsers /></Protected>} />
      <Route path="/users" element={<Protected admin><Users /></Protected>} />
      <Route path="/pool" element={<Protected roles={['ADMIN', 'SUPPORT']}><Pool /></Protected>} />
      <Route path="/analytics" element={<Protected roles={['ADMIN', 'SUPPORT']}><Analytics /></Protected>} />
      <Route path="/proxy-pools" element={<Protected admin><ProxyPools /></Protected>} />
      <Route path="/scraper" element={<Protected admin><Scraper /></Protected>} />
      <Route path="/checker" element={<Protected admin><Checker /></Protected>} />
      <Route path="/logs" element={<Protected roles={['ADMIN', 'SUPPORT']}><Logs /></Protected>} />
      <Route path="/settings" element={<Protected admin><Settings /></Protected>} />
      <Route path="/reports" element={<Protected roles={['ADMIN', 'SUPPORT']}><Reports /></Protected>} />
      <Route path="/audit" element={<Protected roles={['ADMIN', 'SUPPORT']}><Audit /></Protected>} />
      <Route path="/errors" element={<Protected roles={['ADMIN', 'SUPPORT']}><ErrorCodes /></Protected>} />
      <Route path="/diagnostics" element={<Protected admin><Diagnostics /></Protected>} />
      <Route path="/banned-ips" element={<Protected admin><BannedIps /></Protected>} />
      <Route path="/addons-manage" element={<Protected admin><Addons /></Protected>} />
      <Route path="/addon-docs" element={<Protected admin><AddonDocs /></Protected>} />

      {/* User routes (any authenticated) */}
      <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
      <Route path="/security" element={<Protected><SecurityPage /></Protected>} />
      <Route path="/help" element={<Protected><Help /></Protected>} />
      <Route path="/api-keys" element={<Protected><ApiKeysPage /></Protected>} />
      <Route path="/addons/:id/:pagePath" element={<Protected><AddonIframe /></Protected>} />
      <Route path="/about" element={<Protected><About /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TourProvider>
        <AppRoutes />
      </TourProvider>
    </BrowserRouter>
  );
}

/** L'accueil dépend du rôle : admin → dashboard, user → ses proxies. */
function HomeRouter() {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  const isStaff = user.role === 'ADMIN' || user.role === 'SUPPORT';
  return <Protected>{isStaff ? <Dashboard /> : <MyProxies />}</Protected>;
}
