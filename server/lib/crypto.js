// Cifrado AES-256-GCM para las credenciales guardadas (claves de API, contraseñas SMTP, tokens).
import crypto from 'node:crypto';

function key() {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw) throw new Error('Falta ENCRYPTION_KEY en el servidor (32 bytes en base64 o una frase larga).');
  const b = Buffer.from(raw, 'base64');
  return b.length === 32 ? b : crypto.createHash('sha256').update(raw).digest();
}
export function encrypt(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join('.');
}
export function decrypt(s) {
  if (!s) return {};
  const [iv, tag, data] = s.split('.').map(x => Buffer.from(x, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
}
export const mask = v => (v ? '••••' + String(v).slice(-4) : '');
