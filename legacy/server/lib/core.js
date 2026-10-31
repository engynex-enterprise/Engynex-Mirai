// Núcleo del servidor de Mirai: integraciones (correo, WhatsApp, IA), avisos programados y proxy de IA.
// Lo usan tanto Vercel (api/[...path].js) como Express (index.js).
import { getStore } from './store.js';
import { encrypt, decrypt, mask } from './crypto.js';

export const VERSION = '2.1.0';
const env = (k, d = '') => process.env[k] ?? d;

// ---------- integraciones ----------
// kinds: email | whatsapp | ai_anthropic | ai_openai | ai_gemini
const EMAIL_PROVIDERS = {
  gmail: { label: 'Gmail', secrets: ['appPassword'], fields: ['user', 'fromName'] },
  sendgrid: { label: 'SendGrid', secrets: ['apiKey'], fields: ['from'] },
  resend: { label: 'Resend', secrets: ['apiKey'], fields: ['from'] },
  smtp: { label: 'SMTP', secrets: ['pass'], fields: ['host', 'port', 'secure', 'user', 'from'] }
};
async function loadIntegration(kind) {
  const st = await getStore();
  const row = await st.getIntegration(kind);
  if (!row) return null;
  return { ...(row.config || {}), ...(row.secrets_enc ? decrypt(row.secrets_enc) : {}) };
}
async function saveIntegration(kind, body) {
  const st = await getStore();
  const prevRow = await st.getIntegration(kind);
  const prevSecrets = prevRow?.secrets_enc ? decrypt(prevRow.secrets_enc) : {};
  const { secrets = {}, ...config } = body || {};
  // si cambias de proveedor (p. ej. de Resend a SendGrid) no se reutilizan las claves del anterior
  const same = !body?.provider || prevRow?.config?.provider === body.provider;
  const merged = same ? { ...prevSecrets } : {};
  for (const [k, v] of Object.entries(secrets)) if (v !== undefined && v !== null && String(v).trim() !== '') merged[k] = String(v).trim();
  const meta = Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, mask(v)]));
  await st.putIntegration(kind, { config, secrets_enc: Object.keys(merged).length ? encrypt(merged) : null, meta });
}
// configuración efectiva: la guardada desde Mirai tiene prioridad; si no hay, se usan variables de entorno
async function emailCfg() {
  const db = await loadIntegration('email');
  if (db?.provider) return db;
  const p = env('EMAIL_PROVIDER').toLowerCase();
  if (!p) return null;
  return { provider: p, from: env('EMAIL_FROM'), apiKey: env(p === 'sendgrid' ? 'SENDGRID_API_KEY' : 'RESEND_API_KEY'), host: env('SMTP_HOST'), port: env('SMTP_PORT', '587'), secure: env('SMTP_SECURE', 'false') === 'true', user: env('SMTP_USER'), pass: env('SMTP_PASS'), appPassword: env('GMAIL_APP_PASSWORD') };
}
async function waCfg() {
  const db = await loadIntegration('whatsapp');
  if (db?.token && db?.phoneId) return db;
  if (env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID')) return { token: env('WHATSAPP_TOKEN'), phoneId: env('WHATSAPP_PHONE_NUMBER_ID'), template: env('WHATSAPP_TEMPLATE'), lang: env('WHATSAPP_TEMPLATE_LANG', 'es'), apiVersion: env('WHATSAPP_API_VERSION', 'v21.0') };
  return null;
}
const AI_ENV = { anthropic: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'claude-sonnet-4-5'], openai: ['OPENAI_API_KEY', 'OPENAI_MODEL', 'gpt-4o-mini'], gemini: ['GEMINI_API_KEY', 'GEMINI_MODEL', 'gemini-2.0-flash'] };
async function aiCfg(p) {
  const db = await loadIntegration('ai_' + p);
  if (db?.apiKey) return { apiKey: db.apiKey, model: db.model || AI_ENV[p][2] };
  if (env(AI_ENV[p][0])) return { apiKey: env(AI_ENV[p][0]), model: env(AI_ENV[p][1], AI_ENV[p][2]) };
  return null;
}

