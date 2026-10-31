// Mirai Server (modo Express) — para VPS, Hostinger, Docker o Cloud Run.
// En Vercel no se usa este archivo: se usa api/[...path].js con el mismo núcleo (lib/core.js).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handle, cors, VERSION } from './lib/core.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8080);
const app = express();
app.use(express.json({ limit: '15mb' }));

app.all(['/api/*', '/cron/*'], async (req, res) => {
  for (const [k, v] of Object.entries(cors(req.headers.origin))) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  const r = await handle({ method: req.method, path: req.path, headers: req.headers, body: req.body || {}, query: req.query || {} });
  res.status(r.status).json(r.json);
});
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], index: 'index.html' }));

// Cron interno opcional (si no tienes Cloud Scheduler / cron del sistema): INTERNAL_CRON=1
if (process.env.INTERNAL_CRON === '1' && process.env.CRON_SECRET) {
  setInterval(() => handle({ method: 'POST', path: '/api/cron/send', headers: { 'x-cron-secret': process.env.CRON_SECRET } }).catch(e => console.error('cron', e)), 60 * 60 * 1000);
}
app.listen(PORT, () => console.log(`Mirai Server ${VERSION} escuchando en :${PORT}`));
