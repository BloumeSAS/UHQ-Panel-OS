import axios from 'axios';
import { getToken } from './api';

/** Appelle un addon embarqué actif via le reverse-proxy interne (/addon-proxy/<slug>/...). */
export const addonApi = axios.create({ baseURL: '/addon-proxy' });

addonApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