// ---------- envío de correo ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let smtpCache = new Map();
export async function sendEmail({ to, subject, text, html }) {
  const c = await emailCfg();
  if (!c) throw new Error('No hay proveedor de correo configurado. Configúralo en Mirai › Ajustes › Alertas y notificaciones.');
  html = html || `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1F2B4B">${esc(text).replace(/\n/g, '<br>')}</div>`;
  const from = c.provider === 'gmail' ? (c.fromName ? `${c.fromName} <${c.user}>` : c.user) : c.from;
  if (!from) throw new Error('Falta el remitente (correo "De").');
  if (c.provider === 'sendgrid') {
    const m = from.match(/^(.*)<(.+)>$/);
    const r = await fetch(env('SENDGRID_URL', 'https://api.sendgrid.com/v3/mail/send'), { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: m ? { email: m[2].trim(), name: m[1].trim() } : { email: from }, subject, content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }] }) });
    if (!r.ok) throw new Error(`SendGrid ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return { provider: 'sendgrid' };
  }
  if (c.provider === 'resend') {
    const r = await fetch(env('RESEND_URL', 'https://api.resend.com/emails'), { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [to], subject, text, html }) });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return { provider: 'resend', id: (await r.json()).id };
  }
  if (c.provider === 'gmail' || c.provider === 'smtp') {
    const nodemailer = (await import('nodemailer')).default;
    const opts = c.provider === 'gmail'
      ? { host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: c.user, pass: c.appPassword } }
      : { host: c.host, port: +c.port || 587, secure: c.secure === true || c.secure === 'true', auth: c.user ? { user: c.user, pass: c.pass } : undefined };
    const key = JSON.stringify(opts);
    if (!smtpCache.has(key)) smtpCache = new Map([[key, nodemailer.createTransport(opts)]]);
    const info = await smtpCache.get(key).sendMail({ from, to, subject, text, html });
    return { provider: c.provider, id: info.messageId };
  }
  throw new Error('Proveedor de correo desconocido: ' + c.provider);
}

// ---------- WhatsApp Cloud API ----------
const oneLine = s => String(s).replace(/[\r\n\t]+/g, ' · ').replace(/ {4,}/g, '   ').trim();
export async function sendWhatsApp({ to, text, mode }) {
  const c = await waCfg();
  if (!c) throw new Error('WhatsApp no está configurado. Configúralo en Mirai › Ajustes › Alertas y notificaciones.');
  let num = String(to).replace(/\D/g, ''); if (num.length === 10) num = '57' + num;
  const useTemplate = mode !== 'text' && c.template;
  const body = useTemplate
    ? { messaging_product: 'whatsapp', to: num, type: 'template', template: { name: c.template, language: { code: c.lang || 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: oneLine(text).slice(0, 1000) }] }] } }
    : { messaging_product: 'whatsapp', to: num, type: 'text', text: { preview_url: false, body: text.slice(0, 4000) } };
  const r = await fetch(`${env('WHATSAPP_BASE_URL', 'https://graph.facebook.com')}/${c.apiVersion || 'v21.0'}/${c.phoneId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`WhatsApp ${r.status}: ${j.error?.message || JSON.stringify(j).slice(0, 300)}`);
  return { provider: 'whatsapp', id: j.messages?.[0]?.id, template: !!useTemplate };
}

