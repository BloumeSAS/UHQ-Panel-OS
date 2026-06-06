import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// En dev, l'API NestJS tourne sur :8000 — on proxifie /api, /docs et /static.
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:8000',
            '/docs': 'http://localhost:8000',
            '/static': 'http://localhost:8000',
        },
    },
});
