import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { BaraatProvider } from './context/BaraatContext';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';
import { ToastAndStatus } from './components/ToastAndStatus';

const HomeSearchPage = lazy(() => import('./pages/HomeSearchPage').then((m) => ({ default: m.HomeSearchPage })));
const DecisionsPage = lazy(() => import('./pages/DecisionsPage').then((m) => ({ default: m.DecisionsPage })));
const ArticlesPage = lazy(() => import('./pages/ArticlesPage').then((m) => ({ default: m.ArticlesPage })));
const LawyersHubPage = lazy(() => import('./pages/LawyersHubPage').then((m) => ({ default: m.LawyersHubPage })));
const StudentsHubPage = lazy(() => import('./pages/StudentsHubPage').then((m) => ({ default: m.StudentsHubPage })));
const AboutContactPage = lazy(() => import('./pages/AboutContactPage').then((m) => ({ default: m.AboutContactPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));

const PageLoader: React.FC = () => (
  <div className="mx-auto flex min-h-[45vh] max-w-[1280px] items-center justify-center px-4 py-12">
    <div className="flex items-center gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-5 py-3 text-xs font-bold text-[var(--ink-muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      <span>در حال بارگذاری بخش...</span>
    </div>
  </div>
);

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
};

export function App() {
  return (
    <BrowserRouter>
      <BaraatProvider>
        <ScrollToTop />
        <div className="flex min-h-screen flex-col bg-[var(--canvas)] text-[var(--ink)]">
          <Navbar />
          <main className="flex-1">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<HomeSearchPage />} />
                <Route path="/laws" element={<HomeSearchPage />} />
                <Route path="/laws/:lawSlug" element={<HomeSearchPage />} />
                <Route path="/laws/:lawSlug/:artNum" element={<HomeSearchPage />} />
                <Route path="/decisions" element={<DecisionsPage />} />
                <Route path="/articles" element={<ArticlesPage />} />
                <Route path="/articles/:articleId" element={<ArticlesPage />} />
                <Route path="/lawyers" element={<LawyersHubPage />} />
                <Route path="/calculators" element={<LawyersHubPage />} />
                <Route path="/deadlines" element={<LawyersHubPage />} />
                <Route path="/cases" element={<LawyersHubPage />} />
                <Route path="/students" element={<StudentsHubPage />} />
                <Route path="/planner" element={<StudentsHubPage />} />
                <Route path="/exams" element={<StudentsHubPage />} />
                <Route path="/about" element={<AboutContactPage section="about" />} />
                <Route path="/contact" element={<AboutContactPage section="contact" />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
          <AuthModal />
          <ToastAndStatus />
        </div>
      </BaraatProvider>
    </BrowserRouter>
  );
}

export default App;
