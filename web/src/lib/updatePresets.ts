/** Préconfigurations de la mise à jour automatique (webhook de déploiement) : un clic remplit méthode, en-têtes et corps. */
export interface UpdatePreset {
  id: string;
  /** Exemple d'URL (placeholder). */
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH';
  /** En-tête qui porte le jeton ('' = pas de jeton). */
  authHeader: string;
  /** Préfixe devant le jeton ('Bearer' | '' = jeton brut). */
  authScheme: string;
  body?: string;
  headers?: string;
  /** Le jeton est-il utile pour cette plateforme ? */
  needsToken: boolean;
}

export const UPDATE_PRESETS: UpdatePreset[] = [
  { id: 'coolify', url: 'https://coolify.exemple.fr/api/v1/deploy?uuid=XXXX&force=false', method: 'POST', authHeader: 'Authorization', authScheme: 'Bearer', needsToken: true },
  { id: 'dokploy', url: 'https://dokploy.exemple.fr/api/deploy/XXXXXXXX', method: 'POST', authHeader: '', authScheme: '', needsToken: false },
  { id: 'caprover', url: 'https://captain.root.exemple.fr/api/v2/user/apps/webhooks/triggerbuild?namespace=captain&token=XXXX', method: 'POST', authHeader: '', authScheme: '', needsToken: false },
  { id: 'portainer', url: 'https://portainer.exemple.fr/api/stacks/webhooks/XXXXXXXX-XXXX', method: 'POST', authHeader: '', authScheme: '', needsToken: false },
  { id: 'watchtower', url: 'http://watchtower:8080/v1/update', method: 'GET', authHeader: 'Authorization', authScheme: 'Bearer', needsToken: true },
  { id: 'render', url: 'https://api.render.com/deploy/srv-XXXX?key=YYYY', method: 'POST', authHeader: '', authScheme: '', needsToken: false },
  {
    id: 'railway', url: 'https://backboard.railway.com/graphql/v2', method: 'POST', authHeader: 'Authorization', authScheme: 'Bearer', needsToken: true,
    body: '{"query":"mutation { serviceInstanceRedeploy(serviceId: \\"SERVICE_ID\\", environmentId: \\"ENV_ID\\") }"}',
  },
  {
    id: 'heroku', url: 'https://api.heroku.com/apps/NOM_APP/builds', method: 'POST', authHeader: 'Authorization', authScheme: 'Bearer', needsToken: true,
    headers: '{"Accept":"application/vnd.heroku+json; version=3"}',
    body: '{"source_blob":{"url":"https://github.com/BloumeSAS/UHQ-Panel-OS/archive/refs/heads/main.tar.gz"}}',
  },
  { id: 'vercel', url: 'https://api.vercel.com/v1/integrations/deploy/prj_XXXX/YYYY', method: 'POST', authHeader: '', authScheme: '', needsToken: false },
  { id: 'netlify', url: 'https://api.netlify.com/build_hooks/XXXXXXXX', method: 'POST', authHeader: '', authScheme: '', needsToken: false },
  {
    id: 'pterodactyl', url: 'https://panel.exemple.fr/api/client/servers/XXXXXXXX/power', method: 'POST', authHeader: 'Authorization', authScheme: 'Bearer', needsToken: true,
    headers: '{"Accept":"Application/vnd.pterodactyl.v1+json"}', body: '{"signal":"restart"}',
  },
  { id: 'custom', url: 'https://…', method: 'POST', authHeader: 'Authorization', authScheme: 'Bearer', needsToken: true },
];
