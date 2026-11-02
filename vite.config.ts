import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` active un certificat auto-signé : requis pour tester
// le GPS / la boussole / la caméra depuis un smartphone sur le réseau local.
// `VITE_BASE` : sous-dossier de déploiement (ex. "/EscapeNantes/" sur GitHub Pages), "/" par défaut.
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, '.', 'VITE_').VITE_BASE || '/',
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: { host: true, port: 5173 },
}));
