import { resetQaUser } from "./qa"

export default async function globalSetup() {
  try { process.loadEnvFile?.(".env.local") } catch { /* en CI las variables vienen del entorno */ }
  await resetQaUser()
}
