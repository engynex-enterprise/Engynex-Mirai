// Vercel Function (Node 20): todas las rutas /api/* pasan por el mismo núcleo que usa Express.
import { handle, cors } from '../lib/core.js';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  for (const [k, v] of Object.entries(cors(req.headers.origin))) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const url = new URL(req.url, 'http://x');
  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const r = await handle({ method: req.method, path: url.pathname, headers: req.headers, body, query: Object.fromEntries(url.searchParams) });
  res.status(r.status).json(r.json);
}
