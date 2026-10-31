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