// ---------- IA ----------
export async function aiCall({ provider, model, prompt, images = [], json }) {
  const c = await aiCfg(provider);
  if (!c) throw new Error(`No hay clave de ${provider} en el servidor.`);
  model = model || c.model; const key = c.apiKey; let r, j;
  if (provider === 'anthropic') {
    r = await fetch(env('ANTHROPIC_URL', 'https://api.anthropic.com/v1/messages'), { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: [...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.b64 } })), { type: 'text', text: prompt }] }] }) });
    j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j.error?.message || ''}`); return j.content.map(x => x.text || '').join('');
  }
  if (provider === 'openai') {
    r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...images.map(i => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.b64}` } }))] }], ...(json ? { response_format: { type: 'json_object' } } : {}) }) });
    j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j.error?.message || ''}`); return j.choices[0].message.content;
  }
  if (provider === 'gemini') {
    r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, ...images.map(i => ({ inline_data: { mime_type: i.mime, data: i.b64 } }))] }], generationConfig: json ? { responseMimeType: 'application/json' } : {} }) });
    j = await r.json(); if (!r.ok) throw new Error(`${r.status} ${j.error?.message || ''}`); return j.candidates[0].content.parts.map(p => p.text || '').join('');
  }
  throw new Error('Proveedor desconocido');
}

// ---------- resúmenes programados ----------
function localParts(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24, wd: p.weekday };
}
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function digest(s, ch) {
  const { date } = localParts(s.tz);
  const items = (s.items || []).filter(i => (i.ch || []).includes(ch)).filter(i => !i.fecha || i.fecha <= addDays(date, +s.anticipo || 5));
  if (!items.length) return null;
  const line = i => `• ${i.t}${i.b ? ' — ' + (s.hideAmt ? i.b.replace(/\$\s?[\d.,]+/g, '').trim() : i.b) : ''}`;
  return { items, subject: `Mirai: ${items.length} aviso${items.length > 1 ? 's' : ''} para hoy`, text: `Hola${s.nombre ? ' ' + s.nombre : ''}, este es tu resumen de Mirai (${date}):\n\n${items.slice(0, 15).map(line).join('\n')}${items.length > 15 ? `\n…y ${items.length - 15} avisos más.` : ''}\n\nAbre Mirai para ver el detalle.` };
}
async function runCron(force) {
  const st = await getStore(); const out = [];
  for (const s of await st.allSnapshots()) {
    const { date, hour, wd } = localParts(s.tz);
    if (!force && (hour !== (+s.hour || 7) || s.lastSent === date || (s.frec === 'semanal' && wd !== 'Mon'))) continue;
    const r = { id: s.id };
    try { if (s.emailOn && s.email) { const d = digest(s, 'email'); if (d) { await sendEmail({ to: s.email, subject: d.subject, text: d.text }); r.email = d.items.length; } } } catch (e) { r.emailError = e.message; }
    try { if (s.waOn && s.wa) { const d = digest(s, 'wa'); if (d) { await sendWhatsApp({ to: s.wa, text: d.text }); r.wa = d.items.length; } } } catch (e) { r.waError = e.message; }
    await st.putSnapshot(s.id, { lastSent: date }); out.push(r);
  }
  return out;
}

// ---------- router ----------
const ok = (json, status = 200) => ({ status, json });
const fail = (msg, status = 400) => ({ status, json: { ok: false, error: msg } });
export async function handle({ method, path, headers = {}, body = {}, query = {} }) {
  path = path.replace(/\/+$/, '') || '/';
  if (path.startsWith('/cron/') || path === '/api/cron/send') {
    const sec = env('CRON_SECRET'); const hdr = headers['x-cron-secret'] || (headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!sec || hdr !== sec) return fail('No autorizado', 401);
    return ok({ ok: true, processed: await runCron(query.force === '1') });
  }
  // ---- portal del contador (público, protegido por el id + la llave que solo está en el enlace) ----
  const pm = path.match(/^\/api\/public\/share\/([A-Za-z0-9_-]{16,64})(\/notes)?$/);
  if (pm) {
    try {
      const st = await getStore(); const sh = await st.getShare(pm[1]);
      const vigente = sh && !sh.revoked && (!sh.expires_at || new Date(sh.expires_at) > new Date());
      if (!vigente) return fail(sh?.revoked ? 'Este acceso fue revocado por el titular.' : sh ? 'Este acceso ya venció. Pídele al titular uno nuevo.' : 'Acceso no encontrado.', 404);
      if (method === 'GET' && !pm[2]) {
        await st.putShare(sh.id, { last_access: new Date().toISOString(), views: (+sh.views || 0) + 1 });
        return ok({ ok: true, id: sh.id, label: sh.label, perms: sh.perms, expires_at: sh.expires_at, blob: sh.blob, notes: sh.notes || [], updated_at: sh.updated_at });
      }
      if (method === 'POST' && pm[2]) {
        if (!body.verifier || body.verifier !== sh.verifier) return fail('No autorizado.', 401);
        if (!body.note || String(body.note).length > 20000) return fail('Nota inválida.');
        const notes = [...(sh.notes || []), { id: Math.random().toString(36).slice(2, 10), at: new Date().toISOString(), note: String(body.note) }].slice(-200);
        await st.putShare(sh.id, { notes }); return ok({ ok: true, notes });
      }
      return fail('Ruta no encontrada.', 404);
    } catch (e) { return fail(e.message || String(e), 502); }
  }
  const TOKEN = env('MIRAI_TOKEN');
  if (!TOKEN) return fail('El servidor no tiene MIRAI_TOKEN configurado.', 500);
  if ((headers.authorization || '') !== `Bearer ${TOKEN}`) return fail('Token inválido.', 401);
  try {
    if (path === '/api/health' && method === 'GET') {
      const st = await getStore(); const em = await emailCfg(); const wa = await waCfg();
      const ai = []; for (const p of Object.keys(AI_ENV)) if (await aiCfg(p)) ai.push(p);
      return ok({ ok: true, version: VERSION, store: st.kind, email: em?.provider || null, emailFrom: em ? (em.provider === 'gmail' ? em.user : em.from) : null, whatsapp: !!wa, whatsappTemplate: wa?.template || null, ai, cron: !!env('CRON_SECRET'), shares: true, encryption: !!env('ENCRYPTION_KEY') });
    }
    if (path === '/api/integrations' && method === 'GET') {
      const st = await getStore(); const rows = await st.allIntegrations(); const out = {};
      for (const r of rows) out[r.kind] = { ...(r.config || {}), secrets: r.meta || {}, updated: r.updated_at };
      return ok({ ok: true, integrations: out, providers: EMAIL_PROVIDERS });
    }
    const m = path.match(/^\/api\/integrations\/([a-z_]+)(\/test)?$/);
    if (m) {
      const kind = m[1];
      if (!/^(email|whatsapp|ai_anthropic|ai_openai|ai_gemini)$/.test(kind)) return fail('Integración desconocida.');
      if (m[2] && method === 'POST') {
        if (kind === 'email') return ok({ ok: true, ...(await sendEmail({ to: body.to, subject: 'Prueba de Mirai', text: '¡Hola! Así te llegarán los avisos de Mirai.' })) });
        if (kind === 'whatsapp') return ok({ ok: true, ...(await sendWhatsApp({ to: body.to, text: 'Prueba de Mirai: así te llegarán tus avisos.' })) });
        const p = kind.slice(3); const t = await aiCall({ provider: p, prompt: 'Responde solo con el JSON {"ok":true}', json: true });
        return ok({ ok: /true/.test(t), provider: p });
      }
      if (method === 'PUT' || method === 'POST') {
        if (kind === 'email' && !EMAIL_PROVIDERS[body.provider]) return fail('Elige un proveedor: gmail, sendgrid, resend o smtp.');
        await saveIntegration(kind, body); return ok({ ok: true });
      }
      if (method === 'DELETE') { await (await getStore()).delIntegration(kind); return ok({ ok: true }); }
    }
    if (path === '/api/shares' && method === 'GET') return ok({ ok: true, shares: await (await getStore()).listShares() });
    const sm = path.match(/^\/api\/shares\/([A-Za-z0-9_-]{16,64})$/);
    if (sm) {
      const st = await getStore();
      if (method === 'PUT') {
        const b = body; if (!b.blob) return fail('Falta la información cifrada.');
        if (String(b.blob).length > 4_000_000) return fail('La información es demasiado grande (máx. 4 MB).');
        const prev = await st.getShare(sm[1]);
        await st.putShare(sm[1], { label: String(b.label || '').slice(0, 120), email: String(b.email || '').slice(0, 160), perms: b.perms === 'todo' ? 'todo' : 'renta', expires_at: b.expires_at || null, revoked: false, verifier: prev?.verifier || String(b.verifier || ''), blob: b.blob, notes: prev?.notes || [], views: prev?.views || 0, created_at: prev?.created_at || new Date().toISOString() });
        return ok({ ok: true });
      }
      if (method === 'DELETE') { await st.delShare(sm[1]); return ok({ ok: true }); }
    }
    if (path === '/api/notify' && method === 'POST') {
      const { channel, to, subject, text, mode } = body;
      if (!to || !text) return fail('Faltan "to" o "text".');
      return ok({ ok: true, ...(channel === 'whatsapp' ? await sendWhatsApp({ to, text, mode }) : await sendEmail({ to, subject: subject || 'Mirai', text })) });
    }
    if (path === '/api/ai' && method === 'POST') return ok({ ok: true, text: await aiCall(body) });
    if (path === '/api/alerts/snapshot' && method === 'POST') {
      if (!body.device) return fail('Falta device.');
      const b = body; await (await getStore()).putSnapshot(b.device, { nombre: b.nombre || '', email: b.email || '', wa: b.wa || '', emailOn: !!b.emailOn, waOn: !!b.waOn, hour: +b.hour || 7, tz: b.tz || 'America/Bogota', frec: b.frec || 'diario', hideAmt: !!b.hideAmt, anticipo: +b.anticipo || 5, items: (b.items || []).slice(0, 100), updated: new Date().toISOString() });
      return ok({ ok: true });
    }
    return fail('Ruta no encontrada.', 404);
  } catch (e) { return fail(e.message || String(e), 502); }
}
export function cors(origin) {
  const allowed = env('ALLOWED_ORIGINS', '*').split(',').map(s => s.trim());
  if (!origin || !(allowed.includes('*') || allowed.includes(origin))) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS' };
}
