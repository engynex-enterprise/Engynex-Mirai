# Desplegar Mirai en Vercel

1. Importa el repositorio en Vercel (Framework: Next.js, Root Directory: raíz).
2. Carga las variables en **Settings › Environment Variables** con el tipo correcto:

| Variable | Tipo en Vercel | Por qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Config** | Pública por diseño (la usa el navegador). Si Vercel avisa "Remove the public framework prefix…", elige *change the variable to Config*. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Config** | Clave publicable: la seguridad la dan las reglas RLS. |
| `NEXT_PUBLIC_SITE_URL` | **Config** | URL pública de la app (p. ej. `https://mirai.tudominio.co`). |
| `NEXT_PUBLIC_LEGAL_OWNER`, `_NIT`, `_EMAIL`, `_CITY` | **Config** | Datos del responsable (Ley 1581) que se muestran en la política. |
| `SUPABASE_SECRET_KEY` | **Sensitive** | Salta RLS: solo servidor. |
| `ENCRYPTION_KEY` | **Sensitive** | Cifra las claves de integraciones. **No cambiarla nunca.** |
| `CRON_SECRET` | **Sensitive** | Protege `/api/cron/*`. |
| `GOOGLE_CLIENT_ID` | Config | |
| `GOOGLE_CLIENT_SECRET` | **Sensitive** | |
| `AI_GATEWAY_API_KEY` | **Sensitive** | Vercel AI Gateway (requiere tarjeta registrada en Vercel). |
| `SUPABASE_DB_URL` | — (no subir) | Solo para `npm run db:migrate` en local. |

Nunca pongas el prefijo `NEXT_PUBLIC_` a un secreto: todo lo que lo lleva se incluye en el JavaScript del navegador.

3. Supabase › Authentication › URL Configuration: *Site URL* = tu dominio; *Redirect URLs* = `https://tu-dominio/auth/callback` y `https://tu-dominio/auth/confirm` (y las de `http://localhost:3000` para desarrollo).
4. Supabase › Authentication › Providers › Google: Client ID y Secret. En Google Cloud, URI de redirección `https://ofcuvjixvtdixcwzdzqa.supabase.co/auth/v1/callback`.
5. Supabase › Authentication › SMTP: configura un SMTP propio (p. ej. Resend) para que lleguen los correos de confirmación y enlace mágico.
6. Speed Insights: pestaña *Speed Insights* › *Enable* (el componente solo se monta en Vercel).
7. **Variables adicionales** (todas opcionales salvo VAPID si quieres push):

| Variable | Tipo en Vercel | Para qué |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Config | Notificaciones push (Web Push). Se genera con `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | **Sensitive** | Pareja privada de la anterior. |
| `VAPID_SUBJECT` | Config | `mailto:` de contacto del despliegue. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Config | Captcha invisible de Cloudflare en login y registro. Pega la *secret key* en Supabase › Auth › Bot and Abuse Protection. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Config / **Sensitive** | Límite de consultas de IA por hogar y hora (también se puede configurar en Ajustes › Integraciones). |
| `NEXT_PUBLIC_SENTRY_DSN` | Config | Reporte de errores con Sentry (solo se activa si existe). |

8. **Cron de avisos.** `vercel.json` ya programa `/api/cron/notify?daily=1` una vez al día (11:00 UTC = 6:00 a. m. Colombia); Vercel envía `Authorization: Bearer CRON_SECRET`. Para avisos a la hora exacta que elija cada persona, programa además el cron horario en Supabase (SQL Editor, una sola vez):
   ```sql
   select public.mirai_schedule_notify('https://tu-dominio', '<CRON_SECRET>');
   ```
   El mismo cron actualiza cada día la TRM, la tasa de usura y los festivos.
9. **Google (Gmail y Calendar).** En Google Cloud › Credenciales, al mismo cliente OAuth agrega la URI de redirección `https://tu-dominio/api/google/callback` (y `http://localhost:3000/api/google/callback` para desarrollo). Habilita *Gmail API* y *Google Calendar API* en el proyecto. Los permisos son `gmail.readonly` y `calendar.events`; mientras la app esté en modo "Prueba" en la pantalla de consentimiento, agrega los correos de prueba.
10. **Telegram.** Cada hogar crea su bot con @BotFather y pega el token en Ajustes › Integraciones › Telegram; cada persona vincula su chat en Ajustes › Alertas (no requiere webhook).
