import "server-only"
import { configureServices } from "@mirai/services/runtime"
import { loadBookData } from "@/lib/book-data"
import { decrypt, encrypt } from "@/lib/crypto"
import { publicSiteUrl, siteUrl } from "@/lib/site-url"
import { supabaseAdmin } from "@/lib/supabase/admin"

// Contexto de @mirai/services en la web (F2-E): el código de avisos, integraciones, Google y automatizaciones del
// servidor vive en packages/services y corre aquí con lo mismo de siempre (supabaseAdmin(), process.env, ENCRYPTION_KEY).
// Lo importan los archivos de lib/notify, lib/google*, lib/automations, lib/plan-server y features/integrations que
// re-exportan el paquete. La IA se carga solo cuando una automatización la usa.
configureServices({
  admin: supabaseAdmin,
  encrypt,
  decrypt,
  env: (name) => process.env[name],
  siteUrl,
  publicSiteUrl,
  loadBook: loadBookData,
  aiText: async (o) => (await import("@/lib/ai/run")).aiText({ ...o, feature: o.feature as never }),
})
