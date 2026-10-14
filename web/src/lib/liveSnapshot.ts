import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

export interface ActiveAccount {
  username: string;
  label: string;
  pool: string | null;
  threads: number;
  threadsLimit: number | null;
  sentBps: number;
  receivedBps: number;
  totalBytesSent: number | null;
  totalBytesReceived: number | null;
  totalGb: number | null;
  usedGb: number | null;
}

export interface LiveSnapshot {
  seq: number;
  ts: string;
  live: { active_threads: number; active_sessions: number; pool: { total: number; working: number; banned: number } };
  active_accounts: ActiveAccount[];
  active_proxies: any[];
  today_summary: { total_gb: number; total_requests: number; top_domains: { hostname: string; requests: number }[] };
}

/** live = flux WebSocket frais ; connecting = (re)connexion ; polling = secours HTTP (toutes les 3 s). */
export type LiveState = 'live' | 'connecting' | 'polling';

const STALE_MS = 7000; // le serveur envoie toutes les 2 s : au-delà, le flux est considéré figé
const POLL_MS = 3000;

/**
 * Source UNIQUE des valeurs « en direct » du tableau de bord. Tout vient du même instantané serveur (même
 * instant, même calcul) : plus de cartes alimentées par des sources différentes à des cadences différentes.
 * Un chien de garde coupe et rouvre le WebSocket s'il ne reçoit plus rien (connexion « zombie » derrière un
 * proxy), et un secours HTTP prend le relais tant que le flux n'est pas rétabli.
 */
export function useLiveSnapshot(enabled = true) {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [state, setState] = useState<LiveState>('connecting');
  const [now, setNow] = useState(Date.now());
  const lastAt = useRef(0); // heure de réception du dernier instantané
  const lastTs = useRef('');

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let wsAlive = false;

    const accept = (s: LiveSnapshot) => {
      // On ne recule jamais : un instantané plus ancien (arrivé en retard) est ignoré (horodatage serveur,
      // qui reste valable même si le serveur redémarre).
      if (s.ts < lastTs.current) return;
      lastTs.current = s.ts;
      lastAt.current = Date.now();
      setSnap(s);
    };

    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // En dev (Vite :5173) l'API est sur :8000 ; sinon même hôte que la page.
      const host = window.location.port === '5173' ? `${window.location.hostname}:8000` : window.location.host;
      const token = localStorage.getItem('uhq_token') || '';
      try {
        ws = new WebSocket(`${protocol}//${host}/api/panel/ws?token=${encodeURIComponent(token)}`);
      } catch {
        reconnect = setTimeout(connect, 3000);
        return;
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.event === 'stats' && msg.data?.live) {
            wsAlive = true;
            accept(msg.data as LiveSnapshot);
            setState('live');
          }
        } catch {
          /* message illisible : ignoré */
        }
      };
      ws.onclose = () => {
        wsAlive = false;
        setState((s) => (s === 'live' ? 'connecting' : s));
        if (!stopped) reconnect = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    // Chien de garde (1 s) : flux figé → on le coupe (reconnexion automatique) ; secours HTTP en attendant.
    const watchdog = setInterval(() => {
      setNow(Date.now());
      if (wsAlive && Date.now() - lastAt.current > STALE_MS) {
        wsAlive = false;
        setState('connecting');
        ws?.close();
      }
    }, 1000);

    const poll = async () => {
      if (stopped || (wsAlive && Date.now() - lastAt.current < STALE_MS)) return;
      try {
        const { data } = await api.get('/monitoring/snapshot', { timeout: 5000 });
        if (data?.data?.live) {
          accept(data.data as LiveSnapshot);
          if (!wsAlive) setState('polling');
        }
      } catch {
        /* réessaiera au prochain tour */
      }
    };
    void poll();
    const pollTimer = setInterval(poll, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(watchdog);
      clearInterval(pollTimer);
      if (reconnect) clearTimeout(reconnect);
      ws?.close();
    };
  }, [enabled]);

  const ageSec = snap ? Math.max(0, Math.round((now - lastAt.current) / 1000)) : null;
  return { snap, state, ageSec };
}
