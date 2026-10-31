import "server-only"
import { z } from "zod"

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  SUPABASE_SECRET_KEY: z.string().min(10),
  ENCRYPTION_KEY: z.string().min(32, "ENCRYPTION_KEY debe ser de 32 bytes en base64"),
  CRON_SECRET: z.string().min(16),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
})

export const env = schema.parse(process.env)
