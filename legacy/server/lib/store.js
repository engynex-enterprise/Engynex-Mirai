// Almacenamiento: Supabase (recomendado en Vercel), Firestore (Cloud Run) o archivo JSON (VPS/Hostinger).
import fs from 'node:fs/promises';
import path from 'node:path';

const KIND = (process.env.STORE || process.env.ALERTS_STORE || (process.env.SUPABASE_URL ? 'supabase' : 'file')).toLowerCase();
let cached = null;

export async function getStore() {
  if (cached) return cached;
  if (KIND === 'supabase') {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const t = (n) => sb.from(n);
    const chk = ({ data, error }) => { if (error) throw new Error('Supabase: ' + error.message); return data; };
    cached = {
      kind: 'supabase',
      getIntegration: async (k) => (chk(await t('mirai_integrations').select('*').eq('kind', k).maybeSingle())) || null,
      allIntegrations: async () => chk(await t('mirai_integrations').select('*')) || [],
      putIntegration: async (k, row) => chk(await t('mirai_integrations').upsert({ kind: k, ...row, updated_at: new Date().toISOString() })),
      delIntegration: async (k) => chk(await t('mirai_integrations').delete().eq('kind', k)),
      allSnapshots: async () => (chk(await t('mirai_alert_snapshots').select('*')) || []).map(r => ({ id: r.device, ...r.data, lastSent: r.last_sent })),
      getShare: async (id) => chk(await t('mirai_shares').select('*').eq('id', id).maybeSingle()) || null,
      listShares: async () => chk(await t('mirai_shares').select('id,label,email,perms,expires_at,revoked,notes,last_access,views,created_at,updated_at')) || [],
      putShare: async (id, row) => chk(await t('mirai_shares').upsert({ id, ...row, updated_at: new Date().toISOString() })),
      delShare: async (id) => chk(await t('mirai_shares').delete().eq('id', id)),
      putSnapshot: async (id, v) => {
        const { lastSent, ...data } = v;
        const prev = chk(await t('mirai_alert_snapshots').select('data,last_sent').eq('device', id).maybeSingle());
        const merged = { ...(prev?.data || {}), ...data };
        chk(await t('mirai_alert_snapshots').upsert({ device: id, data: merged, last_sent: lastSent ?? prev?.last_sent ?? null, updated_at: new Date().toISOString() }));
      }
    };
    return cached;
  }
  if (KIND === 'firestore') {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore();
    const I = db.collection('mirai_integrations'), A = db.collection(process.env.FIRESTORE_COLLECTION || 'mirai_alerts');
    cached = {
      kind: 'firestore',
      getIntegration: async (k) => { const d = await I.doc(k).get(); return d.exists ? { kind: k, ...d.data() } : null; },
      allIntegrations: async () => (await I.get()).docs.map(d => ({ kind: d.id, ...d.data() })),
      putIntegration: async (k, row) => I.doc(k).set({ ...row, updated_at: new Date().toISOString() }, { merge: true }),
      delIntegration: async (k) => I.doc(k).delete(),
      allSnapshots: async () => (await A.get()).docs.map(d => ({ id: d.id, ...d.data() })),
      putSnapshot: async (id, v) => A.doc(id).set(v, { merge: true }),
      getShare: async (id) => { const d = await db.collection('mirai_shares').doc(id).get(); return d.exists ? { id, ...d.data() } : null; },
      listShares: async () => (await db.collection('mirai_shares').get()).docs.map(d => { const { blob, ...r } = d.data(); return { id: d.id, ...r }; }),
      putShare: async (id, row) => db.collection('mirai_shares').doc(id).set({ ...row, updated_at: new Date().toISOString() }, { merge: true }),
      delShare: async (id) => db.collection('mirai_shares').doc(id).delete()
    };
    return cached;
  }
  const FILE = process.env.DATA_FILE || process.env.ALERTS_FILE || path.join(process.cwd(), 'data', 'mirai.json');
  const read = async () => { try { return JSON.parse(await fs.readFile(FILE, 'utf8')); } catch { return { integrations: {}, alerts: {} }; } };
  const write = async (d) => { await fs.mkdir(path.dirname(FILE), { recursive: true }); await fs.writeFile(FILE, JSON.stringify(d)); };
  cached = {
    kind: 'file',
    getIntegration: async (k) => { const d = await read(); return d.integrations?.[k] ? { kind: k, ...d.integrations[k] } : null; },
    allIntegrations: async () => Object.entries((await read()).integrations || {}).map(([kind, v]) => ({ kind, ...v })),
    putIntegration: async (k, row) => { const d = await read(); d.integrations = d.integrations || {}; d.integrations[k] = { ...row, updated_at: new Date().toISOString() }; await write(d); },
    delIntegration: async (k) => { const d = await read(); delete d.integrations?.[k]; await write(d); },
    allSnapshots: async () => Object.entries((await read()).alerts || {}).map(([id, v]) => ({ id, ...v })),
    putSnapshot: async (id, v) => { const d = await read(); d.alerts = d.alerts || {}; d.alerts[id] = { ...(d.alerts[id] || {}), ...v }; await write(d); },
    getShare: async (id) => { const d = await read(); return d.shares?.[id] ? { id, ...d.shares[id] } : null; },
    listShares: async () => Object.entries((await read()).shares || {}).map(([id, v]) => { const { blob, ...r } = v; return { id, ...r }; }),
    putShare: async (id, row) => { const d = await read(); d.shares = d.shares || {}; d.shares[id] = { ...(d.shares[id] || {}), ...row, updated_at: new Date().toISOString() }; await write(d); },
    delShare: async (id) => { const d = await read(); delete d.shares?.[id]; await write(d); }
  };
  return cached;
}
