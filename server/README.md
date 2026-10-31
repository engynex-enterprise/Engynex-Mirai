# Mirai Server 2.1 — Vercel + Supabase

Servidor de Mirai: publica la app, guarda **cifradas** las integraciones (correo, WhatsApp, IA), envía los avisos programados y hace de proxy de IA. Las claves se configuran **desde la propia app** (Ajustes › Alertas y notificaciones / Inteligencia artificial) y quedan en tu base de datos, nunca en el navegador.

## Estructura
```
api/[...path].js     Función de Vercel (todas las rutas /api/*)
lib/core.js          Núcleo: rutas, correo, WhatsApp, IA, cron
lib/store.js         Almacenamiento: Supabase | Firestore | archivo
lib/crypto.js        AES-256-GCM para las claves guardadas
supabase/schema.sql  Tablas y RLS
public/index.html    La app Mirai
index.js             Modo Express (VPS, Docker, Cloud Run, Hostinger)
vercel.json          Salida estática + cron
```

## Despliegue en Vercel + Supabase (recomendado)
1. **Supabase** → New project → SQL Editor → pega `supabase/schema.sql` → Run (si ya lo habías ejecutado, vuelve a ejecutarlo: agrega la tabla `mirai_shares` del acceso del contador). Copia *Project URL* y la clave *service_role* (Project Settings › API).
2. Sube esta carpeta a un repositorio de **GitHub**.
3. **Vercel** → Add New › Project → importa el repo (Framework: *Other*). En *Environment Variables*:
   | Variable | Valor |
   |---|---|
   | `MIRAI_TOKEN` | token largo y secreto (lo pegas en Mirai) |
   | `ENCRYPTION_KEY` | `openssl rand -base64 32` — **no lo cambies después** o no se podrán leer las claves guardadas |
   | `CRON_SECRET` | otro secreto (Vercel lo envía como `Authorization: Bearer`) |
   | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | de Supabase |
   | `STORE` | `supabase` |
   | `ALLOWED_ORIGINS` | `*` o tu dominio |
4. Deploy. Abre `https://tu-proyecto.vercel.app`, ve a **Ajustes › Servidor y conexiones**, pega la dirección y el `MIRAI_TOKEN` → *Probar servidor*.
5. En **Alertas y notificaciones** elige Gmail, SendGrid, Resend o SMTP y llena sus datos; activa WhatsApp Cloud API si lo usas. En **Inteligencia artificial** guarda la clave de Claude, OpenAI o Gemini.

**Cron:** `vercel.json` lo programa cada hora (planes Pro). En el plan Hobby Vercel solo permite una ejecución diaria: cambia el horario a la hora del resumen (en UTC; 7:00 Colombia = `0 12 * * *`) o usa cron-job.org llamando `GET https://tu-app/api/cron/send` con el header `Authorization: Bearer <CRON_SECRET>`.

## Proveedores de correo
| Proveedor | Datos que pide Mirai |
|---|---|
| Gmail | correo, nombre del remitente, **contraseña de aplicación** (requiere verificación en 2 pasos) |
| SendGrid | remitente verificado, API key con permiso *Mail Send* |
| Resend | remitente (dominio verificado o `onboarding@resend.dev`), API key |
| SMTP | servidor, puerto, SSL, usuario, contraseña, remitente |

## API (todas con `Authorization: Bearer MIRAI_TOKEN`)
- `GET /api/health` — estado y qué está configurado
- `GET /api/integrations` — configuración con claves enmascaradas
- `PUT /api/integrations/:kind` — `email | whatsapp | ai_anthropic | ai_openai | ai_gemini` (`{...config, secrets:{...}}`; secretos vacíos conservan los guardados)
- `POST /api/integrations/:kind/test` — `{to}`
- `DELETE /api/integrations/:kind`
- `POST /api/notify`, `POST /api/ai`, `POST /api/alerts/snapshot`
- `GET /api/shares` · `PUT /api/shares/:id` · `DELETE /api/shares/:id` — accesos del contador (los datos llegan ya cifrados)
- Público (sin token): `GET /api/public/share/:id` y `POST /api/public/share/:id/notes` — portal del contador. La llave para descifrar viaja solo en el enlace (`#k=…`), nunca llega al servidor.
- `GET|POST /api/cron/send` — con `CRON_SECRET`

## Otros hostings
`npm install && npm start` (Node 20). Con `STORE=file` guarda en `data/mirai.json`; con `INTERNAL_CRON=1` ejecuta el cron cada hora sin servicio externo. Docker y Cloud Run: `Dockerfile` y `cloudbuild.yaml` incluidos.
