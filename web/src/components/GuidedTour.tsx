import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { categoriesForRole, stepsForRole } from '@/lib/tour/steps';
import { Button } from '@/components/ui';

/** Posé par Setup.tsx à la fin de l'installation : la visite démarre alors toute seule sur le tableau de bord. */
export const TOUR_PENDING_KEY = 'uhq_tour_pending';
const DONE_KEY = 'uhq_tour_done';

interface TourCtx {
  /** Sans argument : visite complète ; avec un identifiant : une seule catégorie. */
  start: (category?: string) => void;
  running: boolean;
  categories: { id: string }[];
}
const Ctx = createContext<TourCtx>({ start: () => undefined, running: false, categories: [] });
export const useTour = () => useContext(Ctx);

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const find = (name?: string): HTMLElement | null =>
  name ? (document.querySelector(`[data-tour="${name}"]`) as HTMLElement | null) : null;

/** Rectangle visible (écrêté à l'écran) ; null si l'élément est absent, masqué ou hors écran. */
function boxOf(el: HTMLElement | null): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return null;
  const top = Math.max(r.top, 6);
  const left = Math.max(r.left, 6);
  const bottom = Math.min(r.bottom, window.innerHeight - 6);
  const right = Math.min(r.right, window.innerWidth - 6);
  return { top, left, width: Math.max(right - left, 1), height: Math.max(bottom - top, 1) };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, timeout = 2500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (check()) return true;
    await sleep(80);
  }
  return false;
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [focusBox, setFocusBox] = useState<Box | null>(null);
  const [navBox, setNavBox] = useState<Box | null>(null);
  const [cardH, setCardH] = useState(260);
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  const [category, setCategory] = useState<string | undefined>(undefined);
  const steps = useMemo(() => stepsForRole(user?.role, category), [user?.role, category]);
  const categories = useMemo(() => categoriesForRole(user?.role), [user?.role]);
  const step = running ? steps[index] : undefined;

  const start = useCallback((cat?: string) => {
    setCategory(typeof cat === 'string' ? cat : undefined);
    setIndex(0);
    setFocusBox(null);
    setNavBox(null);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    setRunning(false);
    window.dispatchEvent(new CustomEvent('uhq-tour-sidebar', { detail: { open: false } }));
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
  }, []);

  // Démarrage automatique juste après l'installation.
  useEffect(() => {
    if (!user || running || location.pathname !== '/') return;
    let pending = false;
    try {
      pending = localStorage.getItem(TOUR_PENDING_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (!pending) return;
    // Le drapeau n'est retiré qu'au moment réel du démarrage (le re-render peut annuler le délai).
    const id = setTimeout(() => {
      try {
        localStorage.removeItem(TOUR_PENDING_KEY);
      } catch {
        /* ignore */
      }
      start();
    }, 600);
    return () => clearTimeout(id);
  }, [user, running, location.pathname, start]);

  // Se déconnecter / changer de compte coupe la visite.
  useEffect(() => {
    if (!user && running) setRunning(false);
  }, [user, running]);

  // Préparation de chaque étape : page, menu mobile, onglet des paramètres, défilement.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    (async () => {
      setFocusBox(null);
      setNavBox(null);
      if (step.route && pathRef.current !== step.route) {
        navigate(step.route);
        await sleep(60);
      }
      const narrow = window.innerWidth < 768;
      // Menu ouvert seulement quand c'est lui la cible (sinon il cacherait la page présentée).
      const needsSidebar = narrow && (step.focus === 'sidebar' || !!step.focus?.startsWith('nav:'));
      window.dispatchEvent(new CustomEvent('uhq-tour-sidebar', { detail: { open: !!needsSidebar } }));

      if (step.settingsTab) {
        await waitFor(() => !!find(`settings-tab:${step.settingsTab}`));
        window.dispatchEvent(new CustomEvent('uhq-tour-settings-tab', { detail: step.settingsTab }));
      }
      await waitFor(() => (step.focus ? !!find(step.focus) : true));
      if (cancelled) return;
      if (step.focus === 'content' || !step.focus) window.scrollTo({ top: 0 });
      else find(step.focus)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      find(step.nav)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      nextRef.current?.focus({ preventScroll: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [step, navigate]);

  // Mesure continue (la page charge, l'écran change de taille, on défile…).
  useEffect(() => {
    if (!step) return;
    const measure = () => {
      const f = boxOf(find(step.focus));
      const n = boxOf(find(step.nav));
      setFocusBox((p) => (sameBox(p, f) ? p : f));
      setNavBox((p) => (sameBox(p, n) ? p : n));
    };
    measure();
    const id = setInterval(measure, 150);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  const next = useCallback(() => {
    if (index >= steps.length - 1) stop();
    else setIndex(index + 1);
  }, [index, steps.length, stop]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, next, prev, stop]);

  const ctx = useMemo(() => ({ start, running, categories }), [start, running, categories]);

  let overlay: React.ReactNode = null;
  if (running && step) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const holes = [focusBox, navBox].filter(Boolean) as Box[];
    const mobile = vw < 640;
    const W = Math.min(420, vw - 24);

    // Position de la carte : au centre (étapes sans cible), près d'une petite cible, sinon en bas à droite.
    let style: React.CSSProperties;
    if (mobile) {
      style = { left: 8, right: 8, bottom: 8, maxHeight: '58vh' };
    } else if (!focusBox) {
      style = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: W };
    } else if (focusBox.width * focusBox.height > vw * vh * 0.22) {
      style = { right: 20, bottom: 20, width: W };
    } else {
      const clampTop = (v: number) => Math.min(Math.max(v, 8), Math.max(vh - cardH - 8, 8));
      if (focusBox.left + focusBox.width + 16 + W < vw) {
        style = { left: focusBox.left + focusBox.width + 16, top: clampTop(focusBox.top), width: W };
      } else if (focusBox.top + focusBox.height + 12 + cardH < vh) {
        style = {
          left: Math.min(Math.max(focusBox.left, 8), vw - W - 8),
          top: focusBox.top + focusBox.height + 12,
          width: W,
        };
      } else {
        style = {
          left: Math.min(Math.max(focusBox.left, 8), vw - W - 8),
          top: clampTop(focusBox.top - cardH - 12),
          width: W,
        };
      }
    }

    const total = steps.length;
    const isLast = index === total - 1;
    overlay = (
      <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={t('tour.start')}>
        {/* Voile sombre percé de trous sur les éléments mis en lumière. */}
        <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
          <defs>
            <mask id="uhq-tour-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {holes.map((h, i) => (
                <rect
                  key={i}
                  x={h.left - 6}
                  y={h.top - 6}
                  width={h.width + 12}
                  height={h.height + 12}
                  rx="10"
                  fill="black"
                />
              ))}
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#uhq-tour-mask)" />
          {holes.map((h, i) => (
            <rect
              key={i}
              x={h.left - 6}
              y={h.top - 6}
              width={h.width + 12}
              height={h.height + 12}
              rx="10"
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
          ))}
        </svg>

        <div
          ref={cardRef}
          className="absolute overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-2xl animate-in fade-in zoom-in-95 duration-200"
          style={{ maxHeight: 'calc(100vh - 16px)', ...style }}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('tour.step').replace('{n}', String(index + 1)).replace('{total}', String(total))}
              </p>
              <h2 className="text-base font-semibold leading-snug">{t(`tour.${step.id}.t`)}</h2>
            </div>
            <button
              type="button"
              onClick={stop}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('tour.skip')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {t(`tour.${step.id}.b`)}
          </p>
          <div className="mt-3 h-1 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={stop} className="text-xs text-muted-foreground hover:text-foreground">
              {t('tour.skip')}
            </button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={prev} disabled={index === 0}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                {t('tour.prev')}
              </Button>
              <button
                ref={nextRef}
                type="button"
                onClick={next}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                {isLast ? t('tour.finish') : t('tour.next')}
                {!isLast && <ChevronRight className="ml-1 h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {overlay}
    </Ctx.Provider>
  );
}
