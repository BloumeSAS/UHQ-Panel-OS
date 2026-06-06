import axios from 'axios';

const TOKEN_KEY = 'uhq_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const api = axios.create({ baseURL: '/api/panel' });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Langue pour les messages d'API (nestjs-i18n lit l'en-tête x-lang).
  config.headers['x-lang'] = localStorage.getItem('uhq_lang') || 'fr';
  return config;
});

// 401 → token invalide/expiré : on déconnecte et on renvoie au login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && getToken()) {
      clearToken();
      if (!location.pathname.startsWith('/login')) location.href = '/login';
    }
    return Promise.reject(err);
  },
);

/** Message d'erreur lisible depuis une réponse axios. */
export function apiError(e: any): string {
  return e?.response?.data?.message || e?.message || 'Erreur inconnue';
}
