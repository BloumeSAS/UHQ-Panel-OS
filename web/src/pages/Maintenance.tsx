import { useSite } from '@/lib/site';
import { Footer } from '@/components/Footer';
import { AlertTriangle, RefreshCw, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

export default function Maintenance() {
  const { status, refresh } = useSite();
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    await refresh();
    setTimeout(() => setChecking(false), 800);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-between bg-background overflow-hidden selection:bg-primary/30">
      {/* Decorative background gradients for premium look */}
      <div className="absolute top-[-20%] left-[-20%] h-[600px] w-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] h-[600px] w-[600px] rounded-full bg-destructive/5 blur-[120px] pointer-events-none" />

      {/* Header with Site Name and Logo */}
      <header className="w-full flex items-center justify-between px-6 py-6 max-w-7xl mx-auto z-10">
        <div className="flex items-center gap-2">
          {status?.logoUrl ? (
            <img src={status.logoUrl} alt="Logo" className="h-8 w-8 object-contain" />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center font-bold text-primary">U</div>
          )}
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-foreground to-foreground/75 bg-clip-text text-transparent">
            {status?.siteName || 'UHQ Panel OS'}
          </span>
        </div>
      </header>

      {/* Main glass card container */}
      <main className="flex-1 flex items-center justify-center px-4 py-12 z-10 w-full max-w-md">
        <div className="w-full bg-card/40 backdrop-blur-xl border border-border/50 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center">
          
          {/* Main animated warning icon */}
          <div className="relative mb-6">
            <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl animate-pulse" />
            <div className="relative h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <AlertTriangle className="h-8 w-8 animate-bounce" />
            </div>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-foreground mb-3">
            Mode Maintenance
          </h1>
          
          <p className="text-sm text-muted-foreground leading-relaxed mb-8">
            Le panel est actuellement en cours de maintenance ou de mise à jour programmée afin d'améliorer nos services. Veuillez réessayer ultérieurement.
          </p>

          {/* Action buttons */}
          <div className="w-full flex flex-col gap-3">
            <button
              onClick={handleRefresh}
              disabled={checking}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/95 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Vérification...' : 'Actualiser le statut'}
            </button>

            <Link
              to="/login"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border/80 bg-background/50 backdrop-blur px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent/80 transition-all"
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Connexion Administration
            </Link>
          </div>
        </div>
      </main>

      {/* Dynamic branding footer */}
      <Footer className="w-full z-10" />
    </div>
  );
}
