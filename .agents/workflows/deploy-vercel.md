# Despliegue en Vercel + Supabase

El proyecto de Vercel apunta a la carpeta **`server/`** (Root Directory = `server`).

1. `npm run build` (actualiza `server/public/index.html`) y haz commit.
2. Supabase: SQL Editor → ejecuta `server/supabase/schema.sql` (idempotente).
3. Vercel → Project Settings → Environment Variables: `MIRAI_TOKEN`, `ENCRYPTION_KEY` (`openssl rand -base64 32`, **no cambiar después**), `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STORE=supabase`, `ALLOWED_ORIGINS`.
4. Push a la rama principal → Vercel despliega. Verifica `GET /api/health` con el token.
5. En Mirai › Ajustes › Servidor y conexiones: URL + token → "Probar servidor". Luego configura correo, WhatsApp e IA.
6. Cron: `vercel.json` cada hora (Pro). En Hobby, una vez al día o cron externo a `/api/cron/send` con `Authorization: Bearer CRON_SECRET`.
